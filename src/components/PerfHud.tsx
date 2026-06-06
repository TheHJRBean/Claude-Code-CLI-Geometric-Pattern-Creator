import { useEffect, useRef, useState } from 'react'
import {
  readPerf,
  perfEnabled,
  setPerfEnabled,
  subscribePerf,
  periodicityEnabled,
  setPeriodicityEnabled,
} from '../utils/perf'

/**
 * Opt-in diagnostic overlay (see `utils/perf.ts`). In a dev build it always
 * mounts a tiny "perf" toggle pill (bottom-left); clicking it — or pressing
 * `Shift+P` — flips the HUD on/off live (no reload). It is never rendered in a
 * production build.
 *
 * When on it shows the last Builder regeneration's counts + PIC/Strand timings
 * plus live frame metrics so we can tell compute-bound from paint-bound
 * slowness:
 *   - high `pic`/`strand` ms           → compute-bound (periodicity-aware PIC, Lever A)
 *   - low ms but low fps / high worst   → paint-bound (viewBox repaint, Lever B)
 *
 * `fps` is the average over the last ~500 ms; `worst` is the longest single
 * frame in that window — the honest jank indicator, since a gesture can hold a
 * decent average while still hitching. Drag-test target: worst ≲ 20 ms (50 fps).
 *
 * Purely diagnostic; safe to delete with utils/perf.ts and its call sites.
 */
export function PerfHud() {
  // Only ever exists in dev. Vite statically replaces this, so the whole
  // component tree-shakes out of production bundles.
  if (!import.meta.env.DEV) return null
  return <PerfHudDev />
}

function PerfHudDev() {
  const [on, setOn] = useState(perfEnabled())
  // Re-render when the flag is toggled from elsewhere (hotkey / console).
  useEffect(() => subscribePerf(() => setOn(perfEnabled())), [])

  // Shift+P toggles the HUD anywhere except while typing in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
      if (!typing && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        setPerfEnabled(!perfEnabled())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!on) {
    return (
      <button
        type="button"
        onClick={() => setPerfEnabled(true)}
        title="Show performance HUD (Shift+P)"
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 20,
          padding: '3px 8px',
          font: '11px/1.4 ui-monospace, monospace',
          color: '#bbb',
          background: 'rgba(20,20,24,0.6)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        perf
      </button>
    )
  }
  return <PerfHudPanel onClose={() => setPerfEnabled(false)} />
}

function PerfHudPanel({ onClose }: { onClose: () => void }) {
  const [, force] = useState(0)
  // Frame-timing accumulator. `worst` is the longest frame within the window.
  const m = useRef({ fps: 0, worst: 0, frames: 0, t0: performance.now(), prev: performance.now() })

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const s = m.current
      const now = performance.now()
      const frameMs = now - s.prev
      s.prev = now
      s.frames++
      if (frameMs > s.worst) s.worst = frameMs
      const dt = now - s.t0
      if (dt >= 500) {
        s.fps = Math.round((s.frames * 1000) / dt)
        s.frames = 0
        s.t0 = now
        force(n => n + 1) // repaint the HUD ~2×/s with fresh numbers
        s.worst = 0 // reset the window's worst-frame each report
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const p = readPerf()
  const { fps, worst } = m.current
  const periodicity = periodicityEnabled()

  const row = (label: string, value: string | number, warn = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ color: warn ? '#ff8f8f' : undefined }}>{value}</span>
    </div>
  )

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        zIndex: 20,
        padding: '8px 10px',
        font: '11px/1.5 ui-monospace, monospace',
        color: '#eee',
        background: 'rgba(20,20,24,0.86)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        backdropFilter: 'blur(4px)',
        minWidth: 184,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
          opacity: 0.85,
        }}
      >
        <span style={{ letterSpacing: 0.5 }}>PERF</span>
        <button
          type="button"
          onClick={onClose}
          title="Hide HUD (Shift+P)"
          style={{
            font: '11px ui-monospace, monospace',
            color: '#ccc',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            padding: '0 5px',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
      {row('fps', fps || '—', fps > 0 && fps < 50)}
      {row('worst ms', worst.toFixed(1), worst > 20)}
      {row('phase', p.phase)}
      {row('polygons', p.polygons)}
      {row('ghosts', p.ghosts)}
      {row('stamps', p.stamps)}
      {row('segments', p.segments)}
      {row('pic ms', p.picMs.toFixed(1))}
      {row('strand ms', p.strandMs.toFixed(1))}
      <button
        type="button"
        onClick={() => setPeriodicityEnabled(!periodicity)}
        title="Toggle Lever A (periodicity fast-path) — reloads"
        style={{
          marginTop: 6,
          width: '100%',
          font: '11px ui-monospace, monospace',
          color: periodicity ? '#8fffa6' : '#ccc',
          background: periodicity ? 'rgba(40,90,50,0.5)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 4,
          padding: '3px 0',
          cursor: 'pointer',
        }}
      >
        Lever A: {periodicity ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}
