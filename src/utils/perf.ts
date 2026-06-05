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

/**
 * Lever A opt-in flag (off by default). When set, the Builder's Composition
 * phase renders ONE fundamental domain (runPIC + buildStrands over the base
 * patch only) tiled across the viewport via SVG `<use>`, instead of running
 * the whole pipeline over the stamped field every regeneration. Exact +
 * seamless only on a pure-translation lattice with no vertex-lines/frame, so
 * usePattern gates it to those cases and falls back otherwise. Enable with
 * `localStorage.perfPeriodicity = '1'` (or `?perfPeriodicity`) + reload.
 */
let periodicity: boolean | null = null
export function periodicityEnabled(): boolean {
  if (periodicity === null) {
    try {
      periodicity = localStorage.getItem('perfPeriodicity') === '1'
        || (typeof location !== 'undefined' && location.search.includes('perfPeriodicity'))
    } catch {
      periodicity = false
    }
  }
  return periodicity
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
