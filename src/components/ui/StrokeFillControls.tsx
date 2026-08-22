import type { GapFillMode, StrandLineStyle } from '../../types/pattern'
import {
  DEFAULT_LINE_COUNT,
  gapCount,
  gapRingCount,
  lineRingCount,
  ringGapIndices,
  ringLineIndices,
} from '../../rendering/strandStyle'
import { FieldLabel } from './FieldLabel'
import { Toggle } from './Toggle'

/** The band-fill slice of `StrandStyle` / `FrameStroke` — both bands' fields,
 *  since one control edits whichever the caller points it at. */
export interface StrokeFillValue {
  lineStyle?: StrandLineStyle
  lineCount?: number
  innerFill?: string
  gapFills?: (string | null)[]
  gapFillMode?: GapFillMode
  lineFills?: (string | null)[]
  lineFillMode?: GapFillMode
}

/** Which band of a divided stroke this control paints. */
export type StrokeBand = 'gap' | 'line'

/** Which stroke it is painting — wording only. The geometry is identical; what
 *  differs is that a border's two sides are outward and inward, and a Strand's
 *  are whichever way its Rays chained. */
export type StrokeSurface = 'strand' | 'border'

/**
 * **Colouring the bands of a divided stroke**, at three grains:
 *
 * - **All** — one colour for every band.
 * - **Matching** — a colour per *ring*: a band and its mirror on the far side
 *   of the stroke move together, so the stroke stays symmetric.
 * - **Individual** — a colour per band, so the stroke can be asymmetric.
 *
 * One component for both bands. The **gaps** and the **lines** are the same
 * geometry read at opposite parity — n lines, n−1 gaps, interleaved — and they
 * were never going to stay in step as two components: the ring pairing, the
 * grain switch and the seeding-on-switch rule are the fiddly parts and they
 * are identical.
 *
 * The one real difference is what an *unset* band means, and it is not
 * cosmetic. An unfilled **gap** is cut out — whatever is behind the stroke
 * shows through, so the control offers Clear/Fill and a count of how many are
 * filled. An unfilled **line** is still ink: it falls back to the stroke's own
 * colour. So the line side has nothing to "clear" to except the default, and
 * says so.
 */
export function StrokeFillControls({ value, onChange, defaultColour, band, surface }: {
  value: StrokeFillValue
  onChange: (patch: StrokeFillValue) => void
  defaultColour: string
  band: StrokeBand
  surface: StrokeSurface
}) {
  if ((value.lineStyle ?? 'solid') !== 'lines') return null
  const count = value.lineCount ?? DEFAULT_LINE_COUNT
  const bands = band === 'gap' ? gapCount(count) : count
  const rings = band === 'gap' ? gapRingCount(count) : lineRingCount(count)
  const ringIndices = band === 'gap' ? ringGapIndices : ringLineIndices
  const raw = (band === 'gap' ? value.gapFillMode : value.lineFillMode) ?? 'all'
  // A single-band stroke has nothing to distribute.
  const mode: GapFillMode = bands < 2 ? 'all' : raw
  const fills = (band === 'gap' ? value.gapFills : value.lineFills) ?? []
  const enabled = band === 'gap'
    ? (mode === 'all' ? !!value.innerFill : fills.some(Boolean))
    : fills.some(Boolean)

  /** Pad / trim to one entry per band, seeding from `seed`. */
  const perBand = (seed: (i: number) => string | null) =>
    Array.from({ length: bands }, (_, i) => seed(i))

  /** Write the fill array + grain for whichever band this instance owns. */
  const write = (m: GapFillMode, next: (string | null)[]): StrokeFillValue =>
    band === 'gap'
      ? { gapFillMode: m, gapFills: next }
      : { lineFillMode: m, lineFills: next }

  // `'all'` on the gap side is the pre-existing `innerFill` scalar; on the
  // line side it is entry 0 of the array, which `lineRingFills` reads for
  // every ring. Two shapes because `innerFill` is persisted state that
  // predates the grain switch — not worth a migration to unify.
  const allColour = band === 'gap' ? value.innerFill : fills[0] ?? undefined

  const setMode = (next: GapFillMode) => {
    const seedColour = allColour ?? fills.find(Boolean) ?? defaultColour
    if (next === 'all') {
      onChange(band === 'gap'
        ? { gapFillMode: 'all', innerFill: seedColour }
        : { lineFillMode: 'all', lineFills: [seedColour] })
      return
    }
    // Seed every band from whatever the previous grain was showing, so the
    // switch changes only what you can now reach, never what is drawn.
    onChange(write(next, perBand(i => fills[i] ?? allColour ?? defaultColour)))
  }

  const setAll = (colour: string) =>
    onChange(band === 'gap'
      ? { gapFillMode: 'all', innerFill: colour }
      : { lineFillMode: 'all', lineFills: [colour] })

  const setBand = (i: number, colour: string | null) =>
    onChange(write(mode, perBand(j => (j === i ? colour : fills[j] ?? null))))

  const setRing = (r: number, colour: string | null) => {
    const [a, b] = ringIndices(r, count)
    onChange(write('matching', perBand(j => (j === a || j === b ? colour : fills[j] ?? null))))
  }

  const modes: GapFillMode[] = ['all', 'matching', 'individual']
  const hints = band === 'gap' ? GAP_HINTS : LINE_HINTS

  return (
    <div style={{ marginTop: 10 }}>
      <Toggle
        checked={enabled}
        onChange={v => onChange(v
          ? (mode === 'all'
            ? (band === 'gap'
              ? { gapFillMode: 'all', innerFill: allColour ?? defaultColour }
              : { lineFillMode: 'all', lineFills: [allColour ?? defaultColour] })
            : write(mode, perBand(i => fills[i] ?? defaultColour)))
          : (band === 'gap'
            ? { innerFill: undefined, gapFills: undefined }
            : { lineFills: undefined }))}
        label={band === 'gap' ? 'Fill between lines' : 'Colour the lines'}
      />

      {enabled && bands > 1 && (
        <div style={{ display: 'flex', gap: 0, marginTop: 8 }}>
          {modes.map(m => (
            <button key={m} onClick={() => setMode(m)} style={segmentedStyle(mode === m)} title={hintFor(hints, m, surface)}>
              {m === 'all' ? 'All' : m === 'matching' ? 'Matching' : 'Individual'}
            </button>
          ))}
        </div>
      )}

      {enabled && mode === 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <input
            type="color"
            value={hexOr(allColour, defaultColour)}
            onChange={e => setAll(e.target.value)}
            title={band === 'gap'
              ? 'Colour of every gap between the parallel lines'
              : 'Colour of every parallel line'}
            style={swatchStyle}
          />
          <span style={hintStyle}>
            {band === 'gap'
              ? (bands > 1 ? `all ${bands} gaps` : 'the gap between the lines')
              : `all ${bands} lines`}
          </span>
        </div>
      )}

      {enabled && mode !== 'all' && (
        <>
          <FieldLabel
            label={mode === 'matching'
              ? (band === 'gap' ? 'Gap rings' : 'Line rings')
              : (band === 'gap' ? 'Gaps' : 'Lines')}
            value={mode === 'matching'
              ? `${countFilledRings(fills, count, ringIndices, rings)}/${rings}`
              : `${fills.filter(Boolean).length}/${bands}`}
            tooltip={hintFor(hints, mode, surface)}
          />
          {mode === 'matching'
            ? Array.from({ length: rings }, (_, r) => {
              const [a] = ringIndices(r, count)
              return (
                <BandRow
                  key={r}
                  label={ringLabel(band, r, rings, count)}
                  colour={fills[a] ?? null}
                  defaultColour={defaultColour}
                  band={band}
                  onChange={c => setRing(r, c)}
                />
              )
            })
            : Array.from({ length: bands }, (_, i) => (
              <BandRow
                key={i}
                label={bandLabel(band, i, bands, surface)}
                colour={fills[i] ?? null}
                defaultColour={defaultColour}
                band={band}
                onChange={c => setBand(i, c)}
              />
            ))}
        </>
      )}
    </div>
  )
}

function BandRow({ label, colour, defaultColour, band, onChange }: {
  label: string
  colour: string | null
  defaultColour: string
  band: StrokeBand
  onChange: (colour: string | null) => void
}) {
  // "Clear" means two different things and the button has to say which: a
  // cleared gap is cut out of the stroke, a cleared line just goes back to
  // the stroke's own colour.
  const clearTitle = band === 'gap'
    ? (colour ? 'Leave this one unfilled, showing the pattern behind' : 'Fill this one')
    : (colour ? "Back to the stroke's own colour" : 'Give this one its own colour')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <input
        type="color"
        value={hexOr(colour, defaultColour)}
        onChange={e => onChange(e.target.value)}
        title={`Colour of ${label.toLowerCase()}`}
        style={{ ...swatchStyle, opacity: colour ? 1 : 0.35 }}
      />
      <span style={{ ...hintStyle, flex: 1, color: colour ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
        {label}
      </span>
      <button onClick={() => onChange(colour ? null : defaultColour)} title={clearTitle} style={clearButtonStyle}>
        {colour ? (band === 'gap' ? 'Clear' : 'Default') : 'Colour'}
      </button>
    </div>
  )
}

const GAP_HINTS: Record<GapFillMode, string> = {
  all: 'One colour for every gap.',
  matching: "A colour per ring — a gap and its mirror on the other side of the stroke share it, so the stroke stays symmetric.",
  individual: 'A colour per gap, so the stroke can be asymmetric. Clear a gap to leave it cut out and let the pattern behind show through.',
}

const LINE_HINTS: Record<GapFillMode, string> = {
  all: 'One colour for every parallel line.',
  matching: 'A colour per ring — a line and its mirror on the other side of the stroke share it, so the stroke stays symmetric.',
  individual: "A colour per line, so the stroke can be asymmetric. A line left on Default takes the stroke's own colour.",
}

/** The `individual` grain needs a fixed sense of "side", and only the border
 *  has one. On a Strand it still works, but the sides are set by the order the
 *  Rays chained — so the hint says that rather than the control being withheld. */
function hintFor(hints: Record<GapFillMode, string>, mode: GapFillMode, surface: StrokeSurface): string {
  if (mode !== 'individual') return hints[mode]
  return surface === 'border'
    ? `${hints.individual} Counted from the outside in.`
    : `${hints.individual} A Strand has no outward side — which side is "first" comes from the order its Rays chained, so the same colours can land on opposite sides of neighbouring Strands.`
}

/** Ring `r` of `rings`, for a stroke of `count` lines. */
function ringLabel(band: StrokeBand, r: number, rings: number, count: number): string {
  const plural = band === 'gap' ? 'Gaps' : 'Lines'
  if (rings === 1) return band === 'gap' && count === 2 ? 'The gap' : plural
  if (r === 0) return `Outer ${plural.toLowerCase()}`
  const lone = band === 'gap' ? count % 2 === 0 : count % 2 === 1
  if (r === rings - 1) return lone ? `Centre ${band}` : `Inner ${plural.toLowerCase()}`
  return `${plural} ${r + 1}`
}

/** Band `i` of `bands`, counted from the stroke's first edge. */
function bandLabel(band: StrokeBand, i: number, bands: number, surface: StrokeSurface): string {
  const name = band === 'gap' ? 'Gap' : 'Line'
  // "Outermost" is only true of a border; a Strand's first edge is just the
  // first one, and calling it outermost would be a claim about the picture.
  const first = surface === 'border' ? 'outermost' : 'first'
  const last = surface === 'border' ? 'innermost' : 'last'
  if (i === 0) return `${name} 1 (${first})`
  if (i === bands - 1) return `${name} ${bands} (${last})`
  return `${name} ${i + 1}`
}

const countFilledRings = (
  fills: (string | null)[],
  count: number,
  ringIndices: (r: number, n: number) => [number, number],
  rings: number,
) => Array.from({ length: rings }, (_, r) => fills[ringIndices(r, count)[0]]).filter(Boolean).length

const hexOr = (c: string | null | undefined, fallback: string) =>
  (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback)

const swatchStyle: React.CSSProperties = {
  width: 26, height: 20, padding: 0, border: '1px solid var(--border)',
  background: 'transparent', cursor: 'pointer',
}

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)', color: 'var(--text-secondary)',
}

const clearButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)',
  padding: '3px 8px', background: 'transparent',
  border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer',
}

const segmentedStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  fontFamily: 'var(--font-body)', fontSize: 'var(--fs-label)',
  padding: '4px 8px', cursor: 'pointer',
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? 'var(--bg)' : 'var(--text-muted)',
  border: '1px solid var(--border-subtle)',
})
