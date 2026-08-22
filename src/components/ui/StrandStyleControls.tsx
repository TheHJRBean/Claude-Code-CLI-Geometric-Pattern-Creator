import type { PatternConfig } from '../../types/pattern'
import { STROKE_WIDTH_MAX, STROKE_WIDTH_MIN, STROKE_WIDTH_STEP } from '../../rendering/strandStyle'
import type { Action } from '../../state/actions'
import type { StrokeCopyDirection } from '../../state/strokeLink'
import { FieldLabel } from './FieldLabel'
import { StrokeFillControls } from './StrokeFillControls'
import { LineStyleControls } from './LineStyleControls'
import { Toggle } from './Toggle'

/**
 * Strand-level stroke controls: width, line divisions + line/gap ratio, the
 * colours of the gaps and of the lines themselves, the over–under Lacing
 * toggle, and (when laced) the weave gap. Previously duplicated verbatim in
 * the Gallery Sidebar's "Strand Thickness" section and the Lab's "Display"
 * section — now one component driving both. Strand-level, not Ray-level.
 */
export function StrandStyleControls({ strand, dispatch, strokeLink }: {
  strand: PatternConfig['strand']
  dispatch: React.Dispatch<Action>
  /** **Link stroke design** (`state/strokeLink.ts`). Absent ⇒ no toggle, which
   *  is right anywhere there is no Frame border to link to. */
  strokeLink?: StrokeLinkControls & { available: boolean }
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
        min={STROKE_WIDTH_MIN} max={STROKE_WIDTH_MAX} step={STROKE_WIDTH_STEP}
        value={strand.width}
        onChange={e => dispatch({ type: 'SET_STRAND_STYLE', payload: { width: Number(e.target.value) } })}
      />

      <LineStyleControls
        value={strand}
        onChange={payload => dispatch({ type: 'SET_STRAND_STYLE', payload })}
      />

      <StrokeFillControls
        value={strand}
        onChange={payload => dispatch({ type: 'SET_STRAND_STYLE', payload })}
        defaultColour="#f5ead6"
        band="gap"
        surface="strand"
      />

      <StrokeFillControls
        value={strand}
        onChange={payload => dispatch({ type: 'SET_STRAND_STYLE', payload })}
        defaultColour={strand.color}
        band="line"
        surface="strand"
      />

      {strokeLink?.available && (
        <div style={{ marginTop: 10 }}>
          <StrokeLinkToggle {...strokeLink} />
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

/**
 * The **Link stroke design** toggle, shown on both ends of the link — beside
 * the Strand controls and inside the Frame border block — because "and vice
 * versa" is only discoverable if you can find the switch from whichever side
 * you are editing. One session-state flag behind both.
 */
export function StrokeLinkToggle({ enabled, onChange, onCopy }: StrokeLinkControls) {
  return (
    <>
      <Toggle
        checked={enabled}
        onChange={onChange}
        label="Link stroke design to Frame border"
        title="Divisions, line/gap ratio and the gap and line colours are kept the same on the Strands and the Frame border, edited from either. Width and the base colour stay separate — a border runs far wider than the line work it surrounds, and the Strand colour is the Decoration phase's."
      />
      {/* The link cannot SEED either side from the other: it only fires on an
          edit, so with it on the only way to make the Strands wear the
          border's design is to edit the Strands — which pushes theirs onto
          the border and destroys what you wanted to copy. Direction has to be
          a control, so here it is, and it works with the link off too. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button
          onClick={() => onCopy('strand-to-border')}
          style={copyButtonStyle}
          title="Give the Frame border the Strands' current divisions, ratio and band colours. Its width and base colour are left alone."
        >
          Copy to border
        </button>
        <button
          onClick={() => onCopy('border-to-strand')}
          style={copyButtonStyle}
          title="Give the Strands the Frame border's current divisions, ratio and band colours. Their width and base colour are left alone."
        >
          Copy to strands
        </button>
      </div>
    </>
  )
}

/** The link's controls: the live toggle plus a one-shot copy in either
 *  direction (`state/strokeLink.ts`). */
export interface StrokeLinkControls {
  enabled: boolean
  onChange: (v: boolean) => void
  onCopy: (direction: StrokeCopyDirection) => void
}

const copyButtonStyle: React.CSSProperties = {
  flex: 1,
  fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)',
  padding: '4px 8px', cursor: 'pointer',
  background: 'transparent',
  border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
}
