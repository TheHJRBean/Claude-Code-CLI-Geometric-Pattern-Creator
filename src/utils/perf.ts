/**
 * Lightweight, opt-in performance instrumentation for the Builder pipeline.
 *
 * Disabled by default — enable by running `localStorage.perf = '1'` in the
 * browser console (or appending `?perf` to the URL) and reloading. When off,
 * `recordPerf` is a cheap no-op and nothing renders.
 *
 * Purpose: tell compute-bound slowness (large `picMs` / `strandMs`) apart from
 * paint-bound slowness (low FPS while `picMs` ≈ 0) so we pick the right perf
 * lever — periodicity-aware PIC vs. moving pan/zoom off the SVG viewBox.
 * This is a diagnostic; it carries no product behaviour and is safe to delete.
 */
export interface PerfSample {
  phase: string
  /** Polygons fed to PIC this regeneration (stamped field in Composition). */
  polygons: number
  /** Neighbour-ghost polygons built this regeneration (Design + neighbours). */
  ghosts: number
  /** Lattice stamps spanning the viewport (Composition / neighbour preview). */
  stamps: number
  /** Emitted Ray segments. */
  segments: number
  /** Milliseconds spent in `runPIC` during THIS regeneration (0 when reused). */
  picMs: number
  /** Milliseconds spent chaining Strands (`buildStrands`). */
  strandMs: number
  /** `performance.now()` of the last update. */
  at: number
}

let enabled: boolean | null = null
export function perfEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem('perf') === '1'
        || (typeof location !== 'undefined' && location.search.includes('perf'))
    } catch {
      enabled = false
    }
  }
  return enabled
}

const perfListeners = new Set<() => void>()
/** Subscribe to runtime enabled/disabled toggles. Returns an unsubscribe fn. */
export function subscribePerf(fn: () => void): () => void {
  perfListeners.add(fn)
  return () => {
    perfListeners.delete(fn)
  }
}

/**
 * Flip the HUD on/off at runtime (no reload). Updates the cached flag so
 * `recordPerf` starts/stops feeding samples on the next regeneration, persists
 * the choice to localStorage, and notifies subscribers (the HUD) to re-render.
 * Used by the in-app dev toggle in `PerfHud`.
 */
export function setPerfEnabled(on: boolean): void {
  enabled = on
  try {
    if (on) localStorage.setItem('perf', '1')
    else localStorage.removeItem('perf')
  } catch {
    /* ignore storage failures */
  }
  perfListeners.forEach(fn => fn())
}

/**
 * Lever A — DEFAULT ON (verified 2026-06-06: turns a 15fps / 64ms-PIC
 * Composition pan into a smooth 60fps with pic/strand ms ≈ 0). When active the
 * Builder's Composition phase renders ONE fundamental domain (runPIC +
 * buildStrands over the base patch only) tiled across the viewport via SVG
 * `<use>`, instead of running the whole pipeline over the stamped field every
 * regeneration. Exact + seamless only on a pure-translation lattice with no
 * vertex-lines/frame, so usePattern gates it to those cases and falls back
 * otherwise (the gate set is proven equal to full-field PIC by
 * `compositionPeriodicity.test.ts`).
 *
 * CAVEAT: when the fast-path engages, `usePattern` returns ONE fundamental
 * domain for `polygons`/`segments` (the full field is `<use>` clones in the
 * DOM). Consumers that need the whole field must read the DOM (`exportSVG`) —
 * NOT `segmentsRef.current` (which would emit a single unit cell). See the
 * guard at `Canvas.tsx` where `segmentsRef` is assigned.
 *
 * Opt OUT with `localStorage.perfPeriodicity = '0'` (or `?perfPeriodicityOff`)
 * + reload — the HUD's "Lever A" button does this for A/B comparison.
 */
let periodicity: boolean | null = null
export function periodicityEnabled(): boolean {
  if (periodicity === null) {
    try {
      const off = localStorage.getItem('perfPeriodicity') === '0'
        || (typeof location !== 'undefined' && location.search.includes('perfPeriodicityOff'))
      periodicity = !off
    } catch {
      periodicity = true
    }
  }
  return periodicity
}

/**
 * Persist the Lever A flag and reload. Because the flag gates geometry
 * generation (read once + cached, used deep in `usePattern`), a clean reload is
 * the safe way to flip it — used by the HUD's "Lever A" toggle button so the
 * user can A/B compare without touching the console.
 */
export function setPeriodicityEnabled(on: boolean): void {
  try {
    // Default is ON, so OFF must be persisted explicitly as '0' (not removed).
    localStorage.setItem('perfPeriodicity', on ? '1' : '0')
  } catch {
    /* ignore storage failures */
  }
  if (typeof location !== 'undefined') location.reload()
}

let last: PerfSample = {
  phase: '—', polygons: 0, ghosts: 0, stamps: 0, segments: 0, picMs: 0, strandMs: 0, at: 0,
}

/** Merge a partial sample into the latest reading. No-op when disabled. */
export function recordPerf(p: Partial<PerfSample>): void {
  if (!perfEnabled()) return
  last = { ...last, ...p, at: performance.now() }
}

export function readPerf(): PerfSample {
  return last
}
