import { useState } from 'react'
import type { MorphConfig, MorphSides, PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import {
  MORPH_POSITION_RANGE,
  MORPH_REACH_RANGE,
  defaultMorphOriginPosition,
  morphSideLabels,
  visibleMorphBand,
} from '../../editor/morph'
import { originReach } from '../../pic/morph'
import type { WorldBounds } from '../../editor/guides'
import { editorTileTypes } from '../../editor/tileTypes'
import { FieldLabel, NumberStepper, NudgePad, SectionTitle } from './labShared'
import { Toggle } from '../ui/Toggle'

/** Axis-point nudge range (matches Frame's origin extent). */
const MORPH_AXIS_RANGE = 800
const clampAxis = (n: number) => Math.min(MORPH_AXIS_RANGE, Math.max(-MORPH_AXIS_RANGE, n))

const SIDES_ORDER: MorphSides[] = ['both', 'negative', 'positive']

/** Reach readout — auto-fit can resolve differently per side when the two
 *  neighbours sit at different distances, so show both when they diverge. */
function reachLabel(morph: MorphConfig, i: number): string {
  const neg = originReach(morph.origins, i, -1)
  const pos = originReach(morph.origins, i, 1)
  return Math.abs(neg - pos) < 0.5 ? pos.toFixed(0) : `${neg.toFixed(0)} / ${pos.toFixed(0)}`
}

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

const hintStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 10,
  fontFamily: "'EB Garamond', Georgia, serif",
  fontStyle: 'italic',
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.4,
}

const sideButtonStyle = (on: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '5px 0',
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: `1px solid ${on ? 'var(--accent)' : 'var(--border-subtle)'}`,
  background: on ? 'var(--accent-bg)' : 'transparent',
  color: on ? 'var(--accent)' : 'var(--text-muted)',
})

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
 * PATTERN_MORPH_SPEC.md §UI). Composition Phase only — frozen in
 * Decoration like Strand geometry (the field still applies there). Needs
 * `config.figures` + `config.editor` + `config.morph` together (unlike the
 * editor-only phase panels), so it takes the whole `PatternConfig` rather
 * than just `editor`.
 */
export function MorphPanel({
  config,
  dispatch,
  viewBoundsRef,
  showBoundaries = true,
  onSetShowBoundaries,
}: {
  config: PatternConfig
  dispatch: React.Dispatch<Action>
  /** Canvas's live visible world-rect — keeps Add Boundary's default
   *  position on screen at any pan/zoom. */
  viewBoundsRef?: React.RefObject<WorldBounds | null>
  /** On-canvas overlay visibility (Lab state, not persisted). Adding a
   *  Boundary switches it back on so the new line can't land invisibly. */
  showBoundaries?: boolean
  onSetShowBoundaries?: (v: boolean) => void
}) {
  const morph = config.morph
  // Morph pairs with a bounded artifact — creation is gated on a Frame
  // (user decision 2026-07-18). An existing Morph stays editable if its
  // Frame is later removed (never hide live config behind the gate).
  const hasFrame = !!config.editor?.frame
  // Which Boundary row is expanded — local, independent of the on-canvas
  // selection (only the transient bottom slider syncs with canvas selection;
  // the spec ties the sidebar list to nothing but its own click).
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!morph) {
    return (
      <div style={{ marginTop: 0, marginBottom: 14 }}>
        <SectionTitle tooltip="A Morph interpolates each Tile type's contact angle across the canvas. You place Morph Origins — draggable lines (Linear) or rings (Radial); each holds the base recipe and blends to its own target over its Reach. Composition Phase onward. Needs a Frame.">
          Morph
        </SectionTitle>
        {hasFrame ? (
          <button
            onClick={() => dispatch({ type: 'SET_MORPH_ENABLED', payload: true })}
            style={addButtonStyle}
          >
            + Add Morph
          </button>
        ) : (
          <p style={hintStyle}>
            A Morph needs a Frame — add a Shape or n-Ring Frame in the Frame
            section first.
          </p>
        )}
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
  const sideLabels = morphSideLabels(morph.mode)

  return (
    <div style={{ marginTop: 0, marginBottom: 14 }}>
      <SectionTitle tooltip="A Morph interpolates each Tile type's contact angle across the canvas. You place Morph Origins — draggable lines (Linear) or rings (Radial); each holds the base recipe and blends to its own target over its Reach.">
        Morph
      </SectionTitle>

      {!hasFrame && (
        <p style={hintStyle}>
          This Morph's Frame was removed — a Morph is meant to pair with a
          Frame. Add one in the Frame section, or Remove Morph below.
        </p>
      )}

      <Toggle
        checked={morph.enabled}
        onChange={v => dispatch({ type: 'SET_MORPH_ENABLED', payload: v })}
        label="Enabled"
      />

      {onSetShowBoundaries && morph.enabled && (
        <Toggle
          checked={showBoundaries}
          onChange={onSetShowBoundaries}
          label="Show on canvas"
        />
      )}

      <FieldLabel
        label="Mode"
        tooltip="Linear = Origins are parallel lines along one direction from the Axis point. Radial = Origins are concentric rings around the Centre."
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
        label={morph.mode === 'radial' ? 'Centre' : 'Axis'}
        tooltip="Where the field's distance parameter is measured from — each Origin's Position is its distance from here. Drag its handle on canvas, or nudge here."
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Cinzel', Georgia, serif" }}>X</span>
            <input
              type="range"
              min={-MORPH_AXIS_RANGE}
              max={MORPH_AXIS_RANGE}
              step={1}
              value={morph.axisOrigin.x}
              onChange={e => dispatch({ type: 'SET_MORPH_AXIS_ORIGIN', payload: { x: Number(e.target.value), y: morph.axisOrigin.y } })}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Cinzel', Georgia, serif" }}>Y</span>
            <input
              type="range"
              min={-MORPH_AXIS_RANGE}
              max={MORPH_AXIS_RANGE}
              step={1}
              value={morph.axisOrigin.y}
              onChange={e => dispatch({ type: 'SET_MORPH_AXIS_ORIGIN', payload: { x: morph.axisOrigin.x, y: Number(e.target.value) } })}
              style={{ flex: 1 }}
            />
          </div>
        </div>
        <NudgePad
          step={10}
          onNudge={(dx, dy) => dispatch({
            type: 'SET_MORPH_AXIS_ORIGIN',
            payload: { x: clampAxis(morph.axisOrigin.x + dx), y: clampAxis(morph.axisOrigin.y + dy) },
          })}
          onCenter={() => dispatch({ type: 'SET_MORPH_AXIS_ORIGIN', payload: { x: 0, y: 0 } })}
        />
      </div>

      {morph.mode === 'linear' && (<>
        <FieldLabel
          label="Direction"
          value={directionDeg.toFixed(0)}
          unit="°"
          tooltip="Axis the field runs along, from the Axis point. 0° = +x (right). Each Origin's Left/Right sides are relative to this arrow. Drag the arrow handle on canvas, or type/nudge here."
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
        onClick={() => {
          const bounds = viewBoundsRef?.current
          const band = bounds ? visibleMorphBand(morph, bounds) : null
          dispatch({ type: 'ADD_MORPH_ORIGIN', payload: { position: defaultMorphOriginPosition(config, band) } })
          onSetShowBoundaries?.(true)
        }}
        style={addButtonStyle}
      >
        + Add Origin
      </button>

      {morph.origins.length === 0 ? (
        <p style={hintStyle}>
          No Origins yet — add one, then drag it on canvas (or set its
          position below) to shape the gradient.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {morph.origins.map((o, i) => {
            const open = expandedId === o.id
            return (
              <div key={o.id} style={{ border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px' }}>
                  <button onClick={() => setExpandedId(open ? null : o.id)} style={rowHeaderButtonStyle}>
                    {morph.mode === 'radial' ? `Ring ${i + 1}` : `Origin ${i + 1}`} — {o.position.toFixed(0)}
                    <span style={{ color: 'var(--text-muted)' }}> · ±{reachLabel(morph, i)}</span>
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'DELETE_MORPH_ORIGIN', payload: { originId: o.id } })}
                    title="Delete Origin"
                    style={deleteRowButtonStyle}
                  >
                    ×
                  </button>
                </div>
                {open && (
                  <div style={{ padding: '0 8px 10px' }}>
                    <FieldLabel
                      label="Position"
                      value={o.position.toFixed(0)}
                      tooltip={morph.mode === 'radial' ? 'Ring radius from the Centre. The ring itself holds the base recipe.' : 'World-space distance from the Axis point along Direction. The line itself holds the base recipe.'}
                    />
                    <input
                      type="range"
                      min={positionMin}
                      max={MORPH_POSITION_RANGE}
                      step={1}
                      value={o.position}
                      onChange={e => dispatch({ type: 'SET_MORPH_ORIGIN_POSITION', payload: { originId: o.id, position: Number(e.target.value) } })}
                      style={{ width: '100%', marginBottom: 6 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                      <NumberStepper
                        value={Math.round(o.position)}
                        onChange={v => dispatch({ type: 'SET_MORPH_ORIGIN_POSITION', payload: { originId: o.id, position: v } })}
                        min={positionMin}
                        max={MORPH_POSITION_RANGE}
                        step={1}
                        ariaLabel="Origin position"
                      />
                    </div>

                    <FieldLabel
                      label="Reach"
                      value={reachLabel(morph, i)}
                      tooltip="How far the morph takes place. The angles below are reached this far from the line/ring, and hold beyond it. Larger = a more gradual spread AND more of the gap to the next Origin; 0 = a hard step at the line."
                    />
                    <Toggle
                      checked={o.autoReach === true}
                      onChange={v => dispatch({ type: 'SET_MORPH_ORIGIN_AUTO_REACH', payload: { originId: o.id, autoReach: v } })}
                      label="Auto — meet neighbours halfway"
                    />
                    <input
                      type="range"
                      min={0}
                      max={MORPH_REACH_RANGE}
                      step={1}
                      value={Math.round(originReach(morph.origins, i, 1))}
                      disabled={o.autoReach === true}
                      onChange={e => dispatch({ type: 'SET_MORPH_ORIGIN_REACH', payload: { originId: o.id, reach: Number(e.target.value) } })}
                      style={{ width: '100%', marginBottom: 6, opacity: o.autoReach ? 0.45 : 1 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                      <NumberStepper
                        value={Math.round(originReach(morph.origins, i, 1))}
                        onChange={v => dispatch({ type: 'SET_MORPH_ORIGIN_REACH', payload: { originId: o.id, reach: v } })}
                        min={0}
                        max={MORPH_REACH_RANGE}
                        step={1}
                        ariaLabel="Origin reach"
                      />
                    </div>

                    <FieldLabel
                      label="Sides"
                      tooltip={morph.mode === 'radial'
                        ? 'Which way the morph spreads from the ring — inward toward the Centre, outward, or both. The unused side stays at the base recipe.'
                        : 'Which way the morph spreads from the line, relative to the Direction arrow. The unused side stays at the base recipe.'}
                    />
                    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                      {SIDES_ORDER.map(s => (
                        <button
                          key={s}
                          onClick={() => dispatch({ type: 'SET_MORPH_ORIGIN_SIDES', payload: { originId: o.id, sides: s } })}
                          aria-pressed={o.sides === s}
                          style={sideButtonStyle(o.sides === s)}
                        >
                          {sideLabels[s]}
                        </button>
                      ))}
                    </div>

                    {tileTypes.map(tt => {
                      const fig = config.figures[tt.id]
                      if (!fig) return null
                      const angle = o.figures[tt.id]?.contactAngle ?? fig.contactAngle
                      return (
                        <div key={tt.id} style={{ marginBottom: 8 }}>
                          <FieldLabel label={`${tt.label} angle at reach`} value={angle.toFixed(1)} unit="°" />
                          <input
                            type="range"
                            min={10}
                            max={85}
                            step={0.5}
                            value={angle}
                            onChange={e => dispatch({
                              type: 'SET_MORPH_ORIGIN_ANGLE',
                              payload: { originId: o.id, tileTypeId: tt.id, field: 'contactAngle', angle: Number(e.target.value) },
                            })}
                            style={{ width: '100%' }}
                          />
                          {fig.vertexLinesDecoupled && (() => {
                            const vAngle = o.figures[tt.id]?.vertexContactAngle ?? fig.vertexContactAngle ?? fig.contactAngle
                            return (
                              <>
                                <FieldLabel label={`${tt.label} vertex angle at reach`} value={vAngle.toFixed(1)} unit="°" />
                                <input
                                  type="range"
                                  min={10}
                                  max={85}
                                  step={0.5}
                                  value={vAngle}
                                  onChange={e => dispatch({
                                    type: 'SET_MORPH_ORIGIN_ANGLE',
                                    payload: { originId: o.id, tileTypeId: tt.id, field: 'vertexContactAngle', angle: Number(e.target.value) },
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
