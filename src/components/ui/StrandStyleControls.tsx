import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import { FieldLabel } from './FieldLabel'
import { GapFillControls } from './GapFillControls'
import { LineStyleControls } from './LineStyleControls'
import { Toggle } from './Toggle'

/**
 * Strand-level stroke controls: width, line divisions + line/gap ratio, the
 * over–under Lacing toggle, and (when laced) the weave gap. Previously duplicated verbatim in
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
        tooltip="Stroke width applied to every Strand. Line divisions split this width, so a divided Strand covers the same span."
      />
      <input
        type="range"
        className="pattern-slider"
        min={1} max={20} step={0.5}
        value={strand.width}
        onChange={e => dispatch({ type: 'SET_STRAND_STYLE', payload: { width: Number(e.target.value) } })}
      />

      <LineStyleControls
        value={strand}
        onChange={payload => dispatch({ type: 'SET_STRAND_STYLE', payload })}
      />

      <GapFillControls
        value={strand}
        onChange={payload => dispatch({ type: 'SET_STRAND_STYLE', payload })}
        defaultColour="#f5ead6"
      />

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
