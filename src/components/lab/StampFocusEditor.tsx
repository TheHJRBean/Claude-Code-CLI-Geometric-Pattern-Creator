import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StampUserTransform, VoidStampRecord } from '../../types/editor'
import type { Vec2 } from '../../utils/math'
import {
  canonicalPose,
  fitImageRect,
  IDENTITY_USER_TRANSFORM,
  isIdentityUserTransform,
  poseBBox,
  userTransformMatrix,
} from '../../decoration/stamps'
import { polygonPath } from '../../rendering/svgGeometry'

/**
 * Stamp **Focus mode** — a full-screen editor for how an uploaded image sits
 * inside a Void shape. The shape is shown alone in its canonical pose, sized
 * to the window; the user pans (drag), zooms (scroll / slider) and rotates
 * (slider) the image, with the cropped-away overflow ghosted. Apply writes
 * the adjustment back to the stamp record in canonical coordinates, so every
 * congruent instance inherits it.
 */
export function StampFocusEditor({ record, outline, onApply, onClose }: {
  record: VoidStampRecord
  /** The selected Void's outline (straight `keyPolygon` preferred). */
  outline: Vec2[]
  onApply: (rec: VoidStampRecord) => void
  onClose: () => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [t, setT] = useState<StampUserTransform>(record.transform ?? IDENTITY_USER_TRANSFORM)
  const geo = useMemo(() => {
    const pose = canonicalPose(outline)
    if (!pose) return null
    const box = poseBBox(pose.points)
    if (!box || box.width <= 0 || box.height <= 0) return null
    return { points: pose.points, box, rect: fitImageRect(box, record.width, record.height, record.fit) }
  }, [outline, record.width, record.height, record.fit])

  // Drag = pan. Pointer capture on the SVG; deltas convert client px →
  // canonical units via the current uniform viewBox scale.
  const drag = useRef<{ id: number; x: number; y: number; perPx: number } | null>(null)

  // Wheel zoom needs a non-passive listener (React's onWheel can't
  // preventDefault), and Escape cancels.
  useEffect(() => {
    const svg = svgRef.current
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setT(prev => ({
        ...prev,
        scale: Math.min(20, Math.max(0.05, prev.scale * Math.exp(-e.deltaY * 0.0015))),
      }))
    }
    svg?.addEventListener('wheel', onWheel, { passive: false })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      svg?.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!geo) return null
  const { points, box, rect } = geo

  // The shape alone, fit to the window with breathing room.
  const pad = Math.max(box.width, box.height) * 0.18
  const vb = { x: box.x - pad, y: box.y - pad, w: box.width + 2 * pad, h: box.height + 2 * pad }
  const m = userTransformMatrix(box, t)
  const matrix = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`
  const shapeD = polygonPath(points)
  const guideW = Math.max(box.width, box.height) / 240

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || drag.current) return
    const r = svg.getBoundingClientRect()
    // preserveAspectRatio "meet": uniform scale = min(client/viewBox) → one
    // canonical unit per CSS px is the max of the two ratios.
    const perPx = Math.max(vb.w / r.width, vb.h / r.height)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, perPx }
    svg.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const dx = (e.clientX - d.x) * d.perPx
    const dy = (e.clientY - d.y) * d.perPx
    d.x = e.clientX
    d.y = e.clientY
    setT(prev => ({ ...prev, offsetX: prev.offsetX + dx / box.width, offsetY: prev.offsetY + dy / box.height }))
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

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
  const sliderRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)',
  }

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
          Stamp focus
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{record.key.slice(0, 8)}</span>
        <span style={{ fontSize: 11, marginLeft: 'auto' }}>
          Drag to move · Scroll to zoom · Esc to cancel
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ flex: 1, minHeight: 0, cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <clipPath id="stamp-focus-clip" clipPathUnits="userSpaceOnUse">
            <path d={shapeD} />
          </clipPath>
        </defs>
        {/* Ghost: the full image at low opacity so the crop is visible. */}
        <image
          href={record.image}
          x={rect.x} y={rect.y} width={rect.width} height={rect.height}
          preserveAspectRatio="none"
          transform={matrix}
          opacity={0.22}
        />
        <g clipPath="url(#stamp-focus-clip)">
          <image
            href={record.image}
            x={rect.x} y={rect.y} width={rect.width} height={rect.height}
            preserveAspectRatio="none"
            transform={matrix}
          />
        </g>
        <path
          d={shapeD}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={guideW}
          strokeDasharray={`${guideW * 4} ${guideW * 3}`}
          opacity={0.9}
        />
      </svg>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        padding: '12px 18px', borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}>
        <label style={sliderRow}>
          Zoom
          <input
            type="range" className="pattern-slider"
            min={-3} max={3} step={0.01}
            value={Math.log2(t.scale)}
            onChange={e => setT(prev => ({ ...prev, scale: Math.pow(2, Number(e.target.value)) }))}
            style={{ width: 140 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', minWidth: 44 }}>{(t.scale * 100).toFixed(0)}%</span>
        </label>
        <label style={sliderRow}>
          Rotation
          <input
            type="range" className="pattern-slider"
            min={-180} max={180} step={1}
            value={t.rotation}
            onChange={e => setT(prev => ({ ...prev, rotation: Number(e.target.value) }))}
            style={{ width: 140 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', minWidth: 40 }}>{t.rotation.toFixed(0)}°</span>
        </label>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button style={buttonStyle} onClick={() => setT(IDENTITY_USER_TRANSFORM)}>Reset</button>
          <button style={buttonStyle} onClick={onClose}>Cancel</button>
          <button
            style={{ ...buttonStyle, border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-bg)' }}
            onClick={() => {
              const rec = { ...record }
              if (isIdentityUserTransform(t)) delete rec.transform
              else rec.transform = t
              onApply(rec)
              onClose()
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
