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
 * Build alternation parity using ray side (plus vs minus).
 *
 * In Kaplan's PIC construction, every arm is a ray that leaves its origin
 * (edge midpoint for star-arms, vertex for vertex-lines) at ±α from the
 * inward normal/bisector.  Plus rays sit on the CCW side of the inward
 * radial; minus rays sit on the CW side.  That side is recoverable from
 * the sign of cross(inwardRadial, rayDir).
 *
 * Assigning parity by side makes every arm-pair alternate:
 *   - Edge pair (two arms leaving the same edge midpoint): one plus, one
 *     minus → opposite parity.
 *   - Vertex pair (two arms meeting at a star tip): one plus from edge k
 *     and one minus from edge k−1 → opposite parity.
 *
 * The per-edge grouping this replaces only alternated vertex pairs; arms
 * from the same edge shared a parity, so edge pairs curved together.
 */
function buildAlternatingParity(segments: Segment[]): Map<number, boolean> {
  const parity = new Map<number, boolean>()

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.kind === 'petal') continue

    const inwardRadial = sub(seg.polygonCenter, seg.from)
    const rayDir = sub(seg.to, seg.from)
    const cross = inwardRadial.x * rayDir.y - inwardRadial.y * rayDir.x

    parity.set(i, cross > 0)
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

      // Only curve star-arm and vertex-line segments
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

      // Orient the curve normal using the CW tangent reference for BOTH modes.
      //
      // rawNormal = perp(traversalDir) — perpendicular to the rendered path.
      // CW tangent at the segment's radial position is a reference that is
      // independent of the ray's plus/minus side, so flipping sign produces a
      // true rotational-sense flip regardless of which ray the segment comes
      // from.
      //
      // Previously alternating used outward-radial as the reference, but that
      // reference itself encodes plus/minus (plus arms align with outward
      // radial, minus arms anti-align).  Combined with a plus/minus-derived
      // altSign, the two encodings cancelled and alternating degenerated into
      // same-direction with an inverted sign.
      const traversalDir = normalize(sub(to, from))
      const rawNormal = perp(traversalDir)

      const segMid: Vec2 = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
      const radial = sub(segMid, seg.polygonCenter)

      const cwTangent: Vec2 = { x: radial.y, y: -radial.x }
      const baseNormal: Vec2 = dot(rawNormal, cwTangent) >= 0
        ? rawNormal
        : { x: -rawNormal.x, y: -rawNormal.y }

      const dirSign = curve.direction === 'right' ? -1 : 1
      const altSign = (curve.alternating && (altParity.get(segmentIndices[i]) ?? false)) ? -1 : 1
      const sign = dirSign * altSign

      // Detect if the strand traverses this segment backwards (from ≈ seg.to
      // instead of seg.from).  When reversed, mirror the position so that
      // position=0 always corresponds to the original seg.from end.
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
