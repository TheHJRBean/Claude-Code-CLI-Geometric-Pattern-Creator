import type { PatternConfig, StrandLineStyle } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { PaintTarget, StrandPaintScope, VoidPaintScope } from '../../rendering/DecorationPaintLayer'
import { ColourPicker, pushRecentColour } from '../ColourPicker'
import { FieldLabel, segmentedButtonStyle } from './labShared'

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
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  decorationColor: string
  onSetDecorationColor: (c: string) => void
  paintTarget: PaintTarget
  onSetPaintTarget: (t: PaintTarget) => void
  voidScope: VoidPaintScope
  onSetVoidScope: (s: VoidPaintScope) => void
  strandScope: StrandPaintScope
  onSetStrandScope: (s: StrandPaintScope) => void
}

/**
 * Decoration-Phase paint controls in the Builder sidebar: paint target,
 * per-target reach (scope ladder), the colour picker, the apply/remove/clear
 * buttons, and — when a Frame is present — the Frame border-stroke styling.
 * Extracted from `EditorDesignControls`.
 */
export function DecorationPanel({
  editor,
  dispatch,
  decorationColor,
  onSetDecorationColor,
  paintTarget,
  onSetPaintTarget,
  voidScope,
  onSetVoidScope,
  strandScope,
  onSetStrandScope,
}: DecorationPanelProps) {
  const strandRec = editor.decoration?.strandColours.find(r => r.scope === 'congruent' && r.key === '*')
  const strandRecCount = editor.decoration?.strandColours.length ?? 0
  const voidCount = editor.decoration?.voidFills.length ?? 0
  const hasDecoration = strandRecCount > 0 || voidCount > 0
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
      <FieldLabel label="Paint target" tooltip="What clicking on the canvas paints. Off frees panning; Voids fill the gaps between Strands; Strands colour the lines themselves." />
      <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
        {(['off', 'voids', 'strands'] as const).map(t => (
          <button key={t} onClick={() => onSetPaintTarget(t)} style={segButtonStyle(paintTarget === t)}>
            {t === 'off' ? 'Off' : t === 'voids' ? 'Voids' : 'Strands'}
          </button>
        ))}
      </div>
      {paintTarget === 'voids' && (
        <>
          <FieldLabel label="Reach" tooltip="How far one click spreads. Matching = every Void with the clicked shape, everywhere. Twins = the clicked Void plus its rotation/mirror twins within its Cell, in every repeat. Repeat = the clicked Void's spot in every Patch repeat. Single = only the Void you click." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            {([['congruent', 'Matching'], ['cell', 'Twins'], ['patch', 'Repeat'], ['instance', 'Single']] as const).map(([s, label]) => (
              <button key={s} onClick={() => onSetVoidScope(s)} style={segButtonStyle(voidScope === s)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {paintTarget === 'strands' && (
        <>
          <FieldLabel label="Reach" tooltip="How far one click spreads. All = every Strand at once. Matching = every Strand with the clicked Strand's shape. Twins = the clicked Strand plus its rotation/mirror twins within its Cell, in every repeat. Single = just the clicked Strand (it still repeats with the Patch — the pattern stays periodic)." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            {([['all', 'All'], ['congruent', 'Matching'], ['cell', 'Twins'], ['patch', 'Single']] as const).map(([s, label]) => (
              <button key={s} onClick={() => onSetStrandScope(s)} style={segButtonStyle(strandScope === s)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      <ColourPicker value={decorationColor} onChange={onSetDecorationColor} />
      {paintTarget === 'strands' ? (() => {
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
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
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
      </div>
      {hasDecoration && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          {voidCount > 0 && <span>{voidCount} Void group{voidCount === 1 ? '' : 's'} filled</span>}
          {voidCount > 0 && strandRecCount > 0 && <span> · </span>}
          {strandRecCount > 0 && <span>{strandRecCount} Strand colour{strandRecCount === 1 ? '' : 's'}</span>}
        </div>
      )}
      {/* Frame border stroke — the Decoration styling slot ADR-0004
          reserved. Replaces the accent guide line with a real border
          that's part of the artwork (and exports). */}
      {editor.frame && (() => {
        const frame = editor.frame
        const stroke = frame.stroke
        const setStroke = (s: typeof stroke) =>
          dispatch({ type: 'SET_FRAME', payload: { ...frame, stroke: s } })
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
                <button
                  onClick={() => setStroke({ ...stroke, colour: decorationColor })}
                  style={{ ...decorationButtonStyle, marginTop: 6 }}
                >
                  Set border to paint colour
                  <span style={{
                    display: 'inline-block', width: 12, height: 12, marginLeft: 8,
                    background: stroke.colour,
                    border: '1px solid var(--border-subtle)', verticalAlign: 'middle',
                  }} />
                </button>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
