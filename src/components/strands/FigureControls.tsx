import { useMemo } from 'react'
import type { Action } from '../../state/actions'
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
  figType: 'star' | 'rosette' | 'infer'
  angle: number
  lineLength: number
  autoLen: boolean
  snapEnabled: boolean
  rosetteQ: number
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
  cpShown: boolean
  onToggleCpShown: () => void
  tilingType: string
  allFigures: Record<string, { contactAngle: number }>
  dispatch: React.Dispatch<Action>
  onCurvePointActivity: (tileTypeId: string, index: number) => void
}

export function FigureControls({
  tileTypeId, sides, displayLabel, figType, angle, lineLength, autoLen, snapEnabled, rosetteQ,
  edgeEnabled, vertexEnabled, vertexDecoupled, vertexAngle, vertexLineLength, vertexAutoLen,
  curveEnabled, curvePoints, curveAlternating, curveDirection,
  cpShown, onToggleCpShown,
  tilingType, allFigures, dispatch, onCurvePointActivity,
}: FigureControlsProps) {
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
    <div style={{ marginBottom: 16 }}>
      <FieldLabel label={`${displayLabel} · figure`} />
      <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
        {(['star', 'rosette'] as const).map(ft => (
          <button
            key={ft}
            onClick={() => dispatch({ type: 'SET_FIGURE_TYPE', payload: { tileTypeId, figureType: ft } })}
            style={{
              flex: 1,
              padding: '6px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              border: `1px solid ${figType === ft ? 'var(--accent)' : 'var(--border)'}`,
              background: figType === ft ? 'var(--accent-bg)' : 'transparent',
              color: figType === ft ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {ft}
          </button>
        ))}
      </div>

      <FieldLabel label="Contact angle" value={angle.toFixed(1)} unit="°" />
      <input
        type="range"
        className="pattern-slider"
        min={10} max={85} step={0.5}
        value={angle}
        onChange={e => dispatch({ type: 'SET_CONTACT_ANGLE', payload: { tileTypeId, angle: Number(e.target.value) } })}
      />

      {figType === 'rosette' && (
        <>
          <FieldLabel label="Petal shape (q)" value={rosetteQ.toFixed(2)} />
          <input
            type="range"
            className="pattern-slider"
            min={0} max={100} step={1}
            value={rosetteQ * 100}
            onChange={e => dispatch({ type: 'SET_ROSETTE_Q', payload: { tileTypeId, q: Number(e.target.value) / 100 } })}
          />
        </>
      )}

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <Toggle
          checked={autoLen}
          onChange={v => dispatch({ type: 'SET_AUTO_LINE_LENGTH', payload: { tileTypeId, auto: v } })}
          label="Auto strand length"
        />
      </div>
      {!autoLen && (
        <>
          <FieldLabel
            label="Strand length"
            value={(lineLength * 100).toFixed(0)}
            unit={snappedTo !== undefined ? '% (snapped)' : '%'}
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
          <div style={{ marginTop: 6, marginBottom: 4 }}>
            <Toggle
              checked={snapEnabled}
              onChange={v => dispatch({ type: 'SET_SNAP_LINE_LENGTH', payload: { tileTypeId, snap: v } })}
              label="Snap to neighbors"
            />
          </div>
        </>
      )}

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

      {vertexEnabled && (
        <div style={{ marginTop: 8 }}>
          <Toggle
            checked={vertexDecoupled}
            onChange={v => dispatch({ type: 'SET_VERTEX_LINES_DECOUPLED', payload: { tileTypeId, decoupled: v } })}
            label="Decouple vertex params"
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
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Toggle
          checked={curveEnabled}
          onChange={v => dispatch({ type: 'SET_CURVE_ENABLED', payload: { tileTypeId, enabled: v } })}
          label="Curve strands"
        />
      </div>

      {curveEnabled && (
        <div style={{ marginTop: 8 }}>
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
                  const isActive = mode === 'alternating' ? curveAlternating : !curveAlternating
                  return (
                    <button
                      key={mode}
                      onClick={() => dispatch({ type: 'SET_CURVE_ALTERNATING', payload: { tileTypeId, alternating: mode === 'alternating' } })}
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

          {sides !== 3 && curveAlternating && (
            <>
              <FieldLabel label="Direction" />
              <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
                {(['left', 'right'] as const).map(dir => {
                  const isActive = curveDirection === dir
                  return (
                    <button
                      key={dir}
                      onClick={() => dispatch({ type: 'SET_CURVE_DIRECTION', payload: { tileTypeId, direction: dir } })}
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

          <FieldLabel label="Control points" value={String(curvePoints.length)} />
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => dispatch({ type: 'SET_CURVE_POINT_COUNT', payload: { tileTypeId, count: n } })}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  border: `1px solid ${curvePoints.length === n ? 'var(--accent)' : 'var(--border)'}`,
                  background: curvePoints.length === n ? 'var(--accent-bg)' : 'transparent',
                  color: curvePoints.length === n ? 'var(--accent)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {curvePoints.map((cp, i) => (
            <div key={i} style={{ marginBottom: i < curvePoints.length - 1 ? 10 : 0 }}>
              {curvePoints.length > 1 && (
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
                    payload: { tileTypeId, index: i, point: { position: Number(e.target.value) / 100 } },
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
                    payload: { tileTypeId, index: i, point: { offset: Number(e.target.value) / 100 } },
                  })
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldLabel({ label, value, unit }: { label: string; value?: string; unit?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 7,
      marginTop: 12,
    }}>
      <span style={{
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 13.5,
        color: 'var(--text-secondary)',
        letterSpacing: '0.02em',
      }}>
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
