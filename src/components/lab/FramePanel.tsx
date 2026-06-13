import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { FrameConfig, FrameType, FrameShape } from '../../types/editor'
import { DEFAULT_FRAME_SIZE, MIN_FRAME_SIZE, MAX_FRAME_SIZE, SQRT2 } from '../../editor/frame'
import { DEFAULT_FRAME_RINGS, MIN_FRAME_RINGS, MAX_FRAME_RINGS } from '../../editor/frameNRing'
import { activeCell } from '../../editor/active'
import { FieldLabel } from './labShared'

/**
 * Frame overlay controls in the Builder sidebar — a persistent bounded-region
 * overlay present across phases. Offers Shape (parametric) and n-Ring frame
 * types and their geometry sliders. Extracted from `EditorDesignControls`.
 */
export function FramePanel({
  editor,
  dispatch,
}: {
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
}) {
  const cell = activeCell(editor)
  const multiCell = editor.cells.length > 1
  // n-ring Frames are single-cell-only (square / hexagon / triangle) in v1 —
  // multi-cell Configurations + octagon/dodecagon are deferred.
  const nRingSupported = !multiCell && (cell.shape === 'square' || cell.shape === 'hexagon' || cell.shape === 'triangle')
  // Frame — update a Frame geometry field. Geometry changes move the frame
  // nodes, so clear `completedTiles` (frame-scoped completions are anchored to
  // the old outline; the user re-completes against the new edge).
  const updateFrameGeom = (partial: Partial<FrameConfig>) => {
    if (!editor.frame) return
    dispatch({ type: 'SET_FRAME', payload: { ...editor.frame, ...partial, completedTiles: [] } })
  }
  return (
    <div style={{ marginTop: 0, marginBottom: 14 }}>
      <FieldLabel
        label="Frame"
        tooltip="A persistent bounded region the pattern clips to. In Complete mode, the frame's edge nodes are clickable targets so you can complete tiles out to the edge. Shape = parametric outline; n-Ring = whole-patch shells (clip-only)."
      />
      <div style={{
        padding: '8px 10px',
        marginBottom: 10,
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 12,
        color: 'var(--text-muted)',
        lineHeight: 1.45,
        border: '1px solid var(--border-subtle)',
      }}>
        A <strong>Frame</strong> bounds the pattern — it's clipped to the
        outline. Switch to <strong>Complete</strong> mode and the frame's
        edge <strong>nodes</strong> become clickable: pick frame nodes plus
        interior vertices to complete tiles out to the edge.
      </div>
      {!editor.frame ? (
        // No Frame imposed yet (the overlay stays opt-in). Both Frame types
        // are offered directly so the n-ring isn't buried behind a
        // shape-frame-then-switch detour.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => dispatch({
              type: 'SET_FRAME',
              payload: { type: 'shape', shape: 'square', size: DEFAULT_FRAME_SIZE, boundaryTreatment: 'complete' },
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
          <button
            onClick={() => dispatch({
              type: 'SET_FRAME',
              payload: { type: 'n-ring', rings: DEFAULT_FRAME_RINGS },
            })}
            disabled={!nRingSupported}
            title={nRingSupported ? undefined : 'n-Ring frames need a single-cell square, hexagon, or triangle Patch.'}
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
        </div>
      ) : (
        <>
          <FieldLabel
            label="Frame type"
            tooltip="Shape = a parametric outline (square / √2 / hex / oct) the pattern is completed out to. n-Ring = the centre Patch plus N neighbour shells, clipped to whole patches (no completion)."
          />
          <select
            className="pattern-select"
            value={editor.frame.type}
            onChange={e => {
              const type = e.target.value as FrameType
              if (type === editor.frame!.type) return
              dispatch({
                type: 'SET_FRAME',
                payload: type === 'n-ring'
                  ? { type: 'n-ring', rings: editor.frame!.rings ?? DEFAULT_FRAME_RINGS }
                  : { type: 'shape', shape: editor.frame!.shape ?? 'square', size: editor.frame!.size ?? DEFAULT_FRAME_SIZE, boundaryTreatment: 'complete' },
              })
            }}
            style={{ marginBottom: 10 }}
          >
            <option value="shape">Shape (parametric)</option>
            <option value="n-ring" disabled={!nRingSupported}>n-Ring (whole patches)</option>
          </select>
          {editor.frame.type === 'shape' && (<>
          <FieldLabel
            label="Frame shape"
            tooltip="Outline shape the Composition is clipped to. A square + aspect √2 gives the A-series rectangle."
          />
          <select
            className="pattern-select"
            value={editor.frame.shape ?? 'square'}
            onChange={e => updateFrameGeom({ shape: e.target.value as FrameShape })}
            style={{ marginBottom: 10 }}
          >
            <option value="square">Square</option>
            <option value="hexagon">Hexagon</option>
            <option value="octagon">Octagon</option>
          </select>
          <FieldLabel
            label={`Frame size — ${Math.round(editor.frame.size ?? DEFAULT_FRAME_SIZE)}`}
            tooltip="Half-extent (centre → corner) of the Frame in world units."
          />
          <input
            type="range"
            min={MIN_FRAME_SIZE}
            max={MAX_FRAME_SIZE}
            step={1}
            value={editor.frame.size ?? DEFAULT_FRAME_SIZE}
            onChange={e => updateFrameGeom({ size: Number(e.target.value) })}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <FieldLabel
            label={`Aspect (width ÷ height) — ${(editor.frame.aspect ?? 1).toFixed(2)}`}
            tooltip="Stretches the Frame's width. 1.00 = regular; √2 ≈ 1.41 gives the A-series rectangle from a square."
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={editor.frame.aspect ?? 1}
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
          <FieldLabel
            label={`Rotation — ${Math.round(((editor.frame.rotation ?? 0) * 180) / Math.PI)}°`}
            tooltip="Turn the whole Frame about its origin."
          />
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(((editor.frame.rotation ?? 0) * 180) / Math.PI)}
            onChange={e => updateFrameGeom({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <FieldLabel
            label={`Frame origin — (${Math.round(editor.frame.origin?.x ?? 0)}, ${Math.round(editor.frame.origin?.y ?? 0)})`}
            tooltip="Centre of the Frame in world coordinates. (0, 0) = the seed Patch centre."
          />
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input
              type="range"
              min={-800}
              max={800}
              step={1}
              value={editor.frame.origin?.x ?? 0}
              onChange={e => updateFrameGeom({ origin: { x: Number(e.target.value), y: editor.frame!.origin?.y ?? 0 } })}
              style={{ flex: 1 }}
            />
            <input
              type="range"
              min={-800}
              max={800}
              step={1}
              value={editor.frame.origin?.y ?? 0}
              onChange={e => updateFrameGeom({ origin: { x: editor.frame!.origin?.x ?? 0, y: Number(e.target.value) } })}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Cinzel', Georgia, serif", letterSpacing: '0.08em' }}>
            <span>X</span><span>Y</span>
          </div>
          <button
            onClick={() => dispatch({
              type: 'SET_FRAME',
              payload: { ...editor.frame!, completedTiles: [] },
            })}
            disabled={!editor.frame.completedTiles?.length}
            style={{
              width: '100%',
              padding: '6px 0',
              marginBottom: 10,
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: editor.frame.completedTiles?.length ? 'pointer' : 'default',
              color: editor.frame.completedTiles?.length ? 'var(--text-muted)' : 'var(--border-subtle)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
            }}
          >
            Clear frame tiles
          </button>
          </>)}
          {editor.frame.type === 'n-ring' && (
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
                Clips to the centre Patch plus <strong>{editor.frame.rings ?? DEFAULT_FRAME_RINGS}</strong> shell{(editor.frame.rings ?? DEFAULT_FRAME_RINGS) === 1 ? '' : 's'} of
                whole neighbour Patches — no completion (the field already
                tiles the region exactly).
              </div>
              <FieldLabel
                label={`Rings — ${editor.frame.rings ?? DEFAULT_FRAME_RINGS}`}
                tooltip="Number of neighbour-Patch shells around the centre Patch. 0 = the centre Patch alone; each ring adds one surrounding shell."
              />
              <input
                type="range"
                min={MIN_FRAME_RINGS}
                max={MAX_FRAME_RINGS}
                step={1}
                value={editor.frame.rings ?? DEFAULT_FRAME_RINGS}
                onChange={e => dispatch({ type: 'SET_FRAME', payload: { ...editor.frame!, rings: Number(e.target.value) } })}
                style={{ width: '100%', marginBottom: 10 }}
              />
              <FieldLabel
                label={`Rotation — ${Math.round(((editor.frame.rotation ?? 0) * 180) / Math.PI)}°`}
                tooltip="Turn the whole Frame outline about its centre. Clip-only — the outline still follows whole Patch edges, just oriented."
              />
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round(((editor.frame.rotation ?? 0) * 180) / Math.PI)}
                onChange={e => updateFrameGeom({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
                style={{ width: '100%', marginBottom: 10 }}
              />
            </>
          )}
          <button
            onClick={() => dispatch({ type: 'SET_FRAME', payload: null })}
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
    </div>
  )
}
