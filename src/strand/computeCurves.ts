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
 * Precompute alternation parity for each segment based on its edge's
 * angular position within its polygon. Adjacent edges get opposite parity,
 * and both rays from the same edge share the same parity.
 */
function buildAlternatingParity(segments: Segment[]): Map<number, boolean> {
  const parity = new Map<number, boolean>()

  // Group star-arm segment indices by polygonId
  const byPolygon = new Map<string, number[]>()
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].kind !== 'star-arm') continue
    const pid = segments[i].polygonId
    if (!byPolygon.has(pid)) byPolygon.set(pid, [])
    byPolygon.get(pid)!.push(i)
  }

  for (const segIndices of byPolygon.values()) {
    // Group by edge midpoint (two rays per edge share the same midpoint)
    const edges = new Map<string, { mid: Vec2; indices: number[] }>()
    for (const si of segIndices) {
      const m = segments[si].edgeMidpoint
      const k = `${m.x.toFixed(4)},${m.y.toFixed(4)}`
      if (!edges.has(k)) edges.set(k, { mid: m, indices: [] })
      edges.get(k)!.indices.push(si)
    }

    // Centroid of edge midpoints ≈ polygon center
    const edgeList = [...edges.values()]
    const cx = edgeList.reduce((s, e) => s + e.mid.x, 0) / edgeList.length
    const cy = edgeList.reduce((s, e) => s + e.mid.y, 0) / edgeList.length

    // Sort edges by angle around the centroid → consistent edge ordering
    edgeList.sort((a, b) =>
      Math.atan2(a.mid.y - cy, a.mid.x - cx) - Math.atan2(b.mid.y - cy, b.mid.x - cx),
    )

    // Assign parity: even edge index → no flip, odd → flip
    for (let ei = 0; ei < edgeList.length; ei++) {
      const flip = ei % 2 === 1
      for (const si of edgeList[ei].indices) parity.set(si, flip)
    }
  }

  return parity
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
  const altParity = buildAlternatingParity(segments)

  return strandData.map(sd => {
    const { points, segmentIndices } = sd
    const curves: (Vec2[] | null)[] = []

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
        continue
      }

      const from = points[i]
      const to = points[i + 1]
      const edgeLen = dist(from, to)
      if (edgeLen < 1e-10) {
        curves.push(null)
        continue
      }

      // Use original segment direction (edgeMidpoint → interior) for consistent
      // normal orientation — strand traversal may reverse the edge direction,
      // which would flip the perpendicular and cause inconsistent curve bulging.
      const originalDir = normalize(sub(seg.to, seg.from))
      const normal = perp(originalDir)

      // When alternating, flip based on edge position within the polygon
      const flip = curve.alternating && (altParity.get(segmentIndices[i]) ?? false)
      const sign = flip ? -1 : 1

      const controlPoints: Vec2[] = curve.points.map(cp => {
        const basePoint = lerp(from, to, cp.position)
        return add(basePoint, scale(normal, sign * cp.offset * edgeLen))
      })

      curves.push(controlPoints)
    }

    return { points, curves }
  })
}
