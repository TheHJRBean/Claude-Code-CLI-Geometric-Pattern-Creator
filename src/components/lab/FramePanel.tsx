import type { FrameConfig, FrameType, FrameShape } from '../../types/editor'
import type { Vec2 } from '../../utils/math'
import { DEFAULT_FRAME_SIZE, MIN_FRAME_SIZE, MAX_FRAME_SIZE, SQRT2 } from '../../editor/frame'
import { DEFAULT_FRAME_RINGS, MIN_FRAME_RINGS, MAX_FRAME_RINGS } from '../../editor/frameNRing'
import { useRef, useState } from 'react'
import { FieldLabel, NumberStepper, NudgePad, SectionTitle } from './labShared'

/** Frame origin nudge range (matches the X/Y slider extents). */
const FRAME_ORIGIN_RANGE = 800
/** Reset-to-default Shape-frame geometry (shape preserved; origin supplied by
 *  the caller — see `newFrameOrigin`). */
const SHAPE_FRAME_DEFAULTS = { size: DEFAULT_FRAME_SIZE, aspect: 1, rotation: 0 }

const resetBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 0',
  marginBottom: 10,
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
}

/**
 * Frame overlay controls in the Lab sidebar — a persistent bounded-region
 * overlay present across phases. Offers Shape (parametric) and n-Ring frame
 * types and their geometry sliders. Extracted from `EditorDesignControls`.
 *
 * Substrate-agnostic (2026-08-03): the Builder passes `editor.frame` +
 * `SET_FRAME`, a **legacy substrate** (Gallery preset / Generator sample / any
 * view-only tiling in the Lab) passes the top-level `config.frame` +
 * `SET_GALLERY_FRAME`. The legacy variant is clip-only — there is no Patch, so
 * no n-Ring lattice and no completion-to-frame — so its Frames are created with
 * `boundaryTreatment: 'clip'` and it hides the type row and the frame-tile
 * controls. Everything else (shape / size / ratio / angle / origin) is shared,
 * because `frameOutlinePolygon` is the same geometry on both paths.
 */
export function FramePanel({
  substrate,
  frame,
  onSetFrame,
  nRingSupported = false,
  newFrameOrigin,
}: {
  substrate: 'patch' | 'legacy'
  /** The Frame in force, from whichever home this substrate keeps it in. */
  frame: FrameConfig | undefined
  /** Write it back there; `null` removes the Frame. */
  onSetFrame: (f: FrameConfig | null) => void
  /** Whether this substrate can offer an n-Ring Frame at all (Patch only). */
  nRingSupported?: boolean
  /**
   * Where a **newly created / reset / recentred** Shape Frame is centred, in
   * world coordinates. A Patch omits it: (0, 0) is the seed Patch centre, which
   * is both meaningful and always on screen. A **legacy substrate** has no Patch
   * — the field is infinite and (0, 0) is wherever the generator happened to
   * seed — so it passes the live view centre. Without that, creating a Frame
   * while panned away clips the whole visible field out and the canvas goes
   * blank (fills and stamps included). Returns null when unavailable ⇒ (0, 0).
   */
  newFrameOrigin?: () => Vec2 | null
}) {
  const isPatch = substrate === 'patch'
  /** Origin for a Frame the user is creating, resetting or recentring now. */
  const freshOrigin = (): Vec2 => newFrameOrigin?.() ?? { x: 0, y: 0 }
  // Frame — update a Frame geometry field. Geometry changes move the frame
  // nodes, so clear `completedTiles` (frame-scoped completions are anchored to
  // the old outline; the user re-completes against the new edge).
  const updateFrameGeom = (partial: Partial<FrameConfig>) => {
    if (!frame) return
    onSetFrame({ ...frame, ...partial, completedTiles: [] })
  }
  // The X/Y sliders below are absolute world coordinates spanning ±this. A
  // view-centred Frame can sit thousands of units out, and a slider that can't
  // reach its own value snaps the Frame back inside the range on first touch —
  // so widen the span to cover wherever the Frame actually is. Monotonic: were
  // it to shrink as the user drags back toward the origin, the track would move
  // under the thumb mid-gesture.
  const originSpanRef = useRef(FRAME_ORIGIN_RANGE)
  originSpanRef.current = Math.max(
    originSpanRef.current,
    Math.abs(frame?.origin?.x ?? 0),
    Math.abs(frame?.origin?.y ?? 0),
  )
  const originSpan = originSpanRef.current
  const clampOrigin = (n: number) => Math.min(originSpan, Math.max(-originSpan, n))
  /** Boundary treatment a newly created Shape Frame gets on this substrate. */
  const newShapeTreatment = isPatch ? 'complete' as const : 'clip' as const
  // Collapse the whole panel once a Frame exists, so its tall control stack can
  // be tucked away without removing the Frame. The chevron only appears once a
  // Frame is opened (`hasFrame`); with no Frame the body is just the two create
  // buttons, so a persisted `collapsed` stays dormant rather than hiding them
  // behind a chevron that isn't rendered. Persisted so the choice survives
  // leaving/re-entering the Lab (mirrors the sidebar section-collapse memory).
  const hasFrame = !!frame
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('lab-frame-collapsed') === '1' } catch { return false }
  })
  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev
    try { localStorage.setItem('lab-frame-collapsed', next ? '1' : '0') } catch { /* ignore */ }
    return next
  })
  const isCollapsed = hasFrame && collapsed
  return (
    <div style={{ marginTop: 0, marginBottom: 14 }}>
      <SectionTitle
        open={!isCollapsed}
        onToggle={hasFrame ? toggleCollapsed : undefined}
        tooltip={isPatch
          ? "A persistent bounded region the pattern clips to. In Complete mode, the frame's edge nodes are clickable targets so you can complete tiles out to the edge. Shape = parametric outline; n-Ring = whole-patch shells (clip-only)."
          : 'A persistent bounded region the pattern clips to — a parametric outline (square / hexagon / octagon) you size, stretch, turn and place.'}
      >
        Frame
      </SectionTitle>
      {!isCollapsed && (<>
      <div style={{
        padding: '8px 10px',
        marginBottom: 10,
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 12,
        color: 'var(--text-muted)',
        lineHeight: 1.45,
        border: '1px solid var(--border-subtle)',
      }}>
        {isPatch ? (<>
          A <strong>Frame</strong> bounds the pattern — it's clipped to the
          outline. Switch to <strong>Complete</strong> mode and the frame's
          edge <strong>nodes</strong> become clickable: pick frame nodes plus
          interior vertices to complete tiles out to the edge.
        </>) : (<>
          A <strong>Frame</strong> bounds the pattern — the infinite field is
          clipped to the outline. Completion out to the edge needs a Patch, so
          here the Frame is clip-only.
        </>)}
      </div>
      {!frame ? (
        // No Frame imposed yet (the overlay stays opt-in). On a Patch both
        // Frame types are offered directly so the n-ring isn't buried behind a
        // shape-frame-then-switch detour; a legacy substrate has no lattice to
        // ring, so it gets the one button.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => onSetFrame({
              type: 'shape', shape: 'square', size: DEFAULT_FRAME_SIZE,
              boundaryTreatment: newShapeTreatment, origin: freshOrigin(),
            })}
            style={{
              width: '100%',
              padding: '7px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              color: 'var(--accent)',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent)',
            }}
          >
            + Shape Frame
          </button>
          {isPatch && (
          <button
            onClick={() => onSetFrame({ type: 'n-ring', rings: DEFAULT_FRAME_RINGS })}
            disabled={!nRingSupported}
            title={nRingSupported ? undefined : 'n-Ring frames need a square, hexagon, or triangle Patch (single-cell octagon / dodecagon has no lattice).'}
            style={{
              width: '100%',
              padding: '7px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: nRingSupported ? 'pointer' : 'default',
              color: nRingSupported ? 'var(--accent)' : 'var(--border-subtle)',
              background: nRingSupported ? 'var(--accent-bg)' : 'transparent',
              border: `1px solid ${nRingSupported ? 'var(--accent)' : 'var(--border-subtle)'}`,
            }}
          >
            + n-Ring Frame
          </button>
          )}
        </div>
      ) : (
        <>
          {isPatch && (<>
          <FieldLabel
            label="Frame type"
            tooltip="Shape = a parametric outline (square / √2 / hex / oct) the pattern is completed out to. n-Ring = the centre Patch plus N neighbour shells, clipped to whole patches (no completion)."
          />
          <select
            className="pattern-select"
            value={frame.type}
            onChange={e => {
              const type = e.target.value as FrameType
              if (type === frame.type) return
              onSetFrame(type === 'n-ring'
                ? { type: 'n-ring', rings: frame.rings ?? DEFAULT_FRAME_RINGS }
                : { type: 'shape', shape: frame.shape ?? 'square', size: frame.size ?? DEFAULT_FRAME_SIZE, boundaryTreatment: newShapeTreatment })
            }}
            style={{ marginBottom: 10 }}
          >
            <option value="shape">Shape (parametric)</option>
            <option value="n-ring" disabled={!nRingSupported}>n-Ring (whole patches)</option>
          </select>
          </>)}
          {frame.type === 'shape' && (<>
          <FieldLabel
            label="Frame shape"
            tooltip="Outline shape the Composition is clipped to. A square + aspect √2 gives the A-series rectangle."
          />
          <select
            className="pattern-select"
            value={frame.shape ?? 'square'}
            onChange={e => updateFrameGeom({ shape: e.target.value as FrameShape })}
            style={{ marginBottom: 10 }}
          >
            <option value="square">Square</option>
            <option value="hexagon">Hexagon</option>
            <option value="octagon">Octagon</option>
          </select>
          <FieldLabel
            label="Frame size"
            tooltip="Half-extent (centre → corner) of the Frame in world units. Drag the slider, type an exact value, or nudge with the arrows."
          />
          <input
            type="range"
            min={MIN_FRAME_SIZE}
            max={MAX_FRAME_SIZE}
            step={1}
            value={frame.size ?? DEFAULT_FRAME_SIZE}
            onChange={e => updateFrameGeom({ size: Number(e.target.value) })}
            style={{ width: '100%', marginBottom: 6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <NumberStepper
              value={Math.round(frame.size ?? DEFAULT_FRAME_SIZE)}
              onChange={v => updateFrameGeom({ size: v })}
              min={MIN_FRAME_SIZE}
              max={MAX_FRAME_SIZE}
              step={1}
              ariaLabel="Frame size"
            />
          </div>
          <FieldLabel
            label="Ratio (width ÷ height)"
            tooltip="Stretches the Frame's width. 1.00 = regular; √2 ≈ 1.41 gives the A-series rectangle from a square. Type or nudge for an exact ratio."
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={frame.aspect ?? 1}
              onChange={e => updateFrameGeom({ aspect: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            {([['1:1', 1], ['√2', SQRT2]] as const).map(([label, val]) => (
              <button
                key={label}
                onClick={() => updateFrameGeom({ aspect: val })}
                style={{
                  padding: '3px 6px',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 11,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <NumberStepper
              value={Number((frame.aspect ?? 1).toFixed(2))}
              onChange={v => updateFrameGeom({ aspect: v })}
              min={0.5}
              max={2}
              step={0.05}
              precision={2}
              ariaLabel="Frame ratio"
            />
          </div>
          <FieldLabel
            label="Angle"
            tooltip="Turn the whole Frame about its origin. Type an exact angle in degrees or nudge with the arrows."
          />
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(((frame.rotation ?? 0) * 180) / Math.PI)}
            onChange={e => updateFrameGeom({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
            style={{ width: '100%', marginBottom: 6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <NumberStepper
              value={Math.round(((frame.rotation ?? 0) * 180) / Math.PI)}
              onChange={deg => updateFrameGeom({ rotation: (deg * Math.PI) / 180 })}
              min={0}
              max={360}
              step={1}
              suffix="°"
              ariaLabel="Frame angle in degrees"
            />
          </div>
          <FieldLabel
            label="Frame origin"
            tooltip={`Centre of the Frame in world coordinates. (0, 0) = ${isPatch ? 'the seed Patch centre' : 'the pattern origin, which on this substrate is wherever the field was seeded'}. Use the arrow pad to move it precisely; ⊙ recentres ${isPatch ? 'on the Patch' : 'on the current view'}.`}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Cinzel', Georgia, serif" }}>X</span>
                <input
                  type="range"
                  min={-originSpan}
                  max={originSpan}
                  step={1}
                  value={frame.origin?.x ?? 0}
                  onChange={e => updateFrameGeom({ origin: { x: Number(e.target.value), y: frame.origin?.y ?? 0 } })}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Cinzel', Georgia, serif" }}>Y</span>
                <input
                  type="range"
                  min={-originSpan}
                  max={originSpan}
                  step={1}
                  value={frame.origin?.y ?? 0}
                  onChange={e => updateFrameGeom({ origin: { x: frame.origin?.x ?? 0, y: Number(e.target.value) } })}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <NudgePad
              step={10}
              onNudge={(dx, dy) => updateFrameGeom({ origin: {
                x: clampOrigin((frame.origin?.x ?? 0) + dx),
                y: clampOrigin((frame.origin?.y ?? 0) + dy),
              } })}
              onCenter={() => updateFrameGeom({ origin: freshOrigin() })}
            />
          </div>
          <button onClick={() => updateFrameGeom({ ...SHAPE_FRAME_DEFAULTS, origin: freshOrigin() })} style={resetBtnStyle}>
            Reset frame
          </button>
          {/* Frame-scoped completions only exist on a Patch — a legacy
              substrate is clipped, never completed out to the edge. */}
          {isPatch && (
          <button
            onClick={() => onSetFrame({ ...frame, completedTiles: [] })}
            disabled={!frame.completedTiles?.length}
            style={{
              width: '100%',
              padding: '6px 0',
              marginBottom: 10,
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: frame.completedTiles?.length ? 'pointer' : 'default',
              color: frame.completedTiles?.length ? 'var(--text-muted)' : 'var(--border-subtle)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
            }}
          >
            Clear frame tiles
          </button>
          )}
          </>)}
          {frame.type === 'n-ring' && (
            <>
              <div style={{
                padding: '6px 9px',
                marginBottom: 10,
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: 11,
                color: 'var(--text-muted)',
                lineHeight: 1.4,
                border: '1px solid var(--border-subtle)',
              }}>
                Clips to the centre Patch plus <strong>{frame.rings ?? DEFAULT_FRAME_RINGS}</strong> shell{(frame.rings ?? DEFAULT_FRAME_RINGS) === 1 ? '' : 's'} of
                whole neighbour Patches — no completion (the field already
                tiles the region exactly).
              </div>
              <FieldLabel
                label="Rings"
                tooltip="Number of neighbour-Patch shells around the centre Patch. 0 = the centre Patch alone; each ring adds one surrounding shell. Type or nudge for an exact count."
              />
              <input
                type="range"
                min={MIN_FRAME_RINGS}
                max={MAX_FRAME_RINGS}
                step={1}
                value={frame.rings ?? DEFAULT_FRAME_RINGS}
                onChange={e => onSetFrame({ ...frame, rings: Number(e.target.value) })}
                style={{ width: '100%', marginBottom: 6 }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <NumberStepper
                  value={frame.rings ?? DEFAULT_FRAME_RINGS}
                  onChange={v => onSetFrame({ ...frame, rings: v })}
                  min={MIN_FRAME_RINGS}
                  max={MAX_FRAME_RINGS}
                  step={1}
                  ariaLabel="Ring count"
                />
              </div>
              <FieldLabel
                label="Angle"
                tooltip="Turn the whole Frame outline about its centre. Clip-only — the outline still follows whole Patch edges, just oriented. Type an exact angle or nudge with the arrows."
              />
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round(((frame.rotation ?? 0) * 180) / Math.PI)}
                onChange={e => updateFrameGeom({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
                style={{ width: '100%', marginBottom: 6 }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <NumberStepper
                  value={Math.round(((frame.rotation ?? 0) * 180) / Math.PI)}
                  onChange={deg => updateFrameGeom({ rotation: (deg * Math.PI) / 180 })}
                  min={0}
                  max={360}
                  step={1}
                  suffix="°"
                  ariaLabel="Frame angle in degrees"
                />
              </div>
              <button
                onClick={() => onSetFrame({ ...frame, rings: DEFAULT_FRAME_RINGS, rotation: 0 })}
                style={resetBtnStyle}
              >
                Reset frame
              </button>
            </>
          )}
          <button
            onClick={() => onSetFrame(null)}
            style={{
              width: '100%',
              padding: '6px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
            }}
          >
            Remove Frame
          </button>
        </>
      )}
      </>)}
    </div>
  )
}
