import type { GapFillMode, StrandLineStyle } from '../../types/pattern'
import { DEFAULT_LINE_COUNT, gapRingCount } from '../../rendering/strandStyle'
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
 * **Fill between lines** for a divided stroke — one colour for every gap, or a
 * colour per gap **ring**. Shared by the Strand controls and the Decoration
 * panel's Frame border, which render through the same `gapRingFills`.
 *
 * A ring is a radial gap *position*, not a single gap: a stroke is centred on
 * its path, so the gap left of the centreline and its mirror on the right are
 * one ring and cannot differ. Only an even line count's centre gap is alone in
 * its ring. The labels say which is which rather than pretending otherwise.
 *
 * Renders nothing for a solid stroke — there are no gaps to fill.
 */
export function GapFillControls({ value, onChange, defaultColour }: {
  value: GapFillValue
  onChange: (patch: GapFillValue) => void
  defaultColour: string
}) {
  if ((value.lineStyle ?? 'solid') !== 'lines') return null
  const count = value.lineCount ?? DEFAULT_LINE_COUNT
  const rings = gapRingCount(count)
  const mode: GapFillMode = value.gapFillMode ?? 'all'
  const individual = mode === 'individual' && rings > 1
  const fills = value.gapFills ?? []
  const enabled = individual ? fills.some(Boolean) : !!value.innerFill

  const setMode = (next: GapFillMode) => onChange(next === 'individual'
    // Seed every ring from the all-gaps colour so the switch is visible
    // immediately and nothing silently empties.
    ? {
      gapFillMode: 'individual',
      gapFills: Array.from({ length: rings }, (_, i) => fills[i] ?? value.innerFill ?? defaultColour),
    }
    : { gapFillMode: 'all', innerFill: value.innerFill ?? fills.find(Boolean) ?? defaultColour })

  const setRing = (i: number, colour: string | null) => onChange({
    gapFillMode: 'individual',
    gapFills: Array.from({ length: rings }, (_, r) => (r === i ? colour : fills[r] ?? null)),
  })

  return (
    <div style={{ marginTop: 10 }}>
      <Toggle
        checked={enabled}
        onChange={v => onChange(v
          ? { gapFillMode: mode, ...(individual
            ? { gapFills: Array.from({ length: rings }, (_, i) => fills[i] ?? defaultColour) }
            : { innerFill: value.innerFill ?? defaultColour }) }
          : { innerFill: undefined, gapFills: undefined })}
        label="Fill between lines"
      />

      {enabled && rings > 1 && (
        <div style={{ display: 'flex', gap: 0, marginTop: 8 }}>
          {(['all', 'individual'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={segmentedStyle((individual ? 'individual' : 'all') === m)}
            >
              {m === 'all' ? 'All gaps' : 'Individual'}
            </button>
          ))}
        </div>
      )}

      {enabled && !individual && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <input
            type="color"
            value={hexOr(value.innerFill, defaultColour)}
            onChange={e => onChange({ gapFillMode: 'all', innerFill: e.target.value })}
            title="Colour of every gap between the parallel lines"
            style={swatchStyle}
          />
          <span style={hintStyle}>
            {rings > 1 ? `all ${rings} gap rings` : 'the gap between the lines'}
          </span>
        </div>
      )}

      {enabled && individual && (
        <>
          <FieldLabel
            label="Gap rings"
            value={`${fills.filter(Boolean).length}/${rings}`}
            tooltip="Each ring is one gap position measured out from the stroke's centre — a mirrored pair of gaps, except the centre gap of an even line count, which stands alone. Clear a ring to leave it cut out, so whatever sits behind the stroke shows through."
          />
          {Array.from({ length: rings }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <input
                type="color"
                value={hexOr(fills[i], defaultColour)}
                onChange={e => setRing(i, e.target.value)}
                title={`Colour of ${ringLabel(i, rings, count).toLowerCase()}`}
                style={{ ...swatchStyle, opacity: fills[i] ? 1 : 0.35 }}
              />
              <span style={{ ...hintStyle, flex: 1, color: fills[i] ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {ringLabel(i, rings, count)}
              </span>
              <button
                onClick={() => setRing(i, fills[i] ? null : defaultColour)}
                title={fills[i] ? 'Leave this ring unfilled' : 'Fill this ring'}
                style={clearButtonStyle}
              >
                {fills[i] ? 'Clear' : 'Fill'}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/** Ring `i` of `rings`, for a stroke of `count` lines. */
function ringLabel(i: number, rings: number, count: number): string {
  if (rings === 1) return count === 2 ? 'The gap' : 'Gaps'
  if (i === 0) return 'Outer gaps'
  if (i === rings - 1) return count % 2 === 0 ? 'Centre gap' : 'Inner gaps'
  return `Gaps ${i + 1}`
}

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
