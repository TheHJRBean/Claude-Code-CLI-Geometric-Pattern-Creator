import type { StrandLineStyle } from '../types/pattern'

/**
 * Resolved SVG stroke attributes for a Strand `lineStyle` at width `w`
 * (thermo-nuclear review Chunk 10). Extracted from `StrandLayer` so the
 * style→attribute mapping is unit-testable.
 *
 * - `double`/`triple` cut the stroke centre out with a mask (so Void fills /
 *   background show through between the parallel lines) ⇒ `masked`.
 * - `dashed` is a width-scaled dash with butt caps; `dotted` a round-cap dot
 *   pattern; everything else is a continuous round-cap stroke.
 * - `triple` keeps a thin centre line (`centreWidth`) drawn separately.
 */
export interface StrandStyleAttrs {
  masked: boolean
  dashArray?: string
  lineCap: 'butt' | 'round'
  /** Mask centre-cut stroke width (double/triple). */
  cutWidth: number
  /** `triple`'s thin centre line width. */
  centreWidth: number
}

export function strandStyleAttrs(lineStyle: StrandLineStyle, w: number): StrandStyleAttrs {
  return {
    masked: lineStyle === 'double' || lineStyle === 'triple',
    dashArray: lineStyle === 'dashed' ? `${w * 2.5} ${w * 1.5}`
      : lineStyle === 'dotted' ? `0.01 ${w * 1.8}` : undefined,
    lineCap: lineStyle === 'dashed' ? 'butt' : 'round',
    cutWidth: lineStyle === 'triple' ? w * 0.65 : w * 0.5,
    centreWidth: w * 0.18,
  }
}
