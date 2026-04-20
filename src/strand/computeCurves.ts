import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { StrandData } from './buildStrands'
import { sub, normalize, perp, scale, add, dist, lerp, dot, type Vec2 } from '../utils/math'

export interface CurvedStrand {
  points: Vec2[]
  /** curves[i] holds control points for the edge points[i] → points[i+1], or null for straight */
  curves: (Vec2[] | null)[]
}

/**
 * Parity = ray side (plus vs minus) of the ±α rotation from the inward
 * normal/bisector. Read directly from the `side` tag the PIC emitter
 * stamps on each segment. A prior cross(inwardRadial, rayDir) heuristic
 * degenerated to ~0 when seg.to sat on the polygon center (e.g. equilateral
 * triangles at θ=60°), producing unstable parity that flipped on every
 * pipeline rerun — the intrinsic side tag avoids that.
 */
function buildAlternatingParity(segments: Segment[]): Map<number, boolean> {
  const parity = new Map<number, boolean>()
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.kind === 'petal' || !seg.side) continue
    // 3-gons: 3 arms meet at the centroid — an odd cycle that can't be
    // 2-coloured. Force symmetric (non-alternating) curves regardless of
    // stored config. The UI hides the alternating toggle for sides===3
    // but legacy state may still carry alternating:true.
    if (seg.polygonSides === 3) continue
    parity.set(i, seg.side === 'plus')
  }
  return parity
}

/**
 * Compute Bézier control points for each edge in each strand,
 * based on the per-polygon-type CurveConfig.
 *
 * Only applies to 'star-arm' and 'vertex-line' segments; petals remain straight.
 */
export function computeCurves(
  strandData: StrandData[],
  segments: Segment[],
  config: PatternConfig,
): CurvedStrand[] {
  const altParity = buildAlternatingParity(segments)

  return strandData.map(sd => {
    const { points, segmentIndices } = sd
    const curves: (Vec2[] | null)[] = []

    for (let i = 0; i < segmentIndices.length; i++) {
      const seg = segments[segmentIndices[i]]

      if (seg.kind === 'petal') {
        curves.push(null)
        continue
      }

      const fig = config.figures[seg.tileTypeId]
      const curve = fig?.curve
      if (!curve?.enabled || !curve.points.length) {
        curves.push(null)
        continue
      }

      const from = points[i]
      const to = points[i + 1]
      const edgeLen = dist(from, to)
      if (edgeLen < 1e-10) {
        curves.push(null)
        continue
      }

      // baseNormal is the segment's perpendicular oriented to the CW tangent
      // at its radial position.  CW tangent is plus/minus-independent, so
      // flipping sign (via altSign) produces a true rotational-sense flip.
      //
      // 3-gons at θ=60° are a special case: the 3 surviving arms form the
      // medial triangle, each perpendicular to its own radial. dot(rawNormal,
      // cwTangent) is exactly 0 there, so the CW-tangent selector would
      // keep rawNormal as-is — and rawNormal's orientation depends on which
      // endpoint won dedup, giving inconsistent convex/concave across arms.
      // For triangles we instead align baseNormal with the inward radial so
      // a positive offset uniformly bulges toward the centroid (concave).
      const traversalDir = normalize(sub(to, from))
      const rawNormal = perp(traversalDir)

      const segMid: Vec2 = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
      const radial = sub(segMid, seg.polygonCenter)

      let baseNormal: Vec2
      if (seg.polygonSides === 3) {
        const inwardRadial = { x: -radial.x, y: -radial.y }
        baseNormal = dot(rawNormal, inwardRadial) >= 0
          ? rawNormal
          : { x: -rawNormal.x, y: -rawNormal.y }
      } else {
        const cwTangent: Vec2 = { x: radial.y, y: -radial.x }
        baseNormal = dot(rawNormal, cwTangent) >= 0
          ? rawNormal
          : { x: -rawNormal.x, y: -rawNormal.y }
      }

      const dirSign = curve.direction === 'right' ? -1 : 1
      const altSign = (curve.alternating && (altParity.get(segmentIndices[i]) ?? false)) ? -1 : 1
      const sign = dirSign * altSign

      // If the strand traverses this segment backwards, mirror position so
      // that position=0 always maps to seg.from in the user's config.
      const dfx = from.x - seg.from.x, dfy = from.y - seg.from.y
      const reversed = dfx * dfx + dfy * dfy > 1e-6

      const controlPoints: Vec2[] = curve.points.map(cp => {
        const t = reversed ? 1 - cp.position : cp.position
        const basePoint = lerp(from, to, t)
        return add(basePoint, scale(baseNormal, sign * cp.offset * edgeLen))
      })

      curves.push(controlPoints)
    }

    return { points, curves }
  })
}
