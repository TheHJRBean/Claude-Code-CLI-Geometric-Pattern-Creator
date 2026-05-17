import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { computeContactRays, computeVertexRays, type ContactRay, type VertexRay } from './stellation'
import { rayRayIntersect, type IntersectResult } from './intersect'
import { EPSILON, dist, midpoint, pointInPolygon, isConvexPolygon, type Vec2 } from '../utils/math'

/**
 * For a given vertex (shared by prevEdge and currEdge), find the correct
 * ray pairing. The pairing depends on polygon winding, so we try both
 * combinations.
 *
 * Selection priority:
 *  1. Whichever pairing's intersection lies INSIDE the polygon (normal star
 *     for pair A; concave/reflex star for pair B). This lets the figure
 *     switch from convex-star to concave-star as θ sweeps past the regime
 *     where pair A's tip leaves the polygon.
 *  2. If neither lands inside, fall back to pair A (downstream emitStarArms
 *     handles the outside-tip case via edge-slide).
 *  3. If neither is valid (both have non-positive t or are parallel), null.
 *
 * The `convex` flag is no longer used to skip pointInPolygon — for irregular
 * convex tiles, pair A's intersection can be outside even though the polygon
 * is convex. The cost of pointInPolygon is negligible at this call rate.
 */
function pairAtVertex(
  rays: ContactRay[],
  prevEdge: number,
  currEdge: number,
  polyVertices: Vec2[],
  _convex: boolean,
): { ray1: ContactRay; ray2: ContactRay; result: IntersectResult } | null {
  const rA1 = rays[prevEdge * 2 + 1]
  const rA2 = rays[currEdge * 2]
  const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
  const aValid = !!resA && resA.t1 > EPSILON && resA.t2 > EPSILON
  const aInside = aValid && pointInPolygon(resA!.point, polyVertices)

  const rB1 = rays[prevEdge * 2]
  const rB2 = rays[currEdge * 2 + 1]
  const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
  const bValid = !!resB && resB.t1 > EPSILON && resB.t2 > EPSILON
  const bInside = bValid && pointInPolygon(resB!.point, polyVertices)

  if (aInside) return { ray1: rA1, ray2: rA2, result: resA! }
  if (bInside) return { ray1: rB1, ray2: rB2, result: resB! }
  if (aValid) return { ray1: rA1, ray2: rA2, result: resA! }
  if (bValid) return { ray1: rB1, ray2: rB2, result: resB! }
  return null
}

/**
 * Clip a segment from `from` to `to` against a polygon boundary.
 * `skipEdgeIdx` excludes the polygon edge the segment originates on (so
 * the on-boundary start point doesn't self-intersect).
 * If the segment's natural endpoint lies past the boundary, returns the
 * first boundary crossing; otherwise returns the natural endpoint.
 */
function clipSegmentToPolygon(
  from: Vec2,
  to: Vec2,
  polyVertices: Vec2[],
  skipEdgeIdx: number,
): Vec2 {
  const dir = { x: to.x - from.x, y: to.y - from.y }
  let nearestT = 1
  let nearestPoint = to
  const n = polyVertices.length
  for (let k = 0; k < n; k++) {
    if (k === skipEdgeIdx) continue
    const A = polyVertices[k]
    const B = polyVertices[(k + 1) % n]
    const edgeDir = { x: B.x - A.x, y: B.y - A.y }
    const res = rayRayIntersect(from, dir, A, edgeDir)
    if (!res) continue
    if (res.t1 < EPSILON || res.t1 > 1 + EPSILON) continue
    if (res.t2 < -EPSILON || res.t2 > 1 + EPSILON) continue
    if (res.t1 < nearestT) {
      nearestT = res.t1
      nearestPoint = res.point
    }
  }
  return nearestPoint
}

/**
 * Emit star arm segments for a single vertex pairing.
 *
 * When the natural ray-pair intersection (the star tip) sits outside the
 * polygon — common on irregular convex tiles at low θ — the figure switches
 * to "edge-slide" mode: the shorter clipped ray is suppressed (pinned at 0)
 * and the longer ray is emitted as two segments — origin → boundary clip,
 * then boundary clip → suppressed ray's origin along the shared exit edge.
 * In autoLineLength=false (fixed length) mode the boundary clip is just a
 * safety stop with no slide.
 */
function emitStarArms(
  pair: { ray1: ContactRay; ray2: ContactRay; result: IntersectResult },
  autoLineLength: boolean,
  lineLength: number,
  inradius: number,
  polygonId: string,
  tileTypeId: string,
  polygonCenter: Vec2,
  polygonSides: number,
  polyVertices: Vec2[],
  segments: Segment[],
): void {
  const { ray1, ray2, result } = pair

  if (autoLineLength && !pointInPolygon(result.point, polyVertices)) {
    // Edge-slide mode: star tip is outside the polygon.
    const clip1 = clipSegmentToPolygon(ray1.origin, result.point, polyVertices, ray1.edgeIndex)
    const clip2 = clipSegmentToPolygon(ray2.origin, result.point, polyVertices, ray2.edgeIndex)
    const len1 = dist(ray1.origin, clip1)
    const len2 = dist(ray2.origin, clip2)
    if (len1 < EPSILON && len2 < EPSILON) return

    const longIsR1 = len1 >= len2
    const longRay = longIsR1 ? ray1 : ray2
    const longClip = longIsR1 ? clip1 : clip2
    const shortRay = longIsR1 ? ray2 : ray1

    // Arm: long ray's straight portion from its origin to the boundary.
    segments.push({
      from: longRay.origin,
      to: longClip,
      edgeMidpoint: longRay.origin,
      polygonCenter,
      polygonSides,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
      side: longRay.side,
    })
    // Slide: along the shared exit edge to the suppressed ray's origin.
    segments.push({
      from: longClip,
      to: shortRay.origin,
      edgeMidpoint: longRay.origin,
      polygonCenter,
      polygonSides,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
      side: longRay.side,
    })
    return
  }

  const to1Natural = autoLineLength
    ? result.point
    : {
        x: ray1.origin.x + ray1.dir.x * lineLength * inradius,
        y: ray1.origin.y + ray1.dir.y * lineLength * inradius,
      }
  const to2Natural = autoLineLength
    ? result.point
    : {
        x: ray2.origin.x + ray2.dir.x * lineLength * inradius,
        y: ray2.origin.y + ray2.dir.y * lineLength * inradius,
      }

  segments.push({
    from: ray1.origin,
    to: clipSegmentToPolygon(ray1.origin, to1Natural, polyVertices, ray1.edgeIndex),
    edgeMidpoint: ray1.origin,
    polygonCenter,
    polygonSides,
    polygonId,
    tileTypeId,
    kind: 'star-arm',
    side: ray1.side,
  })
  segments.push({
    from: ray2.origin,
    to: clipSegmentToPolygon(ray2.origin, to2Natural, polyVertices, ray2.edgeIndex),
    edgeMidpoint: ray2.origin,
    polygonCenter,
    polygonSides,
    polygonId,
    tileTypeId,
    kind: 'star-arm',
    side: ray2.side,
  })
}

/**
 * Pair vertex rays from two adjacent vertices sharing an edge.
 * Mirrors pairAtVertex but for vertex-origin rays.
 * Only accepts intersections that fall inside the polygon.
 */
function pairVertexAtEdge(
  vertexRays: VertexRay[],
  vIdx1: number,
  vIdx2: number,
  polyVertices: Vec2[],
  _convex: boolean,
): { ray1: VertexRay; ray2: VertexRay; result: IntersectResult } | null {
  const rA1 = vertexRays[vIdx1 * 2 + 1]
  const rA2 = vertexRays[vIdx2 * 2]
  const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
  const aValid = !!resA && resA.t1 > EPSILON && resA.t2 > EPSILON
  const aInside = aValid && pointInPolygon(resA!.point, polyVertices)

  const rB1 = vertexRays[vIdx1 * 2]
  const rB2 = vertexRays[vIdx2 * 2 + 1]
  const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
  const bValid = !!resB && resB.t1 > EPSILON && resB.t2 > EPSILON
  const bInside = bValid && pointInPolygon(resB!.point, polyVertices)

  if (aInside) return { ray1: rA1, ray2: rA2, result: resA! }
  if (bInside) return { ray1: rB1, ray2: rB2, result: resB! }
  if (aValid) return { ray1: rA1, ray2: rA2, result: resA! }
  if (bValid) return { ray1: rB1, ray2: rB2, result: resB! }
  return null
}

/**
 * Emit vertex arm segments for a single edge pairing.
 *
 * Arms originate at polygon vertices and are clipped to the polygon boundary
 * so an out-of-polygon meeting point doesn't leak into neighbouring tiles.
 */
function emitVertexArms(
  pair: { ray1: VertexRay; ray2: VertexRay; result: IntersectResult },
  autoLineLength: boolean,
  lineLength: number,
  circumradius: number,
  polygonId: string,
  tileTypeId: string,
  polygonCenter: Vec2,
  polygonSides: number,
  edgeMid: Vec2,
  polyVertices: Vec2[],
  segments: Segment[],
): void {
  const { ray1, ray2, result } = pair

  const to1Natural = autoLineLength
    ? result.point
    : {
        x: ray1.origin.x + ray1.dir.x * lineLength * circumradius,
        y: ray1.origin.y + ray1.dir.y * lineLength * circumradius,
      }
  const to2Natural = autoLineLength
    ? result.point
    : {
        x: ray2.origin.x + ray2.dir.x * lineLength * circumradius,
        y: ray2.origin.y + ray2.dir.y * lineLength * circumradius,
      }

  // Vertex arms start at a polygon vertex (incident to two edges); t1 > EPSILON
  // alone rejects the trivial self-intersection so no skipEdgeIdx is needed.
  segments.push({
    from: ray1.origin,
    to: clipSegmentToPolygon(ray1.origin, to1Natural, polyVertices, -1),
    edgeMidpoint: edgeMid,
    polygonCenter,
    polygonSides,
    polygonId,
    tileTypeId,
    kind: 'vertex-line',
    side: ray1.side,
  })
  segments.push({
    from: ray2.origin,
    to: clipSegmentToPolygon(ray2.origin, to2Natural, polyVertices, -1),
    edgeMidpoint: edgeMid,
    polygonCenter,
    polygonSides,
    polygonId,
    tileTypeId,
    kind: 'vertex-line',
    side: ray2.side,
  })
}

/**
 * Run the full PIC pipeline for all polygons. Rays from adjacent edges
 * sharing a vertex meet at a star tip (Kaplan's PIC construction).
 */
/** Build a set of edge-midpoint keys that are shared by 2+ polygons (internal edges). */
function buildInternalEdgeSet(polygons: Polygon[]): Set<string> {
  const f = 1e3
  const edgeCounts = new Map<string, number>()
  for (const poly of polygons) {
    for (let i = 0; i < poly.sides; i++) {
      const mid = midpoint(poly.vertices[i], poly.vertices[(i + 1) % poly.sides])
      const key = `${Math.round(mid.x * f)},${Math.round(mid.y * f)}`
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
    }
  }
  const internal = new Set<string>()
  for (const [key, count] of edgeCounts) {
    if (count >= 2) internal.add(key)
  }
  return internal
}

/**
 * Dedup collinear/overlapping segments within a single polygon.
 * At certain contact angles (e.g. 60° on equilateral triangles) two adjacent
 * edges' contact rays become collinear — pair A fails, pair B succeeds, and
 * each "arm" is emitted twice (once from each end). Collapse endpoint-identical
 * pairs so each unique line renders once.
 */
function dedupPolygonSegments(segments: Segment[], startIdx: number): void {
  const f = 1e3
  const seen = new Set<string>()
  const keep: Segment[] = []
  for (let i = startIdx; i < segments.length; i++) {
    const s = segments[i]
    const ax = Math.round(s.from.x * f), ay = Math.round(s.from.y * f)
    const bx = Math.round(s.to.x * f), by = Math.round(s.to.y * f)
    const key = ax < bx || (ax === bx && ay <= by)
      ? `${ax},${ay}|${bx},${by}`
      : `${bx},${by}|${ax},${ay}`
    if (seen.has(key)) continue
    seen.add(key)
    keep.push(s)
  }
  if (keep.length !== segments.length - startIdx) {
    segments.splice(startIdx, segments.length - startIdx, ...keep)
  }
}

export function runPIC(polygons: Polygon[], config: PatternConfig): Segment[] {
  const segments: Segment[] = []
  const internalEdges = buildInternalEdgeSet(polygons)
  const edgeKeyF = 1e3

  for (const poly of polygons) {
    const fig = config.figures[poly.tileTypeId]
    if (!fig) continue
    const polyStartIdx = segments.length

    const edgeEnabled = fig.edgeLinesEnabled !== false
    const rays = computeContactRays(poly, fig.contactAngle)
    const n = poly.sides
    const inradius = n > 0 ? dist(poly.center, rays[0].origin) : 0
    const convex = isConvexPolygon(poly.vertices)

    // Compute star tips for all vertices
    const starTips: (Vec2 | null)[] = []

    for (let k = 0; k < n; k++) {
      const prevEdge = (k - 1 + n) % n
      const pair = pairAtVertex(rays, prevEdge, k, poly.vertices, convex)
      if (!pair) {
        starTips.push(null)
        continue
      }

      starTips.push(pair.result.point)
      if (edgeEnabled) {
        emitStarArms(pair, fig.autoLineLength, fig.lineLength, inradius, poly.id, poly.tileTypeId, poly.center, n, poly.vertices, segments)
      }
    }

    // Vertex lines: rays from polygon vertices
    if (fig.vertexLinesEnabled) {
      const vtxAngle = fig.vertexLinesDecoupled
        ? (fig.vertexContactAngle ?? fig.contactAngle)
        : fig.contactAngle
      const vtxAutoLen = fig.vertexLinesDecoupled
        ? (fig.vertexAutoLineLength ?? fig.autoLineLength)
        : fig.autoLineLength
      const vtxLineLen = fig.vertexLinesDecoupled
        ? (fig.vertexLineLength ?? fig.lineLength)
        : fig.lineLength

      const vertexRays = computeVertexRays(poly, vtxAngle)
      const circumradius = n > 0 ? dist(poly.center, poly.vertices[0]) : 0

      for (let k = 0; k < n; k++) {
        // Only emit vertex lines for internal edges (shared by 2 polygons)
        const eMid = midpoint(poly.vertices[k], poly.vertices[(k + 1) % n])
        const eKey = `${Math.round(eMid.x * edgeKeyF)},${Math.round(eMid.y * edgeKeyF)}`
        if (!internalEdges.has(eKey)) continue

        const nextV = (k + 1) % n
        const pair = pairVertexAtEdge(vertexRays, k, nextV, poly.vertices, convex)
        if (!pair) continue
        emitVertexArms(pair, vtxAutoLen, vtxLineLen, circumradius, poly.id, poly.tileTypeId, poly.center, n, eMid, poly.vertices, segments)
      }
    }

    dedupPolygonSegments(segments, polyStartIdx)
  }

  return segments
}
