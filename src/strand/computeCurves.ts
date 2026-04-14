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
    return Math.atan2(sa.to.y - sa.from.y, sa.to.x - sa.from.x)
         - Math.atan2(sb.to.y - sb.from.y, sb.to.x - sb.from.x)
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

      // Compute a curve normal that is consistent across all instances of the
      // same polygon type, regardless of absolute orientation.
      //
      // Raw perp(originalDir) depends on the segment's absolute angle, which
      // varies with polygon rotation.  We normalise it so it always points in
      // the CW-tangent direction around the polygon centre.  This way two
      // polygons of the same type at different rotations produce identical
      // relative curve bulging.
      const originalDir = normalize(sub(seg.to, seg.from))
      const rawNormal = perp(originalDir)

      let normal: Vec2
      if (seg.kind === 'vertex-line') {
        // Vertex-line segments use vertex position as edgeMidpoint — the two
        // halves of each pair would get different CW-tangent references,
        // causing divergence. Use raw perpendicular to keep both halves symmetric.
        normal = rawNormal
      } else {
        // CW tangent at the segment origin = perp(outward radial from center)
        const outward = sub(seg.edgeMidpoint, seg.polygonCenter)
        const cwTangent = perp(outward)
        normal = dot(rawNormal, cwTangent) >= 0
          ? rawNormal
          : { x: -rawNormal.x, y: -rawNormal.y }
      }

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
