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
 * Build alternation parity via graph-based 2-coloring.
 *
 * Adjacency graph:
 * - Polygon edges: within each polygon, star-arm segments sorted by ray angle
 *   form a cycle — consecutive pairs (including wrap-around) must alternate.
 * - Strand edges: consecutive star-arm segments in a strand cross polygon
 *   boundaries and must also alternate.
 *
 * BFS 2-colors the graph. For regular n-gons the polygon cycle has 2n nodes
 * (always even / bipartite). If an odd cycle is encountered, the conflict is
 * accepted gracefully — one pair will be inconsistent rather than all boundaries.
 */
function buildAlternatingParity(segments: Segment[], strandData: StrandData[]): Map<number, boolean> {
  const adj = new Map<number, number[]>()

  function addEdge(a: number, b: number) {
    if (a === b) return
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }

  // 1. Polygon adjacency: connect angular neighbors within each polygon
  const byPolygon = new Map<string, number[]>()
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].kind !== 'star-arm') continue
    const pid = segments[i].polygonId
    if (!byPolygon.has(pid)) byPolygon.set(pid, [])
    byPolygon.get(pid)!.push(i)
  }

  for (const segIndices of byPolygon.values()) {
    const sorted = [...segIndices].sort((a, b) => {
      const sa = segments[a], sb = segments[b]
      return Math.atan2(sa.to.y - sa.from.y, sa.to.x - sa.from.x)
           - Math.atan2(sb.to.y - sb.from.y, sb.to.x - sb.from.x)
    })
    for (let k = 0; k < sorted.length; k++) {
      addEdge(sorted[k], sorted[(k + 1) % sorted.length])
    }
  }

  // 2. Strand adjacency: connect consecutive star-arm segments in each strand
  for (const sd of strandData) {
    let prevStarArm = -1
    for (const si of sd.segmentIndices) {
      if (segments[si].kind !== 'star-arm') continue
      if (prevStarArm >= 0) addEdge(prevStarArm, si)
      prevStarArm = si
    }
  }

  // 3. BFS 2-coloring
  const color = new Map<number, boolean>()
  for (const node of adj.keys()) {
    if (color.has(node)) continue
    color.set(node, false)
    const queue = [node]
    while (queue.length > 0) {
      const cur = queue.shift()!
      const curColor = color.get(cur)!
      for (const neighbor of adj.get(cur)!) {
        if (!color.has(neighbor)) {
          color.set(neighbor, !curColor)
          queue.push(neighbor)
        }
      }
    }
  }

  return color
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
  const altParity = buildAlternatingParity(segments, strandData)

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
