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
 * Build alternation parity via graph-based 2-coloring.
 *
 * Adjacency graph:
 * - Polygon edges: within each polygon, star-arm and vertex-line segments sorted
 *   by ray angle form a cycle — consecutive pairs (including wrap-around) must alternate.
 * - Strand edges: consecutive curvable segments in a strand cross polygon
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

  // 1. Polygon adjacency: connect angular neighbors within each polygon.
  //    Build SEPARATE cycles for star-arms and vertex-lines so that each
  //    kind alternates among itself. Mixing them into one cycle causes
  //    vertex-lines to all land on the same parity and never alternate.
  const starByPolygon = new Map<string, number[]>()
  const vtxByPolygon = new Map<string, number[]>()
  for (let i = 0; i < segments.length; i++) {
    const kind = segments[i].kind
    if (kind === 'petal') continue
    const pid = segments[i].polygonId
    const map = kind === 'vertex-line' ? vtxByPolygon : starByPolygon
    if (!map.has(pid)) map.set(pid, [])
    map.get(pid)!.push(i)
  }

  const angleSorter = (a: number, b: number) => {
    const sa = segments[a], sb = segments[b]
    // Sort by the angular position of the segment midpoint around the polygon
    // center, NOT by segment direction.  Using segment direction causes
    // ambiguous ordering in regular polygons where multiple segments share
    // the same direction angle (e.g. hexagons), breaking the 2-coloring cycle.
    const midA = { x: (sa.from.x + sa.to.x) / 2, y: (sa.from.y + sa.to.y) / 2 }
    const midB = { x: (sb.from.x + sb.to.x) / 2, y: (sb.from.y + sb.to.y) / 2 }
    return Math.atan2(midA.y - sa.polygonCenter.y, midA.x - sa.polygonCenter.x)
         - Math.atan2(midB.y - sb.polygonCenter.y, midB.x - sb.polygonCenter.x)
  }

  for (const segIndices of starByPolygon.values()) {
    const sorted = [...segIndices].sort(angleSorter)
    for (let k = 0; k < sorted.length; k++) {
      addEdge(sorted[k], sorted[(k + 1) % sorted.length])
    }
  }
  for (const segIndices of vtxByPolygon.values()) {
    const sorted = [...segIndices].sort(angleSorter)
    for (let k = 0; k < sorted.length; k++) {
      addEdge(sorted[k], sorted[(k + 1) % sorted.length])
    }
  }

  // 2. Strand adjacency: connect consecutive star-arm segments in each strand
  for (const sd of strandData) {
    let prevStarArm = -1
    for (const si of sd.segmentIndices) {
      if (segments[si].kind === 'petal') continue
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
 * Only applies to 'star-arm' and 'vertex-line' segments; petals remain straight.
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

      // Orient the curve normal using a purely geometric reference that is
      // independent of strand traversal direction.
      //
      // 1. rawNormal = perp(traversalDir) — perpendicular to the rendered path
      // 2. Compute the CW tangent at the segment's radial position relative to
      //    the polygon center.  This is deterministic for a given segment
      //    regardless of which direction the strand traverses it.
      // 3. Align rawNormal with the CW tangent → all segments of a polygon
      //    curve in the same rotational sense ("same direction").
      // 4. "Alternating" mode flips every other segment via 2-coloring.
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
