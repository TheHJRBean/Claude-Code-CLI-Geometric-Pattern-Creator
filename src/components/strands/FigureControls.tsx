import { useMemo, useState } from 'react'
import type { Action, CurveTarget } from '../../state/actions'
import type { CurveConfig, FigureLineSet } from '../../types/pattern'
import { computeSnapPoints, snapToNearest } from '../../pic/snapPoints'

/**
 * Generic per-tile-type strand controls. Takes a `dispatch` and an `allFigures`
 * map; no hardcoded coupling to any specific reducer. Used by Main's Sidebar
 * (Step 10 lift) and — at Step 11 — by Lab's Strands panel for archimedean
 * and rosette-patch tessellations.
 */

interface FigureControlsProps {
  tileTypeId: string
  sides: number
  displayLabel: string
  angle: number
  lineLength: number
  autoLen: boolean
  snapEnabled: boolean
  edgeEnabled: boolean
  vertexEnabled: boolean
  vertexDecoupled: boolean
  vertexAngle: number
  vertexLineLength: number
  vertexAutoLen: boolean
  curveEnabled: boolean
  curvePoints: { position: number; offset: number }[]
  curveAlternating: boolean
  curveDirection: 'left' | 'right'
  /** Vertex strand curve recipe (used when `vertexDecoupled`). */
  vertexCurveEnabled: boolean
  vertexCurvePoints: { position: number; offset: number }[]
  vertexCurveAlternating: boolean
  vertexCurveDirection: 'left' | 'right'
  cpShown: boolean
  onToggleCpShown: () => void
  tilingType: string
  allFigures: Record<string, { contactAngle: number }>
  dispatch: React.Dispatch<Action>
  onCurvePointActivity: (tileTypeId: string, index: number) => void
  /**
   * Reveal the advanced sections (snap, edge/vertex strand toggles,
   * decoupled vertex parameters, curve recipe). Off by default so callers
   * opt in. Lab gates this on the Composition phase + Show-advanced toggle;
   * Gallery gates it on the Show-advanced toggle.
   */
  advanced?: boolean
  /** Extra line sets for this tile type (ticket #42), edited in-place via the
   *  ADD/UPDATE/REMOVE_FIGURE_SET actions. */
  extraSets?: FigureLineSet[]
}

export function FigureControls({
  tileTypeId, sides, displayLabel, angle, lineLength, autoLen, snapEnabled,
  edgeEnabled, vertexEnabled, vertexDecoupled, vertexAngle, vertexLineLength, vertexAutoLen,
  curveEnabled, curvePoints, curveAlternating, curveDirection,
  vertexCurveEnabled, vertexCurvePoints, vertexCurveAlternating, vertexCurveDirection,
  cpShown, onToggleCpShown,
  tilingType, allFigures, dispatch, onCurvePointActivity,
  advanced = false, extraSets = [],
}: FigureControlsProps) {
  // Which strand type the curve-shape editor is currently editing. Only
  // meaningful when decoupled; coupled always targets the (shared) edge curve.
  const [curveTarget, setCurveTarget] = useState<CurveTarget>('edge')
  const activeCurveTarget: CurveTarget = vertexDecoupled ? curveTarget : 'edge'
  const shape = activeCurveTarget === 'vertex'
    ? { points: vertexCurvePoints, alternating: vertexCurveAlternating, direction: vertexCurveDirection }
    : { points: curvePoints, alternating: curveAlternating, direction: curveDirection }
  const curveShapeVisible = curveEnabled || (vertexEnabled && vertexDecoupled && vertexCurveEnabled)
  const anglesKey = Object.entries(allFigures)
    .map(([s, f]) => `${s}:${f.contactAngle}`)
    .join(',')
  const snapPoints = useMemo(
    () => computeSnapPoints(tilingType, sides, allFigures),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tilingType, sides, anglesKey],
  )
  const snappedTo = snapEnabled ? snapPoints.find(s => Math.abs(lineLength - s) < 0.005) : undefined

  const handleLineLengthChange = (rawPercent: number) => {
    let ll = rawPercent / 100
    if (snapEnabled) {
      ll = snapToNearest(ll, snapPoints)
    }
    dispatch({ type: 'SET_LINE_LENGTH', payload: { tileTypeId, lineLength: ll } })
  }

  const sliderMin = 10, sliderMax = 500
  const toTrackPct = (val: number) =>
    Math.max(0, Math.min(100, ((val * 100 - sliderMin) / (sliderMax - sliderMin)) * 100))

  return (
    <div style={{
      marginBottom: 14,
      padding: '10px 12px',
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 9,
        fontWeight: 600,
        color: 'var(--accent)',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        marginBottom: 4,
      }}>
        {displayLabel}
      </div>

      <FieldLabel
        label="Contact angle"
        value={angle.toFixed(1)}
        unit="°"
        tooltip="PIC contact angle θ — controls how pointy each Ray is at its polygon edge. 67.5° on a square Tiling produces classic 8-pointed Islamic stars."
      />
      <input
        type="range"
        className="pattern-slider"
        min={10} max={85} step={0.5}
        value={angle}
        onChange={e => dispatch({ type: 'SET_CONTACT_ANGLE', payload: { tileTypeId, angle: Number(e.target.value) } })}
      />

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <Toggle
          checked={autoLen}
          onChange={v => dispatch({ type: 'SET_AUTO_LINE_LENGTH', payload: { tileTypeId, auto: v } })}
          label="Auto Ray length"
        />
      </div>
      {!autoLen && (
        <>
          <FieldLabel
            label="Ray length"
            value={(lineLength * 100).toFixed(0)}
            unit={snappedTo !== undefined ? '% (snapped)' : '%'}
            tooltip="Length of each Ray (the atomic line piece inside one polygon's Figure), as a fraction of the auto length where Rays meet their neighbours. Rays chain across polygons to form Strands."
          />
          <div style={{ position: 'relative', paddingTop: snapEnabled ? 8 : 0 }}>
            {snapEnabled && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%', pointerEvents: 'none' }}>
                {snapPoints.map(snap => {
                  const pct = toTrackPct(snap)
                  const isActive = snappedTo !== undefined && Math.abs(snap - snappedTo) < 0.001
                  return (
                    <div
                      key={snap}
                      style={{
                        position: 'absolute',
                        left: `calc(${pct}% + ${(0.5 - pct / 100) * 13}px)`,
                        top: 0,
                        width: 1,
                        height: '100%',
                        background: isActive
                          ? 'var(--accent)'
                          : 'var(--snap-gradient)',
                        transition: 'background 0.15s',
                      }}
                      title={`${(snap * 100).toFixed(0)}%`}
                    />
                  )
                })}
              </div>
            )}
            <input
              type="range"
              className="pattern-slider"
              min={sliderMin} max={sliderMax} step={1}
              value={Math.round(lineLength * 100)}
              onChange={e => handleLineLengthChange(Number(e.target.value))}
            />
          </div>
          {advanced && (
            <div style={{ marginTop: 6, marginBottom: 4 }}>
              <Toggle
                checked={snapEnabled}
                onChange={v => dispatch({ type: 'SET_SNAP_LINE_LENGTH', payload: { tileTypeId, snap: v } })}
                label="Snap to neighbors"
              />
            </div>
          )}
        </>
      )}

      {advanced && (
        <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
          <Toggle
            checked={edgeEnabled}
            onChange={v => dispatch({ type: 'SET_EDGE_LINES_ENABLED', payload: { tileTypeId, enabled: v } })}
            label="Edge strands"
          />
          <Toggle
            checked={vertexEnabled}
            onChange={v => dispatch({ type: 'SET_VERTEX_LINES_ENABLED', payload: { tileTypeId, enabled: v } })}
            label="Vertex strands"
          />
        </div>
      )}

      {advanced && vertexEnabled && (
        <div style={{ marginTop: 8 }}>
          <Toggle
            checked={vertexDecoupled}
            onChange={v => dispatch({ type: 'SET_VERTEX_LINES_DECOUPLED', payload: { tileTypeId, decoupled: v } })}
            label="Decouple vertex parameters"
          />
          {vertexDecoupled && (
            <div style={{ marginTop: 8 }}>
              <FieldLabel label="Vertex angle" value={vertexAngle.toFixed(1)} unit="°" />
              <input
                type="range"
                className="pattern-slider"
                min={10} max={85} step={0.5}
                value={vertexAngle}
                onChange={e => dispatch({ type: 'SET_VERTEX_CONTACT_ANGLE', payload: { tileTypeId, angle: Number(e.target.value) } })}
              />

              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <Toggle
                  checked={vertexAutoLen}
                  onChange={v => dispatch({ type: 'SET_VERTEX_AUTO_LINE_LENGTH', payload: { tileTypeId, auto: v } })}
                  label="Auto vertex strand length"
                />
              </div>
              {!vertexAutoLen && (
                <>
                  <FieldLabel label="Vertex strand length" value={(vertexLineLength * 100).toFixed(0)} unit="%" />
                  <input
                    type="range"
                    className="pattern-slider"
                    min={10} max={500} step={1}
                    value={Math.round(vertexLineLength * 100)}
                    onChange={e => dispatch({ type: 'SET_VERTEX_LINE_LENGTH', payload: { tileTypeId, lineLength: Number(e.target.value) / 100 } })}
                  />
                </>
              )}

              <div style={{ marginTop: 10 }}>
                <Toggle
                  checked={vertexCurveEnabled}
                  onChange={v => dispatch({ type: 'SET_CURVE_ENABLED', payload: { tileTypeId, enabled: v, target: 'vertex' } })}
                  label="Curve vertex strands"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {advanced && (
        <div style={{ marginTop: 12 }}>
          <Toggle
            checked={curveEnabled}
            onChange={v => dispatch({ type: 'SET_CURVE_ENABLED', payload: { tileTypeId, enabled: v, target: 'edge' } })}
            label={vertexDecoupled ? 'Curve edge strands' : 'Curve strands'}
          />
        </div>
      )}

      {advanced && curveShapeVisible && (
        <div style={{ marginTop: 8 }}>
          {vertexDecoupled && (
            <>
              <FieldLabel label="Curve shape for" />
              <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
                {(['edge', 'vertex'] as const).map(t => {
                  const isActive = activeCurveTarget === t
                  return (
                    <button
                      key={t}
                      onClick={() => setCurveTarget(t)}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontFamily: "'Cinzel', Georgia, serif",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const,
                        cursor: 'pointer',
                        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        background: isActive ? 'var(--accent-bg)' : 'transparent',
                        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <div style={{ marginBottom: 8 }}>
            <Toggle
              checked={cpShown}
              onChange={onToggleCpShown}
              label="Show control points"
            />
          </div>
          {sides !== 3 && (
            <>
              <FieldLabel label="Curve mode" />
              <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
                {(['same', 'alternating'] as const).map(mode => {
                  const isActive = mode === 'alternating' ? shape.alternating : !shape.alternating
                  return (
                    <button
                      key={mode}
                      onClick={() => dispatch({ type: 'SET_CURVE_ALTERNATING', payload: { tileTypeId, alternating: mode === 'alternating', target: activeCurveTarget } })}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontFamily: "'Cinzel', Georgia, serif",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const,
                        cursor: 'pointer',
                        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        background: isActive ? 'var(--accent-bg)' : 'transparent',
                        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {mode}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {sides !== 3 && shape.alternating && (
            <>
              <FieldLabel label="Direction" />
              <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
                {(['left', 'right'] as const).map(dir => {
                  const isActive = shape.direction === dir
                  return (
                    <button
                      key={dir}
                      onClick={() => dispatch({ type: 'SET_CURVE_DIRECTION', payload: { tileTypeId, direction: dir, target: activeCurveTarget } })}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontFamily: "'Cinzel', Georgia, serif",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const,
                        cursor: 'pointer',
                        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        background: isActive ? 'var(--accent-bg)' : 'transparent',
                        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {dir === 'left' ? 'L' : 'R'}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <FieldLabel label="Control points" value={String(shape.points.length)} />
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => dispatch({ type: 'SET_CURVE_POINT_COUNT', payload: { tileTypeId, count: n, target: activeCurveTarget } })}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  border: `1px solid ${shape.points.length === n ? 'var(--accent)' : 'var(--border)'}`,
                  background: shape.points.length === n ? 'var(--accent-bg)' : 'transparent',
                  color: shape.points.length === n ? 'var(--accent)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {shape.points.map((cp, i) => (
            <div key={i} style={{ marginBottom: i < shape.points.length - 1 ? 10 : 0 }}>
              {shape.points.length > 1 && (
                <span style={{
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em',
                }}>
                  Point {i + 1}
                </span>
              )}
              <FieldLabel label="Position" value={(cp.position * 100).toFixed(0)} unit="%" />
              <input
                type="range"
                className="pattern-slider"
                min={5} max={95} step={1}
                value={Math.round(cp.position * 100)}
                onPointerDown={() => onCurvePointActivity(tileTypeId, i)}
                onChange={e => {
                  onCurvePointActivity(tileTypeId, i)
                  dispatch({
                    type: 'SET_CURVE_POINT',
                    payload: { tileTypeId, index: i, point: { position: Number(e.target.value) / 100 }, target: activeCurveTarget },
                  })
                }}
              />
              <FieldLabel label="Offset" value={(cp.offset * 100).toFixed(0)} unit="%" />
              <input
                type="range"
                className="pattern-slider"
                min={-100} max={100} step={1}
                value={Math.round(cp.offset * 100)}
                onPointerDown={() => onCurvePointActivity(tileTypeId, i)}
                onChange={e => {
                  onCurvePointActivity(tileTypeId, i)
                  dispatch({
                    type: 'SET_CURVE_POINT',
                    payload: { tileTypeId, index: i, point: { offset: Number(e.target.value) / 100 }, target: activeCurveTarget },
                  })
                }}
              />
            </div>
          ))}
        </div>
      )}

      {advanced && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <FieldLabel
            label="Line sets"
            tooltip="Extra Ray families emitted from the same edges / vertices as the primary Figure, each with its own contact angle, length and curve. Layer multiple star families onto one Tiling. Tile edges traces the Tile outlines themselves as Strands."
          />
          {extraSets.map(set => (
            <ExtraSetCard
              key={set.id}
              tileTypeId={tileTypeId}
              sides={sides}
              set={set}
              dispatch={dispatch}
            />
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <AddSetButton label="+ Edge set" onClick={() => dispatch({ type: 'ADD_FIGURE_SET', payload: { tileTypeId, kind: 'edge' } })} />
            <AddSetButton label="+ Vertex set" onClick={() => dispatch({ type: 'ADD_FIGURE_SET', payload: { tileTypeId, kind: 'vertex' } })} />
            <AddSetButton label="+ Tile edges" onClick={() => dispatch({ type: 'ADD_FIGURE_SET', payload: { tileTypeId, kind: 'boundary' } })} />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * One extra line set (ticket #42): kind badge + delete, enable, contact angle,
 * auto/manual length, and an optional per-set curve. All edits route through
 * UPDATE_FIGURE_SET (curves as a whole-object patch — not the CurveTarget-based
 * SET_CURVE_* actions, which only address the primary figure). On-canvas
 * control-point dragging is primary-only for now; sets edit their curve shape
 * through the sliders below.
 */
function ExtraSetCard({ tileTypeId, sides, set, dispatch }: {
  tileTypeId: string
  sides: number
  set: FigureLineSet
  dispatch: React.Dispatch<Action>
}) {
  const patch = (p: Partial<FigureLineSet>) =>
    dispatch({ type: 'UPDATE_FIGURE_SET', payload: { tileTypeId, setId: set.id, patch: p } })
  const enabled = set.enabled !== false
  const curve = set.curve
  const curveEnabled = curve?.enabled ?? false
  const defaultCurve: CurveConfig = { enabled: true, points: [{ position: 0.5, offset: 0.2 }] }

  return (
    <div style={{
      marginTop: 8,
      padding: '8px 10px',
      border: '1px solid var(--border)',
      opacity: enabled ? 1 : 0.6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 8.5,
          fontWeight: 600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase' as const,
          color: 'var(--accent)',
        }}>
          {set.kind === 'boundary' ? 'tile edge' : set.kind} set
        </span>
        <button
          onClick={() => dispatch({ type: 'REMOVE_FIGURE_SET', payload: { tileTypeId, setId: set.id } })}
          aria-label="Delete line set"
          title="Delete line set"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 15,
            lineHeight: 1,
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>

      <div style={{ marginTop: 6 }}>
        <Toggle checked={enabled} onChange={v => patch({ enabled: v })} label="Enabled" />
      </div>

      {set.kind !== 'boundary' && (
        <>
          <FieldLabel label="Contact angle" value={set.contactAngle.toFixed(1)} unit="°" />
          <input
            type="range"
            className="pattern-slider"
            min={10} max={85} step={0.5}
            value={set.contactAngle}
            onChange={e => patch({ contactAngle: Number(e.target.value) })}
          />

          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <Toggle checked={set.autoLineLength} onChange={v => patch({ autoLineLength: v })} label="Auto Ray length" />
          </div>
          {!set.autoLineLength && (
            <>
              <FieldLabel label="Ray length" value={(set.lineLength * 100).toFixed(0)} unit="%" />
              <input
                type="range"
                className="pattern-slider"
                min={10} max={500} step={1}
                value={Math.round(set.lineLength * 100)}
                onChange={e => patch({ lineLength: Number(e.target.value) / 100 })}
              />
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 10 }}>
        <Toggle
          checked={curveEnabled}
          onChange={v => patch({ curve: { ...(curve ?? defaultCurve), enabled: v } })}
          label="Curve"
        />
      </div>
      {curveEnabled && curve && (
        <CurveShapeEditor sides={sides} curve={curve} onChange={next => patch({ curve: next })} />
      )}
    </div>
  )
}

/**
 * Panel curve-shape editor over a whole `CurveConfig` (ticket #42 extra sets).
 * Mode / direction / control-point count + per-point position/offset sliders —
 * the same knobs the primary figure exposes, but driven by one `onChange`
 * callback instead of the granular SET_CURVE_* actions.
 */
function CurveShapeEditor({ sides, curve, onChange }: {
  sides: number
  curve: CurveConfig
  onChange: (c: CurveConfig) => void
}) {
  const alternating = curve.alternating ?? false
  const direction = curve.direction ?? 'left'
  const setCount = (n: number) => {
    const count = Math.max(1, Math.min(3, n))
    const pts: { position: number; offset: number }[] = []
    for (let i = 0; i < count; i++) {
      pts.push(curve.points[i] ?? { position: (i + 1) / (count + 1), offset: 0.2 })
    }
    onChange({ ...curve, points: pts })
  }
  const setPoint = (i: number, p: Partial<{ position: number; offset: number }>) => {
    onChange({ ...curve, points: curve.points.map((cp, j) => (j === i ? { ...cp, ...p } : cp)) })
  }

  return (
    <div style={{ marginTop: 8 }}>
      {sides !== 3 && (
        <>
          <FieldLabel label="Curve mode" />
          <SegmentedButtons
            options={[
              { key: 'same', label: 'same', active: !alternating },
              { key: 'alternating', label: 'alternating', active: alternating },
            ]}
            onPick={k => onChange({ ...curve, alternating: k === 'alternating' })}
          />
        </>
      )}
      {sides !== 3 && alternating && (
        <>
          <FieldLabel label="Direction" />
          <SegmentedButtons
            options={[
              { key: 'left', label: 'L', active: direction === 'left' },
              { key: 'right', label: 'R', active: direction === 'right' },
            ]}
            onPick={k => onChange({ ...curve, direction: k as 'left' | 'right' })}
          />
        </>
      )}
      <FieldLabel label="Control points" value={String(curve.points.length)} />
      <SegmentedButtons
        options={[1, 2, 3].map(n => ({ key: String(n), label: String(n), active: curve.points.length === n }))}
        onPick={k => setCount(Number(k))}
      />
      {curve.points.map((cp, i) => (
        <div key={i} style={{ marginBottom: i < curve.points.length - 1 ? 10 : 0 }}>
          {curve.points.length > 1 && (
            <span style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 12,
              color: 'var(--text-muted)',
              letterSpacing: '0.02em',
            }}>
              Point {i + 1}
            </span>
          )}
          <FieldLabel label="Position" value={(cp.position * 100).toFixed(0)} unit="%" />
          <input
            type="range"
            className="pattern-slider"
            min={5} max={95} step={1}
            value={Math.round(cp.position * 100)}
            onChange={e => setPoint(i, { position: Number(e.target.value) / 100 })}
          />
          <FieldLabel label="Offset" value={(cp.offset * 100).toFixed(0)} unit="%" />
          <input
            type="range"
            className="pattern-slider"
            min={-100} max={100} step={1}
            value={Math.round(cp.offset * 100)}
            onChange={e => setPoint(i, { offset: Number(e.target.value) / 100 })}
          />
        </div>
      ))}
    </div>
  )
}

function SegmentedButtons({ options, onPick }: {
  options: { key: string; label: string; active: boolean }[]
  onPick: (key: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onPick(o.key)}
          style={{
            flex: 1,
            padding: '5px 0',
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            cursor: 'pointer',
            border: `1px solid ${o.active ? 'var(--accent)' : 'var(--border)'}`,
            background: o.active ? 'var(--accent-bg)' : 'transparent',
            color: o.active ? 'var(--accent)' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function AddSetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '6px 0',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        cursor: 'pointer',
        border: '1px dashed var(--border)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function FieldLabel({ label, value, unit, tooltip }: { label: string; value?: string; unit?: string; tooltip?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 7,
      marginTop: 12,
    }}>
      <span
        title={tooltip}
        style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 13.5,
          color: 'var(--text-secondary)',
          letterSpacing: '0.02em',
          cursor: tooltip ? 'help' : 'default',
          textDecoration: tooltip ? 'underline dotted var(--text-muted)' : 'none',
          textUnderlineOffset: 3,
        }}
      >
        {label}
      </span>
      {value !== undefined && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'var(--accent)',
          letterSpacing: '0.04em',
        }}>
          {value}{unit}
        </span>
      )}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer',
      fontFamily: "'EB Garamond', Georgia, serif",
      fontSize: 13.5,
      color: checked ? 'var(--text)' : 'var(--text-muted)',
      transition: 'color 0.15s',
    }}>
      <input
        type="checkbox"
        className="pattern-checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
