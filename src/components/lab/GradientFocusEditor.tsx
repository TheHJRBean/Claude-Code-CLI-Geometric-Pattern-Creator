import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GradientSpec } from '../../types/editor'
import type { Vec2 } from '../../utils/math'
import { canonicalPose, poseBBox } from '../../decoration/stamps'
import { seedGradientSpec } from '../../decoration/gradients'
import { polygonPath } from '../../rendering/svgGeometry'
import { ColourPicker } from '../ColourPicker'
import { GradientStopBar } from './GradientStopBar'

/**
 * Gradient **focus editor** (#44, `StampFocusEditor` pattern) — a full-screen
 * editor for a Void group's gradient. The shape is shown alone in its
 * canonical pose, live-filled with the gradient; draggable handles move the
 * linear start/end axis or the radial centre/radius, and the stop bar +
 * colour picker edit the stops. All edits stay in canonical coordinates, so
 * Apply replicates them to every congruent instance exactly like stamp
 * placement (the canonical pose handles mirrored instances).
 */
export function GradientFocusEditor({ spec, outline, title, onApply, onClose }: {
  spec: GradientSpec
  /** The selected Void's outline (straight `keyPolygon` preferred). */
  outline: Vec2[]
  /** Header label (shape signature). */
  title: string
  onApply: (spec: GradientSpec) => void
  onClose: () => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<GradientSpec>(spec)
  const [selectedStop, setSelectedStop] = useState(0)
  const geo = useMemo(() => {
    const pose = canonicalPose(outline)
    if (!pose) return null
    const box = poseBBox(pose.points)
    if (!box || box.width <= 0 || box.height <= 0) return null
    return { points: pose.points, box }
  }, [outline])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Which handle a drag is moving: linear start/end, radial centre/radius.
  const drag = useRef<{ id: number; handle: 'start' | 'end' | 'centre' | 'radius' } | null>(null)

  if (!geo) return null
  const { points, box } = geo
  const pad = Math.max(box.width, box.height) * 0.18
  const vb = { x: box.x - pad, y: box.y - pad, w: box.width + 2 * pad, h: box.height + 2 * pad }
  const shapeD = polygonPath(points)
  const guideW = Math.max(box.width, box.height) / 240
  const handleR = Math.max(box.width, box.height) / 36

  const toCanonical = (e: React.PointerEvent): Vec2 | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: pt.x, y: pt.y }
  }

  const startDrag = (handle: NonNullable<typeof drag.current>['handle']) =>
    (e: React.PointerEvent<SVGCircleElement>) => {
      e.stopPropagation()
      drag.current = { id: e.pointerId, handle }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const p = toCanonical(e)
    if (!p) return
    setDraft(prev => {
      if (prev.type === 'linear') {
        if (d.handle === 'start') return { ...prev, start: p }
        if (d.handle === 'end') return { ...prev, end: p }
        return prev
      }
      if (d.handle === 'centre') return { ...prev, centre: p }
      if (d.handle === 'radius') {
        const r = Math.hypot(p.x - prev.centre.x, p.y - prev.centre.y)
        return r > 1e-6 ? { ...prev, radius: r } : prev
      }
      return prev
    })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  const setType = (type: GradientSpec['type']) => {
    if (type === draft.type) return
    const seeded = seedGradientSpec(type, draft.stops, outline)
    if (seeded) setDraft(seeded)
  }

  const stops = draft.stops
  const stopColour = selectedStop >= 0 && selectedStop < stops.length ? stops[selectedStop].colour : stops[0].colour

  const buttonStyle: React.CSSProperties = {
    padding: '6px 14px',
    fontFamily: 'var(--font-display)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    border: '1px solid var(--border-subtle)',
    background: 'transparent',
    color: 'var(--text-secondary)',
  }
  const segStyle = (active: boolean): React.CSSProperties => ({
    ...buttonStyle,
    ...(active ? { border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-bg)' } : null),
  })

  const gradientDef = draft.type === 'linear'
    ? (
      <linearGradient
        id="gradient-focus-def"
        gradientUnits="userSpaceOnUse"
        x1={draft.start.x} y1={draft.start.y} x2={draft.end.x} y2={draft.end.y}
      >
        {stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.colour} />)}
      </linearGradient>
    )
    : (
      <radialGradient
        id="gradient-focus-def"
        gradientUnits="userSpaceOnUse"
        cx={draft.centre.x} cy={draft.centre.y} r={draft.radius}
      >
        {stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.colour} />)}
      </radialGradient>
    )

  const handles = draft.type === 'linear'
    ? (
      <>
        <line
          x1={draft.start.x} y1={draft.start.y} x2={draft.end.x} y2={draft.end.y}
          stroke="var(--accent)" strokeWidth={guideW} strokeDasharray={`${guideW * 3} ${guideW * 2}`}
          pointerEvents="none"
        />
        <circle
          cx={draft.start.x} cy={draft.start.y} r={handleR}
          fill="#fff" stroke="var(--accent)" strokeWidth={guideW * 2}
          style={{ cursor: 'move' }}
          onPointerDown={startDrag('start')}
        />
        <circle
          cx={draft.end.x} cy={draft.end.y} r={handleR}
          fill="var(--accent)" stroke="#fff" strokeWidth={guideW * 2}
          style={{ cursor: 'move' }}
          onPointerDown={startDrag('end')}
        />
      </>
    )
    : (
      <>
        <circle
          cx={draft.centre.x} cy={draft.centre.y} r={draft.radius}
          fill="none" stroke="var(--accent)" strokeWidth={guideW}
          strokeDasharray={`${guideW * 3} ${guideW * 2}`} pointerEvents="none"
        />
        <circle
          cx={draft.centre.x} cy={draft.centre.y} r={handleR}
          fill="#fff" stroke="var(--accent)" strokeWidth={guideW * 2}
          style={{ cursor: 'move' }}
          onPointerDown={startDrag('centre')}
        />
        <circle
          cx={draft.centre.x + draft.radius} cy={draft.centre.y} r={handleR}
          fill="var(--accent)" stroke="#fff" strokeWidth={guideW * 2}
          style={{ cursor: 'ew-resize' }}
          onPointerDown={startDrag('radius')}
        />
      </>
    )

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(4, 4, 10, 0.88)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12,
        padding: '12px 18px', color: 'var(--text-secondary)',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)',
        }}>
          Gradient focus
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{title.slice(0, 8)}</span>
        <span style={{ fontSize: 11, marginLeft: 'auto' }}>
          Drag the handles to shape the gradient · Esc to cancel
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ flex: 1, minHeight: 0, touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>{gradientDef}</defs>
        <path d={shapeD} fill="url(#gradient-focus-def)" stroke="none" />
        <path
          d={shapeD}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={guideW}
          strokeDasharray={`${guideW * 4} ${guideW * 3}`}
          opacity={0.9}
        />
        {handles}
      </svg>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap',
        padding: '12px 18px', borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['linear', 'radial'] as const).map(t => (
            <button key={t} style={segStyle(draft.type === t)} onClick={() => setType(t)}>
              {t === 'linear' ? 'Linear' : 'Radial'}
            </button>
          ))}
        </div>
        <div style={{ width: 260 }}>
          <GradientStopBar
            stops={stops}
            selected={selectedStop}
            onSelect={setSelectedStop}
            onChange={s => setDraft(prev => ({ ...prev, stops: s }))}
          />
        </div>
        <div style={{ width: 230 }}>
          <ColourPicker
            value={stopColour}
            onChange={c => setDraft(prev => ({
              ...prev,
              stops: prev.stops.map((s, i) => (i === selectedStop ? { ...s, colour: c } : s)),
            }))}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button
            style={buttonStyle}
            onClick={() => {
              const seeded = seedGradientSpec(draft.type, draft.stops, outline)
              if (seeded) setDraft(seeded)
            }}
          >
            Reset geometry
          </button>
          <button style={buttonStyle} onClick={onClose}>Cancel</button>
          <button
            style={{ ...buttonStyle, border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-bg)' }}
            onClick={() => { onApply(draft); onClose() }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
