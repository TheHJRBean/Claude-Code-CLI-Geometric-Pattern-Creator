import { memo } from 'react'
import type { Vec2 } from '../utils/math'
import { polygonPath, polygonWithHolesPath } from './svgGeometry'

/**
 * **Combine** seam mask — what makes a combined group's internal **Strands**
 * disappear.
 *
 * Fusing the outlines is enough for the *fill*: one path, one colour, one
 * gradient spanning the union. But the Strands still draw on top, and the Rays
 * that used to divide the members run straight through the middle of the
 * combined shape — so a combined group reads as same-coloured neighbours rather
 * than one Void, and a stamp spanning the group is sliced by lines across its
 * face.
 *
 * This masks those Ray portions out of the strand layer entirely, rather than
 * painting over them. Painting over was the first attempt and it was wrong in a
 * way worth recording: the cover could only be drawn in the group's own paint,
 * so an **unpainted** combined group kept its dividing line, and a *combine*
 * only took visible effect once you also filled it. Combining is supposed to
 * change what the shape IS, not what a later fill looks like.
 *
 * Masking also gets the hard cases for free, because it acts on rendered
 * output rather than on geometry: curved strands, the weave's over/under
 * breaks, dashed and double/triple line styles, and per-strand colours all mask
 * identically. Cutting the seam intervals out of the `Segment` field instead
 * would have had to reproduce every one of those, and would have re-chained the
 * strands — moving the identities that strand colours are keyed on.
 *
 * Two properties make the band exact rather than approximate:
 *
 * - It is **clipped to the group's union outline**, so however wide the band
 *   gets it can never reach a Strand outside the group. Strands bounding the
 *   group are not seams (a seam is an edge shared by two members), so the
 *   combined shape keeps its outline drawn.
 * - Each band quad **overhangs its seam by its own half-width** at both ends,
 *   which closes the notch where two seams meet at an interior junction. At the
 *   outer boundary that overhang lands outside the union and is clipped away.
 */

export interface VoidSeamGroup {
  /** The combined group's union outline — the band is clipped to it. */
  polygon: Vec2[]
  /** Inner loops of `polygon` (a group ringing an unselected Void). */
  holes?: Vec2[][]
  /** Internal edges to erase: those shared by two of the group's members. */
  seams: [Vec2, Vec2][]
}

/** Band width as a multiple of the Strand width. The stroke is centred on the
 * seam, so 1× would leave its antialiased fringe showing on both sides. */
const BAND_SCALE = 1.6

/** Quad covering one seam edge: half-width `h` each side, plus `h` of overhang
 * at each end so interior junctions close. */
function seamQuad([a, b]: [Vec2, Vec2], h: number): Vec2[] | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  const ux = dx / len
  const uy = dy / len
  const a0 = { x: a.x - ux * h, y: a.y - uy * h }
  const b0 = { x: b.x + ux * h, y: b.y + uy * h }
  const nx = -uy * h
  const ny = ux * h
  return [
    { x: a0.x + nx, y: a0.y + ny },
    { x: b0.x + nx, y: b0.y + ny },
    { x: b0.x - nx, y: b0.y - ny },
    { x: a0.x - nx, y: a0.y - ny },
  ]
}

function bandPath(seams: [Vec2, Vec2][], h: number): string {
  let d = ''
  for (const s of seams) {
    const q = seamQuad(s, h)
    if (q) d += polygonPath(q)
  }
  return d
}

/** True when there is anything to mask — the caller uses this to decide
 * whether to reference the mask at all, since an unused `mask` attribute
 * still costs a compositing pass. */
export function hasSeams(groups: VoidSeamGroup[] | undefined, strandWidth: number): boolean {
  return !!groups && strandWidth > 0 && groups.some(g => g.seams.length > 0)
}

/**
 * The `<mask>` definition. Black hides, so the covering white rect must span
 * everything the masked layer draws — the caller passes the visible world rect
 * generously expanded, since a rotated view puts the corners outside it.
 */
export const StrandSeamMask = memo(function StrandSeamMask({
  groups,
  strandWidth,
  rect,
  id,
}: {
  groups: VoidSeamGroup[]
  strandWidth: number
  rect: { x: number; y: number; width: number; height: number }
  /** Document-global — unique per mount point. */
  id: string
}) {
  const h = (strandWidth * BAND_SCALE) / 2
  const withSeams = groups.filter(g => g.seams.length > 0)
  if (h <= 0 || withSeams.length === 0) return null
  return (
    <defs>
      {withSeams.map((g, i) => (
        <clipPath key={`c${i}`} id={`${id}-c${i}`} clipPathUnits="userSpaceOnUse">
          <path d={polygonWithHolesPath(g.polygon, g.holes)} />
        </clipPath>
      ))}
      <mask id={id} maskUnits="userSpaceOnUse" x={rect.x} y={rect.y} width={rect.width} height={rect.height}>
        <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="white" />
        {withSeams.map((g, i) => (
          <g key={`b${i}`} clipPath={`url(#${id}-c${i})`}>
            <path d={bandPath(g.seams, h)} fill="black" />
          </g>
        ))}
      </mask>
    </defs>
  )
})
