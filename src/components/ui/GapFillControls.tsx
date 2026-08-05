import type { GapFillMode, StrandLineStyle } from '../../types/pattern'
import { DEFAULT_LINE_COUNT, gapCount, gapRingCount, ringGapIndices } from '../../rendering/strandStyle'
import { FieldLabel } from './FieldLabel'
import { Toggle } from './Toggle'

/** The gap-fill slice of `StrandStyle` / `FrameStroke`. */
export interface GapFillValue {
  lineStyle?: StrandLineStyle
  lineCount?: number
  innerFill?: string
  gapFills?: (string | null)[]
  gapFillMode?: GapFillMode
}

/**
 * **Fill between lines** for a divided stroke, at three grains:
 *
 * - **All** — one colour for every gap.
 * - **Matching** — a colour per gap *ring*: a gap and its mirror on the far
 *   side of the stroke move together. Works on any stroke.
 * - **Individual** — a colour per gap, so the stroke can be asymmetric. Needs
 *   geometry with a fixed outward direction, so `allowIndividual` is set for
 *   the Frame border and not for Strands, whose two sides are whichever way
 *   their Rays happened to chain.
 *
 * `gapFills` is always one entry per gap; Matching just writes a ring's pair
 * together, so switching grain never loses what was already picked. Shared by
 * the Strand controls and the Decoration panel's Frame border.
 *
 * Renders nothing for a solid stroke — there are no gaps to fill.
 */
export function GapFillControls({ value, onChange, defaultColour, allowIndividual = false }: {
  value: GapFillValue
  onChange: (patch: GapFillValue) => void
  defaultColour: string
  allowIndividual?: boolean
}) {
  if ((value.lineStyle ?? 'solid') !== 'lines') return null
  const count = value.lineCount ?? DEFAULT_LINE_COUNT
  const gaps = gapCount(count)
  const rings = gapRingCount(count)
  const raw = value.gapFillMode ?? 'all'
  // A single-gap stroke has nothing to distribute, and Individual is only
  // meaningful where the geometry has a fixed outward side.
  const mode: GapFillMode = gaps < 2 ? 'all'
    : raw === 'individual' && !allowIndividual ? 'matching'
      : raw
  const fills = value.gapFills ?? []
  const enabled = mode === 'all' ? !!value.innerFill : fills.some(Boolean)

  /** Pad / trim to one entry per gap, seeding from `seed`. */
  const perGap = (seed: (g: number) => string | null) =>
    Array.from({ length: gaps }, (_, g) => seed(g))

  const setMode = (next: GapFillMode) => {
    if (next === 'all') {
      onChange({ gapFillMode: 'all', innerFill: value.innerFill ?? fills.find(Boolean) ?? defaultColour })
      return
    }
    // Seed every gap from whatever the previous grain was showing, so the
    // switch changes only what you can now reach, never what is drawn.
    onChange({
      gapFillMode: next,
      gapFills: perGap(g => fills[g] ?? value.innerFill ?? defaultColour),
    })
  }

  const setGap = (i: number, colour: string | null) =>
    onChange({ gapFillMode: mode, gapFills: perGap(g => (g === i ? colour : fills[g] ?? null)) })

  const setRing = (r: number, colour: string | null) => {
    const [a, b] = ringGapIndices(r, count)
    onChange({
      gapFillMode: 'matching',
      gapFills: perGap(g => (g === a || g === b ? colour : fills[g] ?? null)),
    })
  }

  const modes: GapFillMode[] = allowIndividual ? ['all', 'matching', 'individual'] : ['all', 'matching']

  return (
    <div style={{ marginTop: 10 }}>
      <Toggle
        checked={enabled}
        onChange={v => onChange(v
          ? (mode === 'all'
            ? { gapFillMode: 'all', innerFill: value.innerFill ?? defaultColour }
            : { gapFillMode: mode, gapFills: perGap(g => fills[g] ?? defaultColour) })
          : { innerFill: undefined, gapFills: undefined })}
        label="Fill between lines"
      />

      {enabled && gaps > 1 && (
        <div style={{ display: 'flex', gap: 0, marginTop: 8 }}>
          {modes.map(m => (
            <button key={m} onClick={() => setMode(m)} style={segmentedStyle(mode === m)} title={MODE_HINTS[m]}>
              {m === 'all' ? 'All' : m === 'matching' ? 'Matching' : 'Individual'}
            </button>
          ))}
        </div>
      )}

      {enabled && mode === 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <input
            type="color"
            value={hexOr(value.innerFill, defaultColour)}
            onChange={e => onChange({ gapFillMode: 'all', innerFill: e.target.value })}
            title="Colour of every gap between the parallel lines"
            style={swatchStyle}
          />
          <span style={hintStyle}>{gaps > 1 ? `all ${gaps} gaps` : 'the gap between the lines'}</span>
        </div>
      )}

      {enabled && mode !== 'all' && (
        <>
          <FieldLabel
            label={mode === 'matching' ? 'Gap rings' : 'Gaps'}
            value={mode === 'matching'
              ? `${countFilledRings(fills, count)}/${rings}`
              : `${fills.filter(Boolean).length}/${gaps}`}
            tooltip={MODE_HINTS[mode]}
          />
          {mode === 'matching'
            ? Array.from({ length: rings }, (_, r) => {
              const [a] = ringGapIndices(r, count)
              return (
                <GapRow
                  key={r}
                  label={ringLabel(r, rings, count)}
                  colour={fills[a] ?? null}
                  defaultColour={defaultColour}
                  onChange={c => setRing(r, c)}
                />
              )
            })
            : Array.from({ length: gaps }, (_, g) => (
              <GapRow
                key={g}
                label={gapLabel(g, gaps)}
                colour={fills[g] ?? null}
                defaultColour={defaultColour}
                onChange={c => setGap(g, c)}
              />
            ))}
        </>
      )}
    </div>
  )
}

function GapRow({ label, colour, defaultColour, onChange }: {
  label: string
  colour: string | null
  defaultColour: string
  onChange: (colour: string | null) => void
}) {
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
      <button
        onClick={() => onChange(colour ? null : defaultColour)}
        title={colour ? 'Leave this ring unfilled' : 'Fill this ring'}
        style={clearButtonStyle}
      >
        {colour ? 'Clear' : 'Fill'}
      </button>
    </div>
  )
}

const MODE_HINTS: Record<GapFillMode, string> = {
  all: 'One colour for every gap.',
  matching: "A colour per ring — a gap and its mirror on the other side of the stroke share it, so the stroke stays symmetric.",
  individual: 'A colour per gap, counted from the outside in, so the border can be asymmetric. Clear a gap to leave it cut out and let the pattern behind show through.',
}

/** Ring `r` of `rings`, for a stroke of `count` lines. */
function ringLabel(r: number, rings: number, count: number): string {
  if (rings === 1) return count === 2 ? 'The gap' : 'Gaps'
  if (r === 0) return 'Outer gaps'
  if (r === rings - 1) return count % 2 === 0 ? 'Centre gap' : 'Inner gaps'
  return `Gaps ${r + 1}`
}

/** Gap `g` of `gaps`, counted from the outside in. */
function gapLabel(g: number, gaps: number): string {
  if (g === 0) return 'Gap 1 (outermost)'
  if (g === gaps - 1) return `Gap ${gaps} (innermost)`
  return `Gap ${g + 1}`
}

const countFilledRings = (fills: (string | null)[], count: number) =>
  Array.from({ length: gapRingCount(count) }, (_, r) => fills[ringGapIndices(r, count)[0]])
    .filter(Boolean).length

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
