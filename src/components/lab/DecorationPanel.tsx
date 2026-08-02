import { useRef, useState } from 'react'
import type { StrandLineStyle } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { PaintTarget, StrandPaintScope, VoidPaintScope } from '../../rendering/DecorationPaintLayer'
import type { PaintVoid } from '../../decoration/resolve'
import { axisAngleDeg, bboxAxisAtAngle, gradientCanonicalBox, rotateAxisTo, seedFrameGradientSpec, seedGradientSpec, DEFAULT_GRADIENT_ANGLE_DEG, type GradientDraft, type GradientSelection, type WorldBBox } from '../../decoration/gradients'
import type { Vec2 } from '../../utils/math'
import type { DecorationConfig, FrameConfig, GradientSpec, VoidStampRecord } from '../../types/editor'
import { downloadAllVoidShapeCanvases, downloadVoidShapePNG, downloadVoidShapeSVG, importStampImage, voidStampCanvas } from '../../export/stampAssets'
import { canonicalPose, canonicalSelfMirror } from '../../decoration/stamps'
import { ColourPicker, pushRecentColour } from '../ColourPicker'
import { FieldLabel, segmentedButtonStyle } from './labShared'
import { StampFocusEditor } from './StampFocusEditor'
import { GradientFocusEditor } from './GradientFocusEditor'
import { GradientAngleRow } from './GradientAngleRow'
import { GradientStopBar } from './GradientStopBar'

/**
 * Which substrate the Decoration Phase is painting.
 *
 * - `'patch'`  — a Builder Patch: a Lattice of repeats built from Cells, so
 *                every Reach rung means something.
 * - `'legacy'` — a Gallery preset / Generator sample / any BFS or Taprats
 *                tiling. No Patch, so no Lattice orbit and no Cells.
 */
export type DecorationSubstrate = 'patch' | 'legacy'

/**
 * The Reach rungs offered per substrate.
 *
 * On a legacy substrate `patch` and `cell` are withheld rather than shown
 * inert: `usePattern` keys those Voids with empty stamp and Cell-frame sets,
 * which makes the `patch` key a duplicate of `instance` and the `cell` key a
 * constant (`legacySubstrate.test.ts` pins both). Offering them would give the
 * user two rungs that quietly do something other than what they say.
 */
const VOID_SCOPES: Record<DecorationSubstrate, readonly (readonly [VoidPaintScope, string])[]> = {
  patch: [['congruent', 'Matching'], ['cell', 'Twins'], ['patch', 'Repeat'], ['instance', 'Single']],
  legacy: [['congruent', 'Matching'], ['instance', 'Single']],
}

const STRAND_SCOPES: Record<DecorationSubstrate, readonly (readonly [StrandPaintScope, string])[]> = {
  patch: [['all', 'All'], ['congruent', 'Matching'], ['cell', 'Twins'], ['patch', 'Single']],
  legacy: [['all', 'All'], ['congruent', 'Matching']],
}

/** Clamp a Reach the substrate can't express back to its coarsest rung. The
 *  Lab keeps one scope selection across substrate switches, so a Patch's
 *  `Twins` must not survive into a preset as an unmatchable key. */
export function clampVoidScope(scope: VoidPaintScope, substrate: DecorationSubstrate): VoidPaintScope {
  return VOID_SCOPES[substrate].some(([s]) => s === scope) ? scope : 'congruent'
}

export function clampStrandScope(scope: StrandPaintScope, substrate: DecorationSubstrate): StrandPaintScope {
  return STRAND_SCOPES[substrate].some(([s]) => s === scope) ? scope : 'congruent'
}

const decorationButtonStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-muted)',
}

interface DecorationPanelProps {
  /** Which substrate is being painted — decides the Reach ladder. */
  substrate: DecorationSubstrate
  /** The config's decoration, from whichever home its substrate uses
   *  (`decoration/store.ts` picks; this panel never looks). */
  decoration: DecorationConfig | undefined
  /** The Frame carrying the decorative border stroke: the Patch's own Frame in
   *  the Builder, the Gallery clip Frame on a legacy substrate. Absent ⇒ the
   *  border-stroke block is hidden. */
  frame: FrameConfig | undefined
  /** Write the Frame back to whichever home it came from. */
  onSetFrame: (f: FrameConfig) => void
  /** World bbox anchoring a freshly seeded gradient — the Frame outline, the
   *  Patch's content, or the visible field. Null ⇒ nothing to span, and the
   *  gradient toggles stay inert. */
  seedBBox: () => WorldBBox | null
  dispatch: React.Dispatch<Action>
  decorationColor: string
  onSetDecorationColor: (c: string) => void
  /** Canvas background — the far stop when seeding the across-frame gradient (#45). */
  background: string
  paintTarget: PaintTarget
  onSetPaintTarget: (t: PaintTarget) => void
  voidScope: VoidPaintScope
  onSetVoidScope: (s: VoidPaintScope) => void
  strandScope: StrandPaintScope
  onSetStrandScope: (s: StrandPaintScope) => void
  /** Gradient target sub-mode — which surface the [This shape · Across frame ·
   * Strands] bar edits. Lifted so the canvas paint-router can treat the
   * `strands` sub-mode as a strand-hit target (scope clicks + on-canvas
   * handles) even though the panel is on the Gradient paint target. */
  gradientMode: 'shape' | 'frame' | 'strands'
  onSetGradientMode: (m: 'shape' | 'frame' | 'strands') => void
  /** Stamp target — the Void shape selected on the canvas (null = none yet). */
  stampSelection: PaintVoid | null
  /** Stamp target — latest canvas Void hit-targets ("Export all shapes"). */
  getStampVoids: () => PaintVoid[]
  /** Gradient target (#44) — the working gradient draft canvas clicks paint. */
  gradientDraft: GradientDraft
  onSetGradientDraft: (d: GradientDraft) => void
  /** Gradient target — the Void group last painted (focus-editor anchor). */
  gradientSelection: GradientSelection | null
  /** Detach the draft from the last-painted group ("New gradient"). */
  onClearGradientSelection: () => void
}

/**
 * Decoration-Phase paint controls in the Builder sidebar: paint target,
 * per-target reach (scope ladder), the colour picker, the apply/remove/clear
 * buttons, and — when a Frame is present — the Frame border-stroke styling.
 * Extracted from `EditorDesignControls`.
 */
export function DecorationPanel({
  substrate,
  decoration,
  frame,
  onSetFrame,
  seedBBox,
  dispatch,
  decorationColor,
  onSetDecorationColor,
  background,
  paintTarget,
  onSetPaintTarget,
  voidScope,
  onSetVoidScope,
  strandScope,
  onSetStrandScope,
  gradientMode,
  onSetGradientMode,
  stampSelection,
  getStampVoids,
  gradientDraft,
  onSetGradientDraft,
  gradientSelection,
  onClearGradientSelection,
}: DecorationPanelProps) {
  const strandRec = decoration?.strandColours.find(r => r.scope === 'congruent' && r.key === '*')
  const strandRecCount = decoration?.strandColours.length ?? 0
  const voidCount = decoration?.voidFills.length ?? 0
  const stampCount = decoration?.voidStamps?.length ?? 0
  const hasDecoration = strandRecCount > 0 || voidCount > 0 || stampCount > 0
  // The Decoration seg buttons match the phase switch minus the hover
  // transition (they snap on click).
  const segButtonStyle = (active: boolean): React.CSSProperties =>
    segmentedButtonStyle(active, { transition: false })
  return (
    <div style={{
      marginTop: 0,
      marginBottom: 14,
      padding: '8px 10px',
      fontFamily: "'EB Garamond', Georgia, serif",
      fontSize: 12,
      color: 'var(--text-muted)',
      lineHeight: 1.45,
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ marginBottom: 8 }}>
        Pick a colour, a Paint target and a reach, then click on the
        canvas. Clicking something already painted in the same colour
        unpaints it. Strand geometry is frozen here — flip back to
        Composition to reshape.
      </div>
      <FieldLabel label="Paint target" tooltip="What clicking on the canvas paints. Off frees panning; Voids fill the gaps between Strands; Strands colour the lines themselves; Stamp selects a Void shape to export as a canvas or fill with an uploaded image; Gradient fills the clicked Void group with a colour gradient." />
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['off', 'voids', 'strands', 'stamp', 'gradient'] as const).map(t => (
          <button key={t} onClick={() => onSetPaintTarget(t)} style={segButtonStyle(paintTarget === t)}>
            {t === 'off' ? 'Off' : t === 'voids' ? 'Voids' : t === 'strands' ? 'Strands' : t === 'stamp' ? 'Stamp' : 'Gradient'}
          </button>
        ))}
      </div>
      {(paintTarget === 'voids' || (paintTarget === 'gradient' && gradientMode !== 'strands')) && (
        <>
          <FieldLabel label="Reach" tooltip="How far one click spreads. Matching = every Void with the clicked shape, everywhere. Twins = the clicked Void plus its rotation/mirror twins within its Cell, in every repeat. Repeat = the clicked Void's spot in every Patch repeat. Single = only the Void you click." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            {VOID_SCOPES[substrate].map(([s, label]) => (
              <button key={s} onClick={() => onSetVoidScope(s)} style={segButtonStyle(voidScope === s)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {paintTarget === 'strands' && (
        <>
          {/* Flat strand colour only — the strand GRADIENT lives on the Gradient
              paint target's [This shape · Across frame · Strands] bar. */}
          <FieldLabel label="Reach" tooltip="How far one click spreads. All = every Strand at once. Matching = every Strand with the clicked Strand's shape. Twins = the clicked Strand plus its rotation/mirror twins within its Cell, in every repeat. Single = just the clicked Strand (it still repeats with the Patch — the pattern stays periodic)." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            {STRAND_SCOPES[substrate].map(([s, label]) => (
              <button key={s} onClick={() => onSetStrandScope(s)} style={segButtonStyle(strandScope === s)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {paintTarget === 'stamp' && (
        <StampSection decoration={decoration} dispatch={dispatch} selection={stampSelection} getStampVoids={getStampVoids} />
      )}
      {paintTarget === 'gradient' && (
        <GradientSection
          substrate={substrate}
          decoration={decoration}
          seedBBox={seedBBox}
          dispatch={dispatch}
          draft={gradientDraft}
          onSetDraft={onSetGradientDraft}
          selection={gradientSelection}
          onClearSelection={onClearGradientSelection}
          decorationColor={decorationColor}
          background={background}
          mode={gradientMode}
          onSetMode={onSetGradientMode}
          strandScope={strandScope}
          onSetStrandScope={onSetStrandScope}
        />
      )}
      {paintTarget !== 'stamp' && paintTarget !== 'gradient' && <ColourPicker value={decorationColor} onChange={onSetDecorationColor} />}
      {paintTarget === 'stamp' || paintTarget === 'gradient' ? null : paintTarget === 'strands' ? (() => {
        // Toggle: if every strand already carries the current paint colour,
        // the button removes it; otherwise it applies/updates. Removal
        // stores the `'none'` sentinel (strands hidden, Void fills meet
        // seamlessly) rather than reverting to the global strand colour —
        // painted fills should touch, strands overlay only when painted.
        const strandsHidden = strandRec?.colour === 'none'
        const sameColour = !!strandRec && strandRec.colour.toLowerCase() === decorationColor.toLowerCase()
        return (
          <button
            onClick={() => {
              if (!sameColour) pushRecentColour(decorationColor)
              dispatch(sameColour
                ? { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: 'none' } }
                : { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: decorationColor } })
            }}
            style={{
              ...decorationButtonStyle,
              ...(sameColour ? { border: '1px solid var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent)' } : null),
            }}
          >
            {sameColour ? 'Remove strand colour' : strandRec && !strandsHidden ? 'Update strand colour' : 'Colour all strands'}
            <span style={{
              display: 'inline-block', width: 12, height: 12, marginLeft: 8,
              background: strandRec && !strandsHidden ? strandRec.colour : 'transparent',
              border: '1px solid var(--border-subtle)', verticalAlign: 'middle',
            }} />
          </button>
        )
      })() : (
        <button
          onClick={() => { pushRecentColour(decorationColor); dispatch({ type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: '*', colour: decorationColor } }) }}
          style={decorationButtonStyle}
        >
          Colour all Voids
        </button>
      )}
      {paintTarget !== 'stamp' && paintTarget !== 'gradient' && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {strandRec?.colour !== 'none' && (
          <button
            onClick={() => dispatch({ type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: 'none' } })}
            style={{ ...decorationButtonStyle, flex: 1 }}
          >
            Remove strand colour
          </button>
        )}
        {strandRec?.colour === 'none' && (
          <button
            onClick={() => dispatch({ type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: null } })}
            style={{ ...decorationButtonStyle, flex: 1 }}
          >
            Restore strands
          </button>
        )}
        {hasDecoration && (
          <button
            onClick={() => dispatch({ type: 'CLEAR_DECORATION' })}
            style={{ ...decorationButtonStyle, flex: 1 }}
          >
            Clear all
          </button>
        )}
      </div>}
      {hasDecoration && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          {voidCount > 0 && <span>{voidCount} Void group{voidCount === 1 ? '' : 's'} filled</span>}
          {voidCount > 0 && strandRecCount > 0 && <span> · </span>}
          {strandRecCount > 0 && <span>{strandRecCount} Strand colour{strandRecCount === 1 ? '' : 's'}</span>}
          {stampCount > 0 && (voidCount > 0 || strandRecCount > 0) && <span> · </span>}
          {stampCount > 0 && <span>{stampCount} Stamp{stampCount === 1 ? '' : 's'}</span>}
        </div>
      )}
      {/* Frame border stroke — the Decoration styling slot ADR-0004
          reserved. Replaces the accent guide line with a real border
          that's part of the artwork (and exports). */}
      {frame && (() => {
        const stroke = frame.stroke
        const setStroke = (s: typeof stroke) => onSetFrame({ ...frame, stroke: s })
        return (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="pattern-checkbox"
                checked={stroke?.enabled ?? false}
                onChange={e => setStroke(e.target.checked
                  ? { enabled: true, colour: stroke?.colour ?? decorationColor, width: stroke?.width ?? 4 }
                  : stroke ? { ...stroke, enabled: false } : undefined)}
              />
              Frame border stroke
            </label>
            {stroke?.enabled && (
              <div style={{ marginTop: 6 }}>
                <FieldLabel
                  label="Border width"
                  value={stroke.width.toFixed(1)}
                  unit=" px"
                  tooltip="Stroke width of the Frame border, in world units — scales with the pattern like Strand width."
                />
                <input
                  type="range"
                  className="pattern-slider"
                  min={0.5} max={30} step={0.5}
                  value={stroke.width}
                  onChange={e => setStroke({ ...stroke, width: Number(e.target.value) })}
                />
                <FieldLabel
                  label="Border style"
                  tooltip="How the border stroke is drawn — same styles as Strands. Double/Triple are parallel lines (the middle is cut out, so the pattern shows through); Dashed/Dotted scale with the border width."
                />
                <select
                  value={stroke.lineStyle ?? 'solid'}
                  onChange={e => setStroke({ ...stroke, lineStyle: e.target.value as StrandLineStyle })}
                  className="pattern-select"
                >
                  <option value="solid">Solid</option>
                  <option value="double">Double lines</option>
                  <option value="triple">Triple lines</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
                {(stroke.lineStyle === 'double' || stroke.lineStyle === 'triple') && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 8 }}>
                    <input
                      type="checkbox"
                      className="pattern-checkbox"
                      checked={!!stroke.innerFill}
                      onChange={e => setStroke(e.target.checked
                        ? { ...stroke, innerFill: stroke.innerFill ?? decorationColor }
                        : { ...stroke, innerFill: undefined })}
                    />
                    Fill between lines
                    {stroke.innerFill && (
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(stroke.innerFill) ? stroke.innerFill : '#f5ead6'}
                        onChange={e => setStroke({ ...stroke, innerFill: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        title="Colour of the space between the parallel border lines"
                        style={{ width: 26, height: 20, padding: 0, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                      />
                    )}
                  </label>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 8 }}>
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(stroke.colour) ? stroke.colour : '#000000'}
                    onChange={e => setStroke({ ...stroke, colour: e.target.value })}
                    title="Colour of the Frame border stroke"
                    style={{ width: 26, height: 20, padding: 0, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                  />
                  Border colour
                </label>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

/**
 * The **Gradient** target's panel section (#44): the working gradient draft —
 * type, stop bar, per-stop colour — that canvas clicks paint onto Void groups
 * at the active Reach; plus the focus-editor entry for reshaping the last
 * painted group's gradient geometry. Draft edits live-update the selected
 * record (stops/type), so tweaking colours after painting shows immediately.
 */
function GradientSection({ substrate, decoration, seedBBox, dispatch, draft, onSetDraft, selection, onClearSelection, decorationColor, background, mode, onSetMode, strandScope, onSetStrandScope }: {
  substrate: DecorationSubstrate
  decoration: DecorationConfig | undefined
  seedBBox: () => WorldBBox | null
  dispatch: React.Dispatch<Action>
  draft: GradientDraft
  onSetDraft: (d: GradientDraft) => void
  selection: GradientSelection | null
  onClearSelection: () => void
  decorationColor: string
  background: string
  /** Which gradient surface this bar edits (lifted — the canvas paint-router
   * treats `strands` as a strand-hit target). */
  mode: 'shape' | 'frame' | 'strands'
  onSetMode: (m: 'shape' | 'frame' | 'strands') => void
  /** Strand-gradient scope reach (shared with flat strand painting). */
  strandScope: StrandPaintScope
  onSetStrandScope: (s: StrandPaintScope) => void
}) {
  const [selectedStop, setSelectedStop] = useState(0)
  const [focusOpen, setFocusOpen] = useState(false)
  const selRec = selection
    ? decoration?.voidFills.find(r => r.scope === selection.scope && r.key === selection.key && r.gradient)
    : undefined
  // Identity outline poses the gradient; the RENDERED one (curved fields) gives
  // it its extent — the same pair the Stamp section below threads, and the same
  // reason: the wash is painted into `polygon`, not `keyPolygon`.
  const outline = selection ? (selection.void.keyPolygon ?? selection.void.polygon) : null
  const rendered = selection ? selection.void.polygon : undefined
  const gradientCount = decoration?.voidFills.filter(r => r.gradient).length ?? 0

  // Draft edits mirror onto the selected record so painted gradients restyle
  // live. Same-type changes keep the record's (possibly focus-edited)
  // geometry; a type flip reseeds it from the shape's canonical box.
  const updateDraft = (next: GradientDraft) => {
    onSetDraft(next)
    if (selection && selRec?.gradient && outline) {
      const spec = next.type === selRec.gradient.type
        ? { ...selRec.gradient, stops: next.stops }
        : seedGradientSpec(next.type, next.stops, outline, next.angleDeg, rendered)
      if (spec) {
        dispatch({
          type: 'SET_DECORATION_VOID_GRADIENT',
          payload: { scope: selection.scope, key: selection.key, colour: next.stops[0].colour, gradient: spec },
        })
      }
    }
  }

  // Angle of the *painted* gradient when one is selected (it may have been
  // reshaped in the focus editor), else the draft's — the number the next
  // canvas click will seed at.
  const selLinear = selRec?.gradient?.type === 'linear' ? selRec.gradient : null
  const currentAngle = selLinear
    ? axisAngleDeg(selLinear.start, selLinear.end)
    : draft.angleDeg ?? DEFAULT_GRADIENT_ANGLE_DEG

  const paintSelected = (gradient: GradientSpec) => {
    if (!selection) return
    dispatch({
      type: 'SET_DECORATION_VOID_GRADIENT',
      payload: { scope: selection.scope, key: selection.key, colour: gradient.stops[0].colour, gradient },
    })
  }

  // Rotate in place: the draft carries the angle forward to the next paint, and
  // a selected group's axis re-aims live without losing the extent it was given
  // in the focus editor.
  const setAngle = (deg: number) => {
    onSetDraft({ ...draft, angleDeg: deg })
    if (selLinear) paintSelected({ ...selLinear, ...rotateAxisTo(selLinear.start, selLinear.end, deg) })
  }

  // Fit needs a real shape to span, so it only appears with a group selected.
  const fitAngle = outline && selLinear
    ? () => {
      const box = gradientCanonicalBox(outline, rendered)
      if (!box) return
      paintSelected({
        ...selLinear,
        ...bboxAxisAtAngle(
          { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height },
          currentAngle,
        ),
      })
    }
    : undefined

  const stops = draft.stops
  const stopColour = selectedStop >= 0 && selectedStop < stops.length ? stops[selectedStop].colour : stops[0].colour

  return (
    <div style={{ marginBottom: 8 }}>
      <FieldLabel label="Mode" tooltip="This shape paints a gradient onto the clicked Void group, repeated across every congruent instance. Across frame lays one gradient as a background wash behind the whole composition. Strands strokes one gradient across the Strand lines (scope it to a group with the Reach + a Strand click)." />
      <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
        {(['shape', 'frame', 'strands'] as const).map(m => (
          <button
            key={m}
            onClick={() => onSetMode(m)}
            style={segmentedButtonStyle(mode === m, { transition: false })}
          >
            {m === 'shape' ? 'This shape' : m === 'frame' ? 'Across frame' : 'Strands'}
          </button>
        ))}
      </div>
      {mode === 'frame' ? (
        <FrameGradientControls decoration={decoration} seedBBox={seedBBox} dispatch={dispatch} decorationColor={decorationColor} background={background} />
      ) : mode === 'strands' ? (
        <>
          <FieldLabel label="Reach" tooltip="How far a Strand click scopes the wash. All = every Strand (the default wash). Matching = the clicked Strand's shape everywhere. Twins = its rotation/mirror twins within its Cell. Single = the clicked Strand's Lattice orbit. Pick a reach, then click a Strand on the canvas — the rest keep their flat colour." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            {STRAND_SCOPES[substrate].map(([s, label]) => (
              <button
                key={s}
                onClick={() => {
                  onSetStrandScope(s)
                  // `All` is unambiguous — reset the wash to every Strand at once.
                  // The positioned rungs still need a Strand click to pick which
                  // group.
                  if (s === 'all') dispatch({ type: 'SET_STRAND_GRADIENT_SCOPE', payload: null })
                }}
                style={segmentedButtonStyle(strandScope === s, { transition: false })}
              >
                {label}
              </button>
            ))}
          </div>
          <StrandGradientControls decoration={decoration} seedBBox={seedBBox} dispatch={dispatch} decorationColor={decorationColor} background={background} />
        </>
      ) : (
        <>
      <FieldLabel label="Gradient" tooltip="The working gradient. Linear runs along an axis; Radial radiates from a centre. Click a marker to select a stop, drag it to move, click the bar to add one; double-click a marker or use a well's × to remove one (min 2). × Multiply deepens the selected stop's colour (repeat to intensify). Then click a Void on the canvas to paint it; clicking again with the same stops unpaints." />
      <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
        {(['linear', 'radial'] as const).map(t => (
          <button
            key={t}
            onClick={() => updateDraft({ ...draft, type: t })}
            style={segmentedButtonStyle(draft.type === t, { transition: false })}
          >
            {t === 'linear' ? 'Linear' : 'Radial'}
          </button>
        ))}
      </div>
      <GradientStopBar
        stops={stops}
        selected={selectedStop}
        onSelect={setSelectedStop}
        onChange={s => updateDraft({ ...draft, stops: s })}
      />
      {draft.type === 'linear' && (
        <GradientAngleRow
          angleDeg={currentAngle}
          onAngle={setAngle}
          onFit={fitAngle}
          fitLabel="Fit to shape"
          tooltip="Direction the gradient runs inside each Void. Pick a compass preset, drag the slider, or type an exact angle (fractions allowed). Measured in the shape's own frame — that's what keeps every congruent Void in the group matching, so it won't read as the same angle on screen for a rotated copy. With a group selected the axis re-aims live, keeping the length it was given in Focus mode; Fit to shape stretches it back across the whole shape."
        />
      )}
      <ColourPicker
        value={stopColour}
        onChange={c => updateDraft({
          ...draft,
          stops: stops.map((s, i) => (i === selectedStop ? { ...s, colour: c } : s)),
        })}
      />
      {!selection && (
        <div style={{ fontSize: 11, fontStyle: 'italic', marginTop: 6 }}>
          Click a Void on the canvas to paint this gradient onto its group.
          Click an already-painted gradient to select it for editing.
        </div>
      )}
      {selection && (
        <div style={{ fontSize: 11, fontStyle: 'italic', marginTop: 6 }}>
          Edits restyle the last-painted group live. “New gradient” detaches
          the draft so painted groups keep their colours.
        </div>
      )}
      {selRec?.gradient && outline && (
        <button
          onClick={() => setFocusOpen(true)}
          style={{ ...decorationButtonStyle, width: '100%', marginTop: 8 }}
          title="Open the shape full-screen and drag the gradient's axis or centre/radius handles"
        >
          Focus mode — shape the gradient…
        </button>
      )}
      {selection && (
        <button
          onClick={onClearSelection}
          style={{ ...decorationButtonStyle, width: '100%', marginTop: 8 }}
          title="Detach the working gradient from the last-painted group — colour edits stop restyling it, and the next canvas click paints a fresh gradient"
        >
          New gradient
        </button>
      )}
      {gradientCount > 0 && (
        <div style={{ fontSize: 11, marginTop: 8 }}>
          {gradientCount} gradient{gradientCount === 1 ? '' : 's'} painted
        </div>
      )}
      {focusOpen && selRec?.gradient && outline && selection && (
        <GradientFocusEditor
          spec={selRec.gradient}
          outline={outline}
          renderedOutline={rendered}
          title={selection.void.signature}
          onApply={spec => {
            onSetDraft({ type: spec.type, stops: spec.stops })
            dispatch({
              type: 'SET_DECORATION_VOID_GRADIENT',
              payload: { scope: selection.scope, key: selection.key, colour: spec.stops[0].colour, gradient: spec },
            })
          }}
          onClose={() => setFocusOpen(false)}
        />
      )}
        </>
      )}
    </div>
  )
}

/**
 * The **Across-frame** gradient sub-panel (#45): enable toggle + type + stop
 * bar + colour picker for the single world-space underlay gradient. First
 * enable seeds a vertical linear gradient across the Frame bbox (content-bbox
 * fallback), stops = current decoration colour → canvas background. Geometry is
 * then reshaped by dragging the on-canvas handles; this panel only edits
 * type/stops (geometry rides through untouched on a same-type edit; a type flip
 * reseeds it). One gradient per composition — no scope ladder, no canvas paint.
 */
/**
 * A world-space linear gradient's angle row (frame + strand washes). Typing /
 * picking / dragging an angle **rotates the axis in place** (midpoint + length
 * kept), so a hand-dragged extent survives; **Fit** re-spans it across the
 * world bbox at the current angle for a full-frame wash. Radial specs have no
 * axis angle and render nothing.
 */
function WorldGradientAngleRow({ spec, getBox, onAxis }: {
  spec: GradientSpec
  getBox: () => WorldBBox | null
  onAxis: (start: Vec2, end: Vec2) => void
}) {
  if (spec.type !== 'linear') return null
  const current = axisAngleDeg(spec.start, spec.end)
  return (
    <GradientAngleRow
      angleDeg={current}
      onAngle={deg => {
        const { start, end } = rotateAxisTo(spec.start, spec.end, deg)
        onAxis(start, end)
      }}
      onFit={() => {
        const box = getBox()
        if (!box) return
        const { start, end } = bboxAxisAtAngle(box, current)
        onAxis(start, end)
      }}
    />
  )
}

function FrameGradientControls({ decoration, seedBBox, dispatch, decorationColor, background }: {
  decoration: DecorationConfig | undefined
  seedBBox: () => WorldBBox | null
  dispatch: React.Dispatch<Action>
  decorationColor: string
  background: string
}) {
  const [selectedStop, setSelectedStop] = useState(0)
  const fg = decoration?.frameGradient
  const enabled = fg?.enabled === true

  // The world bbox the seed spans is substrate-specific (Frame outline, Patch
  // content, or the visible field) — injected rather than derived here.
  const seedBox = seedBBox

  // `enabled: on` after `...next` — toggling OFF passes the current spec (with
  // `enabled: true`) as `next`, which must not clobber the `on=false` (else the
  // checkbox can't be unchecked).
  const set = (next: GradientSpec, on: boolean) =>
    dispatch({ type: 'SET_DECORATION_FRAME_GRADIENT', payload: { ...next, enabled: on } })

  const toggle = () => {
    if (fg) { set(fg, !enabled); return }
    // First enable — seed geometry from the content/frame bbox.
    const box = seedBox()
    if (!box) return
    set(seedFrameGradientSpec('linear', box, decorationColor, background), true)
  }

  // Type flip reseeds geometry (keeping current stops); a same-type change is
  // impossible here (there's only one type per spec), so this always reseeds.
  const setType = (type: GradientSpec['type']) => {
    const box = seedBox()
    if (!box || !fg) return
    const seeded = seedFrameGradientSpec(type, box, decorationColor, background)
    set({ ...seeded, stops: fg.stops }, enabled)
  }

  const setStops = (stops: GradientSpec['stops']) => {
    if (!fg) return
    set({ ...fg, stops }, enabled)
  }

  const stops = fg?.stops ?? [{ offset: 0, colour: decorationColor }, { offset: 1, colour: background }]
  const stopColour = selectedStop >= 0 && selectedStop < stops.length ? stops[selectedStop].colour : stops[0].colour

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={toggle} />
        Enable across-frame gradient
      </label>
      {!fg && (
        <div style={{ fontSize: 11, fontStyle: 'italic', marginTop: 6 }}>
          Lays one gradient as a background wash behind the whole composition —
          the strands and any painted Voids sit on top.
        </div>
      )}
      {fg && (
        <>
          <FieldLabel label="Gradient" tooltip="The across-frame wash. Linear runs along an axis; Radial radiates from a centre. Drag the handles on the canvas to place it. Click a marker to select a stop, drag it to move, click the bar to add one; double-click a marker to remove one (min 2)." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {(['linear', 'radial'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={segmentedButtonStyle(fg.type === t, { transition: false })}
              >
                {t === 'linear' ? 'Linear' : 'Radial'}
              </button>
            ))}
          </div>
          <GradientStopBar
            stops={stops}
            selected={selectedStop}
            onSelect={setSelectedStop}
            onChange={setStops}
          />
          <ColourPicker
            value={stopColour}
            onChange={c => setStops(stops.map((s, i) => (i === selectedStop ? { ...s, colour: c } : s)))}
          />
          <div style={{ fontSize: 11, fontStyle: 'italic', marginTop: 6 }}>
            Drag the {fg.type === 'linear' ? 'start/end' : 'centre/radius'} handles
            on the canvas to place the gradient.
          </div>
          {fg.type === 'linear' && (
            <WorldGradientAngleRow spec={fg} getBox={seedBox} onAxis={(start, end) => set({ type: 'linear', stops: fg.stops, start, end }, enabled)} />
          )}
        </>
      )}
    </div>
  )
}

/**
 * The **strand gradient** sub-panel (#46, DECORATION_GRADIENTS_SPEC v2): enable
 * toggle + type + stop bar + colour picker for the single world-space gradient
 * stroked across every Strand. First enable seeds a vertical linear gradient
 * across the composition bbox (Frame outline when present), stops = current
 * decoration colour → canvas background. Geometry is then reshaped by dragging
 * the on-canvas handles; this panel edits enable/type/stops/angle (same-type
 * edits ride the geometry through untouched; a type flip reseeds it). Lives in
 * the Gradient paint target's **Strands** sub-mode; the Reach selector above it
 * + a canvas Strand click scope the wash to a group (#46 ladder).
 */
function StrandGradientControls({ decoration, seedBBox, dispatch, decorationColor, background }: {
  decoration: DecorationConfig | undefined
  seedBBox: () => WorldBBox | null
  dispatch: React.Dispatch<Action>
  decorationColor: string
  background: string
}) {
  const [selectedStop, setSelectedStop] = useState(0)
  const sg = decoration?.strandGradient
  const enabled = sg?.enabled === true

  // The world bbox the seed spans is substrate-specific (Frame outline, Patch
  // content, or the visible field) — injected rather than derived here.
  const seedBox = seedBBox

  // Preserve any active scope (#46) across type / stop / enable edits — the
  // reducer setter is a dumb replace, so a dropped scope/scopeKey would silently
  // widen the wash back to every Strand.
  const set = (next: GradientSpec, on: boolean) =>
    dispatch({
      type: 'SET_DECORATION_STRAND_GRADIENT',
      // `enabled: on` MUST come after `...next`: toggling OFF passes the current
      // spec as `next` (it carries `enabled: true`), which would otherwise
      // clobber the `on=false` and make the "Enable" checkbox impossible to
      // uncheck (the wash could never be removed).
      payload: {
        ...(sg?.scopeKey ? { scopeKey: sg.scopeKey } : {}),
        ...(sg?.scope ? { scope: sg.scope } : {}),
        ...next,
        enabled: on,
      },
    })

  const toggle = () => {
    if (sg) { set(sg, !enabled); return }
    const box = seedBox()
    if (!box) return
    set(seedFrameGradientSpec('linear', box, decorationColor, background), true)
  }

  const setType = (type: GradientSpec['type']) => {
    const box = seedBox()
    if (!box || !sg) return
    const seeded = seedFrameGradientSpec(type, box, decorationColor, background)
    set({ ...seeded, stops: sg.stops }, enabled)
  }

  const setStops = (stops: GradientSpec['stops']) => {
    if (!sg) return
    set({ ...sg, stops }, enabled)
  }

  const stops = sg?.stops ?? [{ offset: 0, colour: decorationColor }, { offset: 1, colour: background }]
  const stopColour = selectedStop >= 0 && selectedStop < stops.length ? stops[selectedStop].colour : stops[0].colour
  // Reach-rung label for the scope status line (absent scope ⇒ congruent).
  const scopeLabel = sg?.scope === 'cell' ? 'Twins' : sg?.scope === 'patch' ? 'Single' : 'Matching'

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={toggle} />
        Enable strand gradient
      </label>
      {!sg && (
        <div style={{ fontSize: 11, fontStyle: 'italic', marginTop: 6 }}>
          Strokes one gradient across every Strand — a continuous colour wash
          flowing over the whole pattern.
        </div>
      )}
      {sg && (
        <>
          <FieldLabel label="Gradient" tooltip="The strand wash. Linear runs along an axis; Radial radiates from a centre. Drag the handles on the canvas to place it. Click a marker to select a stop, drag it to move, click the bar to add one; double-click a marker to remove one (min 2)." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {(['linear', 'radial'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={segmentedButtonStyle(sg.type === t, { transition: false })}
              >
                {t === 'linear' ? 'Linear' : 'Radial'}
              </button>
            ))}
          </div>
          <GradientStopBar
            stops={stops}
            selected={selectedStop}
            onSelect={setSelectedStop}
            onChange={setStops}
          />
          <ColourPicker
            value={stopColour}
            onChange={c => setStops(stops.map((s, i) => (i === selectedStop ? { ...s, colour: c } : s)))}
          />
          <div style={{ fontSize: 11, fontStyle: 'italic', marginTop: 6 }}>
            Drag the {sg.type === 'linear' ? 'start/end' : 'centre/radius'} handles
            on the canvas to place the gradient.
          </div>
          {sg.type === 'linear' && (
            <WorldGradientAngleRow spec={sg} getBox={seedBox} onAxis={(start, end) => set({ type: 'linear', stops: sg.stops, start, end }, enabled)} />
          )}
          <div style={{ marginTop: 10 }}>
            <FieldLabel label="Scope" tooltip="Which Strands the wash covers. Pick a Reach above, then click a Strand on the canvas to narrow the wash to that group — the rest keep their flat colour. 'Wash all' clears the scope back to every Strand." />
            {sg.scopeKey && sg.scopeKey !== '*' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span>Scoped to a {scopeLabel} group.</span>
                <button
                  onClick={() => dispatch({ type: 'SET_STRAND_GRADIENT_SCOPE', payload: null })}
                  style={segmentedButtonStyle(false, { transition: false })}
                >
                  Wash all
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 11, fontStyle: 'italic' }}>
                Washing across every Strand. Pick a Reach above, then click a
                Strand on the canvas to scope the wash to that group.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Turning Overlap back off drops the flag rather than storing `false`, so a
 * record that never used it stays byte-identical to a pre-Overlap save. */
function omitOverlap(rec: VoidStampRecord): VoidStampRecord {
  const next = { ...rec }
  delete next.overlap
  return next
}

/** Same for Mirror: back to the default handedness drops the field. */
function omitMirror(rec: VoidStampRecord): VoidStampRecord {
  const next = { ...rec }
  delete next.mirror
  return next
}

/** The class-handedness rungs, in panel order. `null` = the default (each
 * instance keeps its pose's own handedness). */
const MIRROR_MODES: readonly (readonly [VoidStampRecord['mirror'] | null, string])[] = [
  [null, 'Reflect'], ['never', 'Upright'], ['all', 'Flipped'],
]

/** Row control cycles the same three, since a row has no space for a bar. */
function nextMirrorMode(rec: VoidStampRecord): VoidStampRecord {
  const i = MIRROR_MODES.findIndex(([m]) => m === (rec.mirror ?? null))
  const next = MIRROR_MODES[(i + 1) % MIRROR_MODES.length][0]
  return next ? { ...rec, mirror: next } : omitMirror(rec)
}

/**
 * The **Stamp** target's panel section: inspect the selected Void shape,
 * export a blank canvas at its exact canonical proportions (design a stamp
 * externally), and upload an image that fills every congruent Void, clipped
 * to the shape. One stamp record per Void signature (v1 congruent scope).
 */
function StampSection({ decoration, dispatch, selection, getStampVoids }: {
  decoration: DecorationConfig | undefined
  dispatch: React.Dispatch<Action>
  selection: PaintVoid | null
  getStampVoids: () => PaintVoid[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportAllNote, setExportAllNote] = useState<string | null>(null)
  const [exportingAll, setExportingAll] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)

  const exportAll = async (format: 'svg' | 'png') => {
    setExportingAll(true)
    setExportAllNote(null)
    try {
      const count = await downloadAllVoidShapeCanvases(getStampVoids(), format)
      setExportAllNote(count === 0
        ? 'No Void shapes on the canvas to export.'
        : `Exported ${count} shape canvas${count === 1 ? '' : 'es'}.`)
    } finally {
      setExportingAll(false)
    }
  }
  const stamps = decoration?.voidStamps ?? []
  const selRec = selection
    ? stamps.find(r => r.scope === 'congruent' && r.key === selection.signature)
    : undefined
  // Identity outline poses the canvas; the RENDERED one (curved fields) gives
  // it its guide shape and box, so the design matches what the stamp is
  // actually clipped to — see `stampGeometry`.
  const outline = selection ? (selection.keyPolygon ?? selection.polygon) : null
  const rendered = selection ? selection.polygon : undefined
  const canvasInfo = outline ? voidStampCanvas(outline, rendered) : null
  // Does this shape have a mirror axis of its own? If it does, Upright is
  // exact — the Focus layout arrives rigidly moved. If it doesn't, no map can
  // keep BOTH the motif's handedness and its placement against the outline, so
  // the panel says which one Upright gives up rather than leaving the user to
  // hunt for a setting that can't exist.
  const uprightIsExact = outline
    ? canonicalSelfMirror(canonicalPose(outline)?.points ?? []) !== null
    : true

  const upload = async (file: File) => {
    if (!selection) return
    setBusy(true)
    setError(null)
    try {
      const img = await importStampImage(file)
      dispatch({
        type: 'SET_DECORATION_VOID_STAMP',
        // Keep the fit + Focus-mode adjustment when replacing the image so
        // an externally-iterated design doesn't reset its placement.
        payload: {
          scope: 'congruent', key: selection.signature, fit: selRec?.fit ?? 'cover',
          ...(selRec?.transform ? { transform: selRec.transform } : null),
          ...img,
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'image import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {!selection && (
        <div style={{ fontSize: 11, fontStyle: 'italic', marginBottom: 8 }}>
          Click a Void on the canvas to inspect its shape. Matching Voids
          highlight together — a stamp fills all of them.
        </div>
      )}
      {selection && canvasInfo && (
        <div style={{ border: '1px solid var(--border-subtle)', padding: '6px 8px', marginBottom: 8 }}>
          <div style={{ fontSize: 11, marginBottom: 6 }}>
            <strong>Shape {selection.signature.slice(0, 8)}</strong>
            {' — '}{canvasInfo.points.length} vertices · canvas {canvasInfo.box.width.toFixed(1)} × {canvasInfo.box.height.toFixed(1)} · area {selection.area.toFixed(1)}
          </div>
          <FieldLabel label="Shape canvas" tooltip="Download a blank, transparent canvas at this Void's exact proportions with the outline as a guide layer. Design a stamp on it externally, then upload it below — it lands back at exactly this size and orientation on every matching Void." />
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              onClick={() => downloadVoidShapeSVG(outline!, `void-${selection.signature.slice(0, 8)}-canvas.svg`, rendered)}
              style={{ ...decorationButtonStyle, flex: 1 }}
            >
              Export SVG
            </button>
            <button
              onClick={() => downloadVoidShapePNG(outline!, `void-${selection.signature.slice(0, 8)}-canvas.png`, 1024, rendered)}
              style={{ ...decorationButtonStyle, flex: 1 }}
            >
              Export PNG
            </button>
          </div>
          <FieldLabel label="Stamp image" tooltip="Upload an image (PNG/JPG/SVG/WebP) to fill every matching Void, cropped to the Void shape. Cover scales the image to fill the shape's box (overflow is clipped); Contain fits it inside. Images made on the exported shape canvas fit exactly." />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={{ ...decorationButtonStyle, width: '100%', opacity: busy ? 0.5 : 1 }}
          >
            {busy ? 'Importing…' : selRec ? 'Replace stamp image…' : 'Upload stamp image…'}
          </button>
          {error && <div style={{ fontSize: 11, color: 'var(--danger, #c0392b)', marginTop: 4 }}>{error}</div>}
          {selRec && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <img
                src={selRec.image}
                alt="stamp"
                style={{ height: 32, width: 32, objectFit: 'cover', border: '1px solid var(--border-subtle)' }}
              />
              <div style={{ display: 'flex', gap: 0, flex: 1 }}>
                {(['cover', 'contain'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => dispatch({ type: 'SET_DECORATION_VOID_STAMP', payload: { ...selRec, fit: f } })}
                    style={segmentedButtonStyle(selRec.fit === f, { transition: false })}
                  >
                    {f === 'cover' ? 'Cover' : 'Contain'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => dispatch({ type: 'REMOVE_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: selection.signature } })}
                style={decorationButtonStyle}
                title="Remove this stamp"
              >
                ✕
              </button>
            </div>
          )}
          {selRec && (
            <div style={{ marginTop: 6 }}>
              <FieldLabel
                label="Overlap"
                tooltip="Off (default): the image is cropped to the Void outline. On: it draws whole and may spill over neighbouring shapes — zoom it up in Focus mode to make it bleed. Where two spilling stamps meet, the one nearer the front of the stack below wins."
              />
              <div style={{ display: 'flex', gap: 0 }}>
                {([false, true] as const).map(v => (
                  <button
                    key={String(v)}
                    onClick={() => dispatch({
                      type: 'SET_DECORATION_VOID_STAMP',
                      payload: v ? { ...selRec, overlap: true } : omitOverlap(selRec),
                    })}
                    style={segmentedButtonStyle((selRec.overlap === true) === v, { transition: false })}
                  >
                    {v ? 'Overlap' : 'Clip to shape'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selRec && (
            <div style={{ marginTop: 6 }}>
              <FieldLabel
                label="Mirror"
                tooltip="A Void shape and its mirror image are ONE congruent class, and on most fields it splits about half and half. Reflect (default) lets each instance keep its own handedness, so the stamps inherit the tiling's reflection symmetry. Upright and Flipped both make the whole class agree — Upright as the Focus editor shows it, Flipped mirrored from it. If neither reads right, flip the image itself in Focus mode."
              />
              <div style={{ display: 'flex', gap: 0 }}>
                {MIRROR_MODES.map(([mode, label]) => (
                  <button
                    key={label}
                    onClick={() => dispatch({
                      type: 'SET_DECORATION_VOID_STAMP',
                      payload: mode ? { ...selRec, mirror: mode } : omitMirror(selRec),
                    })}
                    style={segmentedButtonStyle((selRec.mirror ?? null) === mode, { transition: false })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!uprightIsExact && selRec.mirror && (
                <div style={{ fontSize: 10, fontStyle: 'italic', opacity: 0.75, marginTop: 3 }}>
                  This shape has no mirror axis, so half its Voids are true
                  mirror images. The whole class now agrees on handedness, but
                  on that half the image sits mirrored against the outline —
                  no setting can give you both.
                </div>
              )}
            </div>
          )}
          {selRec && (
            <button
              onClick={() => setFocusOpen(true)}
              style={{ ...decorationButtonStyle, width: '100%', marginTop: 6 }}
              title="Open the shape full-screen and pan / zoom / rotate the image inside it"
            >
              Focus mode — adjust placement…
            </button>
          )}
        </div>
      )}
      {focusOpen && selRec && outline && (
        <StampFocusEditor
          record={selRec}
          outline={outline}
          renderedOutline={rendered}
          onApply={rec => dispatch({ type: 'SET_DECORATION_VOID_STAMP', payload: rec })}
          onClose={() => setFocusOpen(false)}
        />
      )}
      <FieldLabel label="All shape canvases" tooltip="Download one blank, transparent shape canvas per distinct Void shape on the canvas, named by shape (triangle-1, triangle-2, 6-gon, hexagon…). Design stamps on them externally, then upload each below." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['svg', 'png'] as const).map(f => (
          <button
            key={f}
            onClick={() => void exportAll(f)}
            disabled={exportingAll}
            style={{ ...decorationButtonStyle, flex: 1, opacity: exportingAll ? 0.5 : 1 }}
          >
            {exportingAll ? 'Exporting…' : `Export all ${f.toUpperCase()}`}
          </button>
        ))}
      </div>
      {exportAllNote && <div style={{ fontSize: 11, marginBottom: 8 }}>{exportAllNote}</div>}
      {stamps.length > 0 && (
        <div style={{ fontSize: 11 }}>
          <FieldLabel
            label="Stamp stack — front to back"
            tooltip="Every Void shape carrying a stamp, front-most first. ▲ brings a stamp forward, ▼ sends it back; the order decides who wins where two Overlap stamps meet. ✕ removes one."
          />
          {/* Painted last = in front, so the array is walked backwards here:
              the list reads top-of-stack down, like every other layer stack. */}
          {stamps.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
            <div
              key={`${r.scope}:${r.key}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px',
                border: '1px solid var(--border-subtle)', marginBottom: 3,
                background: selection && r.key === selection.signature ? 'var(--accent-bg, rgba(212,175,55,0.12))' : 'transparent',
              }}
            >
              <img src={r.image} alt="" style={{ height: 22, width: 22, objectFit: 'cover' }} />
              <span style={{ flex: 1, fontFamily: 'monospace' }}>{r.key.slice(0, 8)}</span>
              {/* Overlap is per record, so it belongs on the row as well as in
                  the selected-shape block — reachable without re-clicking the
                  exact Void on the canvas. */}
              <button
                onClick={() => dispatch({
                  type: 'SET_DECORATION_VOID_STAMP',
                  payload: r.overlap ? omitOverlap(r) : { ...r, overlap: true },
                })}
                style={{ ...decorationButtonStyle, padding: '2px 6px', ...(r.overlap ? { border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-bg)' } : null) }}
                title={r.overlap ? 'Overlap ON — the image draws whole and may spill onto its neighbours. Click to clip it back to the shape.' : 'Clipped to the shape. Click to let the image spill onto its neighbours.'}
              >
                {r.overlap ? 'Overlap' : 'Clipped'}
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_DECORATION_VOID_STAMP', payload: nextMirrorMode(r) })}
                style={{ ...decorationButtonStyle, padding: '2px 5px', minWidth: 46, ...(r.mirror ? { border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-bg)' } : null) }}
                title="Handedness across this shape class: Reflect (each instance keeps its own) → Upright (all as Focus mode shows it) → Flipped (all mirrored from it). Click to cycle."
              >
                {r.mirror === 'never' ? 'Up' : r.mirror === 'all' ? 'Flip' : 'Refl'}
              </button>
              <button
                onClick={() => dispatch({ type: 'REORDER_DECORATION_VOID_STAMP', payload: { scope: r.scope, key: r.key, move: 'forward' } })}
                disabled={i === stamps.length - 1}
                style={{ ...decorationButtonStyle, padding: '2px 5px', opacity: i === stamps.length - 1 ? 0.3 : 1 }}
                title="Bring forward"
              >
                ▲
              </button>
              <button
                onClick={() => dispatch({ type: 'REORDER_DECORATION_VOID_STAMP', payload: { scope: r.scope, key: r.key, move: 'backward' } })}
                disabled={i === 0}
                style={{ ...decorationButtonStyle, padding: '2px 5px', opacity: i === 0 ? 0.3 : 1 }}
                title="Send back"
              >
                ▼
              </button>
              <button
                onClick={() => dispatch({ type: 'REMOVE_DECORATION_VOID_STAMP', payload: { scope: r.scope, key: r.key } })}
                style={{ ...decorationButtonStyle, padding: '2px 6px' }}
                title="Remove this stamp"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
