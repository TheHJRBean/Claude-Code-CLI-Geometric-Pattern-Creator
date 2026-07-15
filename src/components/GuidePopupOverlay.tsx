import { useEffect, useRef, useState } from 'react'
import type { EditorGuideLine, GuideExtend } from '../types/editor'
import { guideLineAngleDeg, GUIDE_COLOUR_STAMP, GUIDE_COLOUR_STATIC } from '../editor/guides'

/**
 * Per-Guide popup (spec Decision 10) — placement-picker-style floating
 * popover anchored over the selected Guide: stamp toggle, extend, tick
 * spacing, typed angle, delete. Closes on Escape or outside-click.
 *
 * All edits dispatch immediately (live), one field per action — the history
 * layer coalesces repeats per Guide.
 */
interface Props {
  guide: EditorGuideLine
  position: { x: number; y: number }
  /** Default tick spacing shown when the Guide has no override. */
  defaultTickSpacing: number
  onUpdate: (patch: Partial<Omit<EditorGuideLine, 'id' | 'kind'>>) => void
  onDelete: () => void
  onClose: () => void
}

const EXTEND_OPTIONS: { value: GuideExtend; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'start', label: '⟵' },
  { value: 'end', label: '⟶' },
  { value: 'both', label: '⟷' },
]

const labelStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const inputStyle: React.CSSProperties = {
  width: 64,
  padding: '3px 6px',
  fontFamily: "'EB Garamond', Georgia, serif",
  fontSize: 13,
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text)',
}

export function GuidePopupOverlay({ guide, position, defaultTickSpacing, onUpdate, onDelete, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Typed angle is buffered locally so partial input ("4" en route to "45")
  // doesn't spin the line; commit on blur / Enter.
  const [angleText, setAngleText] = useState(() => guideLineAngleDeg(guide).toFixed(1))
  useEffect(() => {
    setAngleText(guideLineAngleDeg(guide).toFixed(1))
  }, [guide])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && dialogRef.current && dialogRef.current.contains(target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onClose])

  const commitAngle = () => {
    const deg = Number(angleText)
    if (!Number.isFinite(deg)) {
      setAngleText(guideLineAngleDeg(guide).toFixed(1))
      return
    }
    if (Math.abs(deg - guideLineAngleDeg(guide)) < 1e-9) return
    // Rotate end about start preserving length — the popup import stays tiny
    // by computing here instead of pulling withGuideLineAngle's caller chain.
    const r = Math.hypot(guide.end.x - guide.start.x, guide.end.y - guide.start.y)
    const rad = (deg * Math.PI) / 180
    onUpdate({ end: { x: guide.start.x + r * Math.cos(rad), y: guide.start.y + r * Math.sin(rad) } })
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Guide settings"
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, calc(-100% - 14px))',
        minWidth: 230,
        maxWidth: 'calc(100vw - 32px)',
        padding: '10px 12px',
        background: 'var(--bg, #f5f0e8)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.22)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ ...labelStyle, fontSize: 10, color: 'var(--text)' }}>Guide line</div>

      {/* Stamp toggle — colour IS the stamp state (spec Decision 2). */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 13, color: 'var(--text)' }}>
        <input
          type="checkbox"
          checked={guide.stamp}
          onChange={e => onUpdate({ stamp: e.target.checked })}
        />
        Stamp with Lattice
        <span
          title={guide.stamp ? 'Stamping — repeats in every Lattice stamp' : 'One-off — world-space only'}
          style={{
            width: 10, height: 10, borderRadius: '50%',
            background: guide.stamp ? GUIDE_COLOUR_STAMP : GUIDE_COLOUR_STATIC,
            display: 'inline-block',
          }}
        />
      </label>

      {/* Extend — none / back / forward / both. */}
      <div>
        <div style={labelStyle}>Extend</div>
        <div style={{ display: 'flex', gap: 0, marginTop: 3 }}>
          {EXTEND_OPTIONS.map(opt => {
            const active = guide.extend === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onUpdate({ extend: opt.value })}
                title={opt.value === 'none' ? 'Just the drawn segment' : `Extend ${opt.value === 'both' ? 'both directions' : `beyond the ${opt.value} point`}`}
                style={{
                  flex: 1,
                  padding: '3px 0',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12,
                  cursor: 'pointer',
                  border: '1px solid var(--border-subtle)',
                  background: active ? 'var(--accent-bg, rgba(230,201,122,0.18))' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tick spacing + typed angle. */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div>
          <div style={labelStyle}>Tick spacing</div>
          <input
            type="number"
            min={1}
            step={1}
            value={guide.tickSpacing ?? defaultTickSpacing}
            onChange={e => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v > 0) onUpdate({ tickSpacing: v })
            }}
            style={{ ...inputStyle, marginTop: 3 }}
          />
        </div>
        <div>
          <div style={labelStyle}>Angle °</div>
          <input
            type="number"
            step={1}
            value={angleText}
            onChange={e => setAngleText(e.target.value)}
            onBlur={commitAngle}
            onKeyDown={e => { if (e.key === 'Enter') commitAngle() }}
            style={{ ...inputStyle, marginTop: 3 }}
          />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 12.5, color: 'var(--text-muted)' }}>
        <input
          type="checkbox"
          checked={guide.ticksEnabled !== false}
          onChange={e => onUpdate({ ticksEnabled: e.target.checked })}
        />
        Show ticks
      </label>

      <button
        onClick={onDelete}
        style={{
          marginTop: 2,
          padding: '4px 0',
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          border: '1px solid var(--border-subtle)',
          background: 'transparent',
          color: '#a33',
        }}
      >
        Delete guide
      </button>
    </div>
  )
}
