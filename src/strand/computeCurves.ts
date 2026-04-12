import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { StrandData } from './buildStrands'
import { sub, normalize, perp, scale, add, dist, lerp, type Vec2 } from '../utils/math'

export interface CurvedStrand {
  points: Vec2[]
  /** curves[i] holds control points for the edge points[i] → points[i+1], or null for straight */
  curves: (Vec2[] | null)[]
}

/**
 * Compute Bézier control points for each edge in each strand,
 * based on the per-polygon-type CurveConfig.
 *
 * Only applies to 'star-arm' segments; petals and vertex lines remain straight.
 */
export function computeCurves(
  strandData: StrandData[],
  segments: Segment[],
  config: PatternConfig,
): CurvedStrand[] {
  return strandData.map(sd => {
    const { points, segmentIndices } = sd
    const curves: (Vec2[] | null)[] = []
    let starArmCount = 0

    for (let i = 0; i < segmentIndices.length; i++) {
      const seg = segments[segmentIndices[i]]

      // Only curve star-arm segments
      if (seg.kind !== 'star-arm') {
        curves.push(null)
        continue
      }

      const fig = config.figures[seg.tileTypeId]
      const curve = fig?.curve
      if (!curve?.enabled || !curve.points.length) {
        curves.push(null)
        starArmCount++
        continue
      }

      const from = points[i]
      const to = points[i + 1]
      const edgeLen = dist(from, to)
      if (edgeLen < 1e-10) {
        curves.push(null)
        starArmCount++
        continue
      }

      // Use original segment direction (edgeMidpoint → interior) for consistent
      // normal orientation — strand traversal may reverse the edge direction,
      // which would flip the perpendicular and cause inconsistent curve bulging.
      const originalDir = normalize(sub(seg.to, seg.from))
      const normal = perp(originalDir)

      // When alternating, flip normal for every other star-arm segment in the strand
      const sign = curve.alternating && starArmCount % 2 === 1 ? -1 : 1

      const controlPoints: Vec2[] = curve.points.map(cp => {
        const basePoint = lerp(from, to, cp.position)
        return add(basePoint, scale(normal, sign * cp.offset * edgeLen))
      })

      curves.push(controlPoints)
      starArmCount++
    }

    return { points, curves }
  })
}
