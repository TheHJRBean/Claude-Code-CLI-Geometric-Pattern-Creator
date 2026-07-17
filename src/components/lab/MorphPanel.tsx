import { useState } from 'react'
import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import { defaultMorphBoundaryPosition } from '../../editor/morph'
import { editorTileTypes } from '../../editor/tileTypes'
import { FieldLabel, NumberStepper, NudgePad, SectionTitle } from './labShared'
import { Toggle } from '../ui/Toggle'

/** Origin/centre nudge range (matches Frame's origin extent). */
const MORPH_ORIGIN_RANGE = 800
/** Boundary position extent — generous since a gradient band can legitimately
 *  span many tile-widths (unlike Frame, which bounds a single outline). */
const MORPH_POSITION_RANGE = 6000
const clampOrigin = (n: number) => Math.min(MORPH_ORIGIN_RANGE, Math.max(-MORPH_ORIGIN_RANGE, n))

const addButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 0',
  marginBottom: 10,
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  color: 'var(--accent)',
  background: 'var(--accent-bg)',
  border: '1px solid var(--accent)',
}

const removeButtonStyle: React.CSSProperties = {
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
}

const rowHeaderButtonStyle: React.CSSProperties = {
  flex: 1,
  textAlign: 'left',
  padding: 0,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text)',
  fontFamily: "'EB Garamond', Georgia, serif",
  fontSize: 12.5,
}

const deleteRowButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 20,
  height: 20,
  lineHeight: 1,
  padding: 0,
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--text-muted)',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
}

/**
 * Morph section — sidebar authoring for a Morph (Step 20 slice 2,
 * PATTERN_MORPH_SPEC.md §UI). Visible Composition Phase onward. Needs
 * `config.figures` + `config.editor` + `config.morph` together (unlike the
 * editor-only phase panels), so it takes the whole `PatternConfig` rather
 * than just `editor`.
 */
export function MorphPanel({
  config,
  dispatch,
}: {
  config: PatternConfig
  dispatch: React.Dispatch<Action>
}) {
  const morph = config.morph
  // Which Boundary row is expanded — local, independent of the on-canvas
  // selection (only the transient bottom slider syncs with canvas selection;
  // the spec ties the sidebar list to nothing but its own click).
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!morph) {
    return (
      <div style={{ marginTop: 0, marginBottom: 14 }}>
        <SectionTitle tooltip="A Morph interpolates each Tile type's contact angle across the canvas between Morph Boundaries — gradient stops you place as draggable lines (Linear) or rings (Radial). Composition Phase onward.">
          Morph
        </SectionTitle>
        <button
          onClick={() => dispatch({ type: 'SET_MORPH_ENABLED', payload: true })}
          style={addButtonStyle}
        >
          + Add Morph
        </button>
      </div>
    )
  }

  const tileTypes = config.editor ? editorTileTypes(config.editor) : []
  const direction = morph.direction ?? { x: 1, y: 0 }
  const directionDeg = Math.round((((Math.atan2(direction.y, direction.x) * 180) / Math.PI) + 360) % 360)
  const setDirectionDeg = (deg: number) => {
    const rad = (deg * Math.PI) / 180
    dispatch({ type: 'SET_MORPH_DIRECTION', payload: { x: Math.cos(rad), y: Math.sin(rad) } })
  }
  const positionMin = morph.mode === 'radial' ? 0 : -MORPH_POSITION_RANGE

  return (
    <div style={{ marginTop: 0, marginBottom: 14 }}>
      <SectionTitle tooltip="A Morph interpolates each Tile type's contact angle across the canvas between Morph Boundaries — gradient stops you place as draggable lines (Linear) or rings (Radial).">
        Morph
      </SectionTitle>

      <Toggle
        checked={morph.enabled}
        onChange={v => dispatch({ type: 'SET_MORPH_ENABLED', payload: v })}
        label="Enabled"
      />

      <FieldLabel
        label="Mode"
        tooltip="Linear = Boundaries are parallel lines along one direction from the Origin. Radial = Boundaries are concentric rings around the Centre."
      />
      <select
        className="pattern-select"
        value={morph.mode}
        onChange={e => dispatch({ type: 'SET_MORPH_MODE', payload: e.target.value as 'linear' | 'radial' })}
        style={{ marginBottom: 10 }}
      >
        <option value="linear">Linear</option>
        <option value="radial">Radial</option>
      </select>

      <FieldLabel
        label={morph.mode === 'radial' ? 'Centre' : 'Origin'}
        tooltip="Where the field's distance parameter is measured from. Drag its handle on canvas, or nudge here."
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Cinzel', Georgia, serif" }}>X</span>
            <input
              type="range"
              min={-MORPH_ORIGIN_RANGE}
              max={MORPH_ORIGIN_RANGE}
              step={1}
              value={morph.origin.x}
              onChange={e => dispatch({ type: 'SET_MORPH_ORIGIN', payload: { x: Number(e.target.value), y: morph.origin.y } })}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Cinzel', Georgia, serif" }}>Y</span>
            <input
              type="range"
              min={-MORPH_ORIGIN_RANGE}
              max={MORPH_ORIGIN_RANGE}
              step={1}
              value={morph.origin.y}
              onChange={e => dispatch({ type: 'SET_MORPH_ORIGIN', payload: { x: morph.origin.x, y: Number(e.target.value) } })}
              style={{ flex: 1 }}
            />
          </div>
        </div>
        <NudgePad
          step={10}
          onNudge={(dx, dy) => dispatch({
            type: 'SET_MORPH_ORIGIN',
            payload: { x: clampOrigin(morph.origin.x + dx), y: clampOrigin(morph.origin.y + dy) },
          })}
          onCenter={() => dispatch({ type: 'SET_MORPH_ORIGIN', payload: { x: 0, y: 0 } })}
        />
      </div>

      {morph.mode === 'linear' && (<>
        <FieldLabel
          label="Direction"
          value={directionDeg.toFixed(0)}
          unit="°"
          tooltip="Axis the field runs along, from the Origin. 0° = +x (right). Drag the arrow handle on canvas, or type/nudge here."
        />
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={directionDeg}
          onChange={e => setDirectionDeg(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 6 }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <NumberStepper value={directionDeg} onChange={setDirectionDeg} min={0} max={360} step={1} suffix="°" ariaLabel="Morph direction in degrees" />
        </div>
      </>)}

      <button
        onClick={() => dispatch({ type: 'ADD_MORPH_BOUNDARY', payload: { position: defaultMorphBoundaryPosition(config) } })}
        style={addButtonStyle}
      >
        + Add Boundary
      </button>

      {morph.boundaries.length === 0 ? (
        <p style={{
          marginTop: 0,
          marginBottom: 10,
          fontFamily: "'EB Garamond', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
        }}>
          No Boundaries yet — add one, then drag it on canvas (or set its
          position below) to shape the gradient.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {morph.boundaries.map((b, i) => {
            const open = expandedId === b.id
            return (
              <div key={b.id} style={{ border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px' }}>
                  <button onClick={() => setExpandedId(open ? null : b.id)} style={rowHeaderButtonStyle}>
                    {morph.mode === 'radial' ? `Ring ${i + 1}` : `Boundary ${i + 1}`} — {b.position.toFixed(0)}
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'DELETE_MORPH_BOUNDARY', payload: { boundaryId: b.id } })}
                    title="Delete Boundary"
                    style={deleteRowButtonStyle}
                  >
                    ×
                  </button>
                </div>
                {open && (
                  <div style={{ padding: '0 8px 10px' }}>
                    <FieldLabel
                      label="Position"
                      value={b.position.toFixed(0)}
                      tooltip={morph.mode === 'radial' ? 'Ring radius from the Centre.' : 'World-space distance from the Origin along Direction.'}
                    />
                    <input
                      type="range"
                      min={positionMin}
                      max={MORPH_POSITION_RANGE}
                      step={1}
                      value={b.position}
                      onChange={e => dispatch({ type: 'SET_MORPH_BOUNDARY_POSITION', payload: { boundaryId: b.id, position: Number(e.target.value) } })}
                      style={{ width: '100%', marginBottom: 6 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                      <NumberStepper
                        value={Math.round(b.position)}
                        onChange={v => dispatch({ type: 'SET_MORPH_BOUNDARY_POSITION', payload: { boundaryId: b.id, position: v } })}
                        min={positionMin}
                        max={MORPH_POSITION_RANGE}
                        step={1}
                        ariaLabel="Boundary position"
                      />
                    </div>
                    {tileTypes.map(tt => {
                      const fig = config.figures[tt.id]
                      if (!fig) return null
                      const angle = b.figures[tt.id]?.contactAngle ?? fig.contactAngle
                      return (
                        <div key={tt.id} style={{ marginBottom: 8 }}>
                          <FieldLabel label={`${tt.label} angle`} value={angle.toFixed(1)} unit="°" />
                          <input
                            type="range"
                            min={10}
                            max={85}
                            step={0.5}
                            value={angle}
                            onChange={e => dispatch({
                              type: 'SET_MORPH_BOUNDARY_ANGLE',
                              payload: { boundaryId: b.id, tileTypeId: tt.id, field: 'contactAngle', angle: Number(e.target.value) },
                            })}
                            style={{ width: '100%' }}
                          />
                          {fig.vertexLinesDecoupled && (() => {
                            const vAngle = b.figures[tt.id]?.vertexContactAngle ?? fig.vertexContactAngle ?? fig.contactAngle
                            return (
                              <>
                                <FieldLabel label={`${tt.label} vertex angle`} value={vAngle.toFixed(1)} unit="°" />
                                <input
                                  type="range"
                                  min={10}
                                  max={85}
                                  step={0.5}
                                  value={vAngle}
                                  onChange={e => dispatch({
                                    type: 'SET_MORPH_BOUNDARY_ANGLE',
                                    payload: { boundaryId: b.id, tileTypeId: tt.id, field: 'vertexContactAngle', angle: Number(e.target.value) },
                                  })}
                                  style={{ width: '100%' }}
                                />
                              </>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button onClick={() => dispatch({ type: 'REMOVE_MORPH' })} style={removeButtonStyle}>
        Remove Morph
      </button>
    </div>
  )
}
