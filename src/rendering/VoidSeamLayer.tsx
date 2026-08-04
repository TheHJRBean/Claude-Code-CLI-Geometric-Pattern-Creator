import { memo } from 'react'
import type { Vec2 } from '../utils/math'
import type { VoidFill } from '../decoration/resolve'
import type { StampPlacement } from '../decoration/stamps'
import { gradientDef } from './VoidFillLayer'
import { polygonPath, polygonWithHolesPath } from './svgGeometry'

/**
 * **Combine** seam cover — the last thing that makes several Voids read as one.
 *
 * Fusing the outlines is enough for the *fill*: one path, one colour, one
 * gradient spanning the union. But the Strands still draw on top, and the rays
 * that used to divide the members run straight through the middle of the
 * combined shape — so a combined group came out looking like same-coloured
 * neighbours rather than one Void, and a stamp spanning the group was sliced
 * by lines across its face.
 *
 * The fix is to repaint the group's own fill (or stamp) over just those
 * internal edges, above the Strands. Two properties make it exact rather than
 * approximate:
 *
 * - The band is **clipped to the seams**, and the thing being drawn through it
 *   is the group's whole fill path. So the cover can never paint outside the
 *   union no matter how wide the band is — the fill path bounds it. Widening
 *   the band to swallow antialiasing costs nothing.
 * - Each band quad is **extended by its own half-width past both ends** of the
 *   seam. That closes the notch where two seams meet at an interior junction,
 *   and at the outer boundary the overhang lands outside the fill path and is
 *   clipped away.
 *
 * Strands that merely *touch* the group's outer boundary are untouched: they
 * are not seams (a seam is an edge shared by two members), so nothing covers
 * them and the combined shape keeps its outline drawn.
 */

/** Band width as a multiple of the Strand width. The strand is centred on the
 * seam, so 1× would leave its antialiased fringe showing on both sides. */
const BAND_SCALE = 1.35

/** Quad covering one seam edge: half-width `h` each side, and `h` of overhang
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

export const VoidSeamLayer = memo(function VoidSeamLayer({
  fills,
  stamps,
  strandWidth,
  idPrefix = 'void-seam',
}: {
  fills?: VoidFill[]
  stamps?: StampPlacement[]
  /** Rendered Strand stroke width in world units — what the cover has to hide. */
  strandWidth: number
  /** Unique per mount point — clip-path and gradient def ids are document-global. */
  idPrefix?: string
}) {
  const h = (Math.max(strandWidth, 0) * BAND_SCALE) / 2
  const seamFills = (fills ?? []).filter(f => f.seams && f.seams.length > 0)
  const seamStamps = (stamps ?? []).filter(s => s.seams && s.seams.length > 0)
  if (h <= 0 || (seamFills.length === 0 && seamStamps.length === 0)) return null

  return (
    <g id="void-seam-layer" pointerEvents="none">
      <defs>
        {seamFills.map((f, i) => (
          <clipPath key={`fc${i}`} id={`${idPrefix}-f${i}`} clipPathUnits="userSpaceOnUse">
            <path d={bandPath(f.seams!, h)} />
          </clipPath>
        ))}
        {seamFills.map((f, i) => (
          f.gradient && f.pose
            ? gradientDef(f.gradient, `${idPrefix}-fg${i}`, `matrix(${f.pose.a} ${f.pose.b} ${f.pose.c} ${f.pose.d} ${f.pose.e} ${f.pose.f})`)
            : null
        ))}
        {seamStamps.map((s, i) => (
          <clipPath key={`sc${i}`} id={`${idPrefix}-s${i}`} clipPathUnits="userSpaceOnUse">
            <path d={bandPath(s.seams!, h)} />
          </clipPath>
        ))}
        {seamStamps.map((s, i) => (s.overlap ? null : (
          <clipPath key={`so${i}`} id={`${idPrefix}-so${i}`} clipPathUnits="userSpaceOnUse">
            <path d={polygonWithHolesPath(s.clip, s.clipHoles)} />
          </clipPath>
        )))}
      </defs>
      {seamFills.map((f, i) => (
        <path
          key={`f${i}`}
          d={polygonWithHolesPath(f.polygon, f.holes)}
          fill={f.gradient && f.pose ? `url(#${idPrefix}-fg${i})` : f.colour}
          clipPath={`url(#${idPrefix}-f${i})`}
        />
      ))}
      {/* Nested clips intersect: the seam band ∩ the stamp's own Void clip. */}
      {seamStamps.map((s, i) => (
        <g key={`s${i}`} clipPath={`url(#${idPrefix}-s${i})`}>
          <g clipPath={s.overlap ? undefined : `url(#${idPrefix}-so${i})`}>
            <image
              href={s.image}
              x={s.rect.x}
              y={s.rect.y}
              width={s.rect.width}
              height={s.rect.height}
              preserveAspectRatio="none"
              transform={`matrix(${s.transform.a} ${s.transform.b} ${s.transform.c} ${s.transform.d} ${s.transform.e} ${s.transform.f})`}
            />
          </g>
        </g>
      ))}
    </g>
  )
})
