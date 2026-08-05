import type { StrandLineStyle } from '../../types/pattern'
import {
  DEFAULT_LINE_COUNT,
  DEFAULT_STYLE_RATIO,
  LINE_COUNT_MAX,
  STYLE_RATIO_MAX,
  STYLE_RATIO_MIN,
  clampLineCount,
  clampStyleRatio,
} from '../../rendering/strandStyle'
import { FieldLabel } from './FieldLabel'

/** The stroke-style trio, as it lives on both `StrandStyle` and `FrameStroke`. */
export interface LineStyleValue {
  lineStyle?: StrandLineStyle
  lineCount?: number
  styleRatio?: number
}

/**
 * **Line divisions** + **line/gap ratio** — the whole stroke-style vocabulary,
 * shared by the Strand controls and the Decoration panel's Frame border, which
 * both resolve through `strandStyleAttrs`.
 *
 * Divisions and `lineStyle` are one control, not two: "1 line" *is* solid, so
 * a separate style dropdown could only ever disagree with the count. The
 * component writes both fields in a single patch to keep them consistent.
 */
export function LineStyleControls({ value, onChange }: {
  value: LineStyleValue
  onChange: (patch: LineStyleValue) => void
}) {
  const lines = (value.lineStyle ?? 'solid') === 'lines'
  const count = lines ? clampLineCount(value.lineCount ?? DEFAULT_LINE_COUNT) : 1
  const ratio = clampStyleRatio(value.styleRatio ?? DEFAULT_STYLE_RATIO)
  return (
    <>
      <FieldLabel
        label="Line divisions"
        value={count === 1 ? 'Solid' : String(count)}
        tooltip="How many parallel lines each stroke divides into. 1 is a plain solid stroke; higher counts split the same width into that many lines, with the gaps between them cut out so fills and background show through."
      />
      <input
        type="range"
        className="pattern-slider"
        min={1} max={LINE_COUNT_MAX} step={1}
        value={count}
        onChange={e => {
          const n = Number(e.target.value)
          onChange(n <= 1 ? { lineStyle: 'solid' } : { lineStyle: 'lines', lineCount: n })
        }}
      />

      {lines && (
        <>
          <FieldLabel
            label="Line / gap ratio"
            value={ratio.toFixed(2)}
            unit="×"
            tooltip="One line's thickness divided by one gap's. 1× draws lines and gaps equally thick; higher = thicker lines and tighter gaps. The stroke width stays the same either way."
          />
          <input
            type="range"
            className="pattern-slider"
            // Logarithmic: a ratio reads as "twice as much line", so equal
            // travel either side of 1× — a linear track would bunch every
            // thinner-line setting into the first fifth of it.
            min={Math.log2(STYLE_RATIO_MIN)}
            max={Math.log2(STYLE_RATIO_MAX)}
            step={0.02}
            value={Math.log2(ratio)}
            onChange={e => onChange({ styleRatio: clampStyleRatio(2 ** Number(e.target.value)) })}
            onDoubleClick={() => onChange({ styleRatio: DEFAULT_STYLE_RATIO })}
            title="Double-click to reset to 1×"
          />
        </>
      )}
    </>
  )
}
