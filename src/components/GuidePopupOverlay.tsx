import { useEffect, useRef, useState } from 'react'
import type { EditorGuide, EditorGuideCircle, EditorGuideLine, EditorGuidePatch, GuideExtend } from '../types/editor'
import { guideLineAngleDeg, GUIDE_COLOUR_STAMP, GUIDE_COLOUR_STATIC } from '../editor/guides'

/**
 * Per-Guide popup (spec Decision 10) — placement-picker-style floating
 * popover anchored over the selected Guide. Shared controls (stamp, ticks,
 * Accept / Cancel, delete) wrap a kind-specific block: lines get extend +
 * typed angle; circles get radius + size presets + n-division (spec Decision
 * 6/7).
 *
 * Edits dispatch immediately so the canvas previews live, but the popup
 * snapshots the Guide's editable fields at open: **Accept** keeps the edits,
 * **Cancel** restores the snapshot. Escape and outside-click count as Cancel
 * (explicit Accept commits). The parent keys this component by Guide id so
 * the snapshot resets per selection.
 */
interface Props {
  guide: EditorGuide
  position: { x: number; y: number }
  /** The Seed-Tile edge length (`patchTickEdgeLength`): the ×1 tick spacing and
   *  the unit the multiplier buttons + circle size presets are relative to. */
  defaultTickSpacing: number
  onUpdate: (patch: EditorGuidePatch) => void
  onDelete: () => void
  onClose: () => void
}

/** The fields the popup can change — snapshotted at open for Cancel. */
function editableFields(g: EditorGuide): EditorGuidePatch {
  if (g.kind === 'circle') {
    return {
      stamp: g.stamp,
      tickSpacing: g.tickSpacing,
      ticksEnabled: g.ticksEnabled,
      center: g.center,
      radius: g.radius,
      phase: g.phase,
      divisions: g.divisions,
    }
  }
  return {
    stamp: g.stamp,
    extend: g.extend,
    tickSpacing: g.tickSpacing,
    ticksEnabled: g.ticksEnabled,
    start: g.start,
    end: g.end,
  }
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
  background: 'var(--bg-input, #0c0c18)',
  color: 'var(--text)',
}

const presetButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '3px 0',
  fontFamily: "'EB Garamond', Georgia, serif",
  fontSize: 12,
  cursor: 'pointer',
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-muted)',
}

export function GuidePopupOverlay({ guide, position, defaultTickSpacing, onUpdate, onDelete, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Snapshot of the editable fields at open — Cancel restores this. A ref,
  // captured once per mount (parent keys the popup by Guide id).
  const originalRef = useRef(editableFields(guide))

  const accept = onClose
  const cancel = () => {
    onUpdate(originalRef.current)
    onClose()
  }
  // Refs so the window listeners (bound once) always see the live guide.
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelRef.current()
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && dialogRef.current && dialogRef.current.contains(target)) return
      cancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  const tickSpacingLabel = guide.kind === 'circle' ? 'Arc spacing' : 'Tick spacing'
  // Spacing is expressed as a whole multiple of the Seed-Tile edge length so
  // Anchors land on the tessellation grid (Guides feedback 2026-07-22). No
  // override ⇒ ×1; a legacy absolute value snaps to its nearest multiple for
  // the highlight and normalises on the next click.
  const tickMultiple = Math.max(1, Math.round((guide.tickSpacing ?? defaultTickSpacing) / defaultTickSpacing))

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
        // Theme tokens (styles.css defines --bg-elevated / --bg-input etc.;
        // there is NO --bg var — a --bg fallback lands on the wrong theme).
        background: 'var(--bg-elevated, #161620)',
        border: '1px solid var(--border-accent, var(--accent))',
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0,0,0,0.2)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ ...labelStyle, fontSize: 10, color: 'var(--text)' }}>
        {guide.kind === 'circle' ? (guide.divisions ? 'Divided circle' : 'Guide circle') : 'Guide line'}
      </div>

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

      {guide.kind === 'circle'
        ? <CircleControls guide={guide} edgeLength={defaultTickSpacing} onUpdate={onUpdate} />
        : <LineControls guide={guide} onUpdate={onUpdate} />}

      {/* Tick / arc spacing as a multiple of the Seed-Tile edge length, so
          Anchors land on the tessellation grid (circles measure along the
          arc). ×1 tracks the edge length live; ×2–×4 pin an absolute multiple.
          Lines pair it with typed angle inside LineControls. */}
      <div>
        <div style={labelStyle}>{tickSpacingLabel}</div>
        <div style={{ display: 'flex', gap: 0, marginTop: 3 }}>
          {[1, 2, 3, 4].map(k => {
            const active = tickMultiple === k
            return (
              <button
                key={k}
                onClick={() => onUpdate({ tickSpacing: k === 1 ? undefined : k * defaultTickSpacing })}
                title={`${k}× the tile edge length (${Math.round(k * defaultTickSpacing)} units)`}
                style={{
                  ...presetButtonStyle,
                  background: active ? 'var(--accent-bg, rgba(230,201,122,0.18))' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                ×{k}
              </button>
            )
          })}
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

      {/* Accept commits the previewed edits; Cancel restores the state the
          Guide had when the popup opened. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button
          onClick={accept}
          style={{
            flex: 1,
            padding: '5px 0',
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            border: '1px solid var(--border-accent, var(--accent))',
            background: 'var(--accent-bg, rgba(201,148,58,0.12))',
            color: 'var(--text)',
          }}
        >
          Accept
        </button>
        <button
          onClick={cancel}
          style={{
            flex: 1,
            padding: '5px 0',
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--text-muted)',
          }}
        >
          Cancel
        </button>
      </div>
      <button
        onClick={onDelete}
        style={{
          padding: '4px 0',
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          border: '1px solid var(--border-subtle)',
          background: 'transparent',
          color: '#c25b5b',
        }}
      >
        Delete guide
      </button>
    </div>
  )
}

/* ── Line-specific controls: extend + typed angle ───────────────────────── */

function LineControls({ guide, onUpdate }: { guide: EditorGuideLine; onUpdate: (p: EditorGuidePatch) => void }) {
  // Typed angle is buffered locally so partial input ("4" en route to "45")
  // doesn't spin the line; commit on blur / Enter.
  const [angleText, setAngleText] = useState(() => guideLineAngleDeg(guide).toFixed(1))
  useEffect(() => {
    setAngleText(guideLineAngleDeg(guide).toFixed(1))
  }, [guide])

  const commitAngle = () => {
    const deg = Number(angleText)
    if (!Number.isFinite(deg)) {
      setAngleText(guideLineAngleDeg(guide).toFixed(1))
      return
    }
    if (Math.abs(deg - guideLineAngleDeg(guide)) < 1e-9) return
    // Rotate end about start preserving length.
    const r = Math.hypot(guide.end.x - guide.start.x, guide.end.y - guide.start.y)
    const rad = (deg * Math.PI) / 180
    onUpdate({ end: { x: guide.start.x + r * Math.cos(rad), y: guide.start.y + r * Math.sin(rad) } })
  }

  return (
    <>
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

      {/* Typed angle. */}
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
    </>
  )
}

/* ── Circle-specific controls: radius + size presets + n-division ───────── */

function CircleControls({ guide, edgeLength, onUpdate }: { guide: EditorGuideCircle; edgeLength: number; onUpdate: (p: EditorGuidePatch) => void }) {
  // Radius buffered locally like the line angle so partial typing doesn't
  // collapse the circle; commit on blur / Enter.
  const [radiusText, setRadiusText] = useState(() => guide.radius.toFixed(1))
  useEffect(() => {
    setRadiusText(guide.radius.toFixed(1))
  }, [guide])

  const setRadius = (r: number) => {
    if (Number.isFinite(r) && r > 0) onUpdate({ radius: r })
  }
  const commitRadius = () => {
    const r = Number(radiusText)
    if (!Number.isFinite(r) || !(r > 0)) {
      setRadiusText(guide.radius.toFixed(1))
      return
    }
    setRadius(r)
  }

  const presets: { label: string; title: string; apply: () => void }[] = [
    { label: '×√2', title: 'Grow the radius by √2 (the classic construction step)', apply: () => setRadius(guide.radius * Math.SQRT2) },
    { label: '÷√2', title: 'Shrink the radius by √2', apply: () => setRadius(guide.radius / Math.SQRT2) },
    { label: '= edge', title: 'Set the radius to the Patch tile edge length', apply: () => setRadius(edgeLength) },
    { label: '2·edge', title: 'Set the radius to twice the tile edge length', apply: () => setRadius(2 * edgeLength) },
  ]

  return (
    <>
      {/* Radius (free sizing). */}
      <div>
        <div style={labelStyle}>Radius</div>
        <input
          type="number"
          min={1}
          step={1}
          value={radiusText}
          onChange={e => setRadiusText(e.target.value)}
          onBlur={commitRadius}
          onKeyDown={e => { if (e.key === 'Enter') commitRadius() }}
          style={{ ...inputStyle, marginTop: 3 }}
        />
      </div>

      {/* Size presets (spec Decision 7): √2 progression + tile-edge relative. */}
      <div>
        <div style={labelStyle}>Size preset</div>
        <div style={{ display: 'flex', gap: 0, marginTop: 3 }}>
          {presets.map(p => (
            <button key={p.label} onClick={p.apply} title={p.title} style={presetButtonStyle}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* n-division (spec Decision 6): n → 2n rim Anchors; 0 → plain circle. */}
      <div>
        <div style={labelStyle}>Divisions n</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <input
            type="number"
            min={0}
            step={1}
            value={guide.divisions ?? 0}
            onChange={e => {
              const n = Math.round(Number(e.target.value))
              if (!Number.isFinite(n)) return
              onUpdate(n >= 1 ? { divisions: n } : { divisions: undefined })
            }}
            style={inputStyle}
          />
          <span style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 12, color: 'var(--text-muted)' }}>
            {guide.divisions ? `${2 * guide.divisions} anchors` : 'plain'}
          </span>
        </div>
      </div>
    </>
  )
}
