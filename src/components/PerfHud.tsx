import { useEffect, useRef, useState } from 'react'
import { readPerf, perfEnabled } from '../utils/perf'

/**
 * Opt-in diagnostic overlay (see `utils/perf.ts`). Renders nothing unless
 * `localStorage.perf === '1'` (or `?perf` in the URL). Shows the last Builder
 * regeneration's counts + PIC/Strand timings and a live FPS meter so we can
 * tell compute-bound from paint-bound slowness:
 *   - high `pic`/`strand` ms  → compute-bound (periodicity-aware PIC lever)
 *   - low ms but low FPS while panning → paint-bound (viewBox repaint lever)
 *
 * Purely diagnostic; safe to delete with utils/perf.ts and its call sites.
 */
export function PerfHud() {
  const [, force] = useState(0)
  const fpsRef = useRef({ fps: 0, frames: 0, t0: performance.now() })

  useEffect(() => {
    if (!perfEnabled()) return
    let raf = 0
    const tick = () => {
      const s = fpsRef.current
      s.frames++
      const now = performance.now()
      const dt = now - s.t0
      if (dt >= 500) {
        s.fps = Math.round((s.frames * 1000) / dt)
        s.frames = 0
        s.t0 = now
        force(n => n + 1) // repaint the HUD ~2×/s with fresh numbers
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!perfEnabled()) return null
  const p = readPerf()
  const fps = fpsRef.current.fps
  const row = (label: string, value: string | number) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span>{value}</span>
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
        background: 'rgba(20,20,24,0.82)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        backdropFilter: 'blur(4px)',
        minWidth: 168,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {row('fps', fps || '—')}
      {row('phase', p.phase)}
      {row('polygons', p.polygons)}
      {row('ghosts', p.ghosts)}
      {row('stamps', p.stamps)}
      {row('segments', p.segments)}
      {row('pic ms', p.picMs.toFixed(1))}
      {row('strand ms', p.strandMs.toFixed(1))}
    </div>
  )
}
