import type { PatternConfig, StrandLineStyle } from '../../types/pattern'
import type { Action } from '../../state/actions'
import { FieldLabel } from './FieldLabel'
import { Toggle } from './Toggle'

/**
 * Strand-level stroke controls: width, line style, the over–under Lacing
 * toggle, and (when laced) the weave gap. Previously duplicated verbatim in
 * the Gallery Sidebar's "Strand Thickness" section and the Lab's "Display"
 * section — now one component driving both. Strand-level, not Ray-level.
 */
export function StrandStyleControls({ strand, dispatch }: {
  strand: PatternConfig['strand']
  dispatch: React.Dispatch<Action>
}) {
  const weave = strand.weave ?? false
  return (
    <>
      <FieldLabel
        label="Strand width"
        value={strand.width.toFixed(1)}
        unit=" px"
        tooltip="Stroke width applied to every Strand. Dashed/Dotted spacing scales with it too."
      />
      <input
        type="range"
        className="pattern-slider"
        min={1} max={20} step={0.5}
        value={strand.width}
        onChange={e => dispatch({ type: 'SET_STRAND_STYLE', payload: { width: Number(e.target.value) } })}
      />

      <FieldLabel
        label="Strand style"
        tooltip="How each Strand's stroke is drawn. Double/Triple are parallel lines (the middle is cut out, so fills show through); Dashed/Dotted scale with the Strand width."
      />
      <select
        value={strand.lineStyle ?? 'solid'}
        onChange={e => dispatch({ type: 'SET_STRAND_STYLE', payload: { lineStyle: e.target.value as StrandLineStyle } })}
        className="pattern-select"
      >
        <option value="solid">Solid</option>
        <option value="double">Double lines</option>
        <option value="triple">Triple lines</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
      </select>

      {(strand.lineStyle === 'double' || strand.lineStyle === 'triple') && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle
            checked={!!strand.innerFill}
            onChange={v => dispatch({
              type: 'SET_STRAND_STYLE',
              payload: { innerFill: v ? (strand.innerFill ?? '#f5ead6') : undefined },
            })}
            label="Fill between lines"
          />
          {strand.innerFill && (
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(strand.innerFill) ? strand.innerFill : '#f5ead6'}
              onChange={e => dispatch({ type: 'SET_STRAND_STYLE', payload: { innerFill: e.target.value } })}
              title="Colour of the space between the parallel lines"
              style={{ width: 26, height: 20, padding: 0, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
            />
          )}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <Toggle
          checked={weave}
          onChange={() => dispatch({ type: 'SET_STRAND_STYLE', payload: { weave: !weave } })}
          label="Lacing (over–under weave)"
        />
      </div>

      {weave && (
        <>
          <FieldLabel
            label="Weave gap"
            value={(strand.weaveGap ?? 2).toFixed(1)}
            unit=" px"
            tooltip="Breathing space on each side of the over Strand where the under Strand breaks."
          />
          <input
            type="range"
            className="pattern-slider"
            min={0} max={10} step={0.5}
            value={strand.weaveGap ?? 2}
            onChange={e => dispatch({ type: 'SET_STRAND_STYLE', payload: { weaveGap: Number(e.target.value) } })}
          />
        </>
      )}
    </>
  )
}
