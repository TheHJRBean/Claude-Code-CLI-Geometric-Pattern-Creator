import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { computeContactRays, computeVertexRays, type ContactRay, type VertexRay } from './stellation'
import { rayRayIntersect, type IntersectResult } from './intersect'
import { EPSILON, dist, lerp, midpoint, pointInPolygon, isConvexPolygon, type Vec2 } from '../utils/math'

/**
 * For a given vertex (shared by prevEdge and currEdge), find the correct
 * ray pairing. The pairing depends on polygon winding, so we try both
 * combinations and pick the one where both t values are positive.
 */
function pairAtVertex(
  rays: ContactRay[],
  prevEdge: number,
  currEdge: number,
  polyVertices: Vec2[],
  convex: boolean,
): { ray1: ContactRay; ray2: ContactRay; result: IntersectResult } | null {
  // Try pairing A: prev.minus + curr.plus
  const rA1 = rays[prevEdge * 2 + 1]
  const rA2 = rays[currEdge * 2]
  const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
  if (resA && resA.t1 > EPSILON && resA.t2 > EPSILON &&
      (convex || pointInPolygon(resA.point, polyVertices))) {
    return { ray1: rA1, ray2: rA2, result: resA }
  }

  // Try pairing B: prev.plus + curr.minus
  const rB1 = rays[prevEdge * 2]
  const rB2 = rays[currEdge * 2 + 1]
  const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
  if (resB && resB.t1 > EPSILON && resB.t2 > EPSILON &&
      (convex || pointInPolygon(resB.point, polyVertices))) {
    return { ray1: rB1, ray2: rB2, result: resB }
  }

  return null
}

/**
 * Emit star arm segments for a single vertex pairing.
 */
function emitStarArms(
  pair: { ray1: ContactRay; ray2: ContactRay; result: IntersectResult },
  autoLineLength: boolean,
  lineLength: number,
  inradius: number,
  polygonId: string,
  tileTypeId: string,
  polygonCenter: Vec2,
  segments: Segment[],
): void {
  const { ray1, ray2, result } = pair

  if (autoLineLength) {
    segments.push({
      from: ray1.origin,
      to: result.point,
      edgeMidpoint: ray1.origin,
      polygonCenter,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
    })
    segments.push({
      from: ray2.origin,
      to: result.point,
      edgeMidpoint: ray2.origin,
      polygonCenter,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
    })
  } else {
    const t = lineLength * inradius
    segments.push({
      from: ray1.origin,
      to: {
        x: ray1.origin.x + ray1.dir.x * t,
        y: ray1.origin.y + ray1.dir.y * t,
      },
      edgeMidpoint: ray1.origin,
      polygonCenter,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
    })
    segments.push({
      from: ray2.origin,
      to: {
        x: ray2.origin.x + ray2.dir.x * t,
        y: ray2.origin.y + ray2.dir.y * t,
      },
      edgeMidpoint: ray2.origin,
      polygonCenter,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
    })
  }
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
  convex: boolean,
): { ray1: VertexRay; ray2: VertexRay; result: IntersectResult } | null {
  // Try pairing A: v1.minus + v2.plus
  const rA1 = vertexRays[vIdx1 * 2 + 1]
  const rA2 = vertexRays[vIdx2 * 2]
  const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
  if (resA && resA.t1 > EPSILON && resA.t2 > EPSILON &&
      (convex || pointInPolygon(resA.point, polyVertices))) {
    return { ray1: rA1, ray2: rA2, result: resA }
  }

  // Try pairing B: v1.plus + v2.minus
  const rB1 = vertexRays[vIdx1 * 2]
  const rB2 = vertexRays[vIdx2 * 2 + 1]
  const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
  if (resB && resB.t1 > EPSILON && resB.t2 > EPSILON &&
      (convex || pointInPolygon(resB.point, polyVertices))) {
    return { ray1: rB1, ray2: rB2, result: resB }
  }

  return null
}

/**
 * Emit vertex arm segments for a single edge pairing.
 */
function emitVertexArms(
  pair: { ray1: VertexRay; ray2: VertexRay; result: IntersectResult },
  autoLineLength: boolean,
  lineLength: number,
  circumradius: number,
  polygonId: string,
  tileTypeId: string,
  polygonCenter: Vec2,
  edgeMid: Vec2,
  segments: Segment[],
): void {
  const { ray1, ray2, result } = pair

  if (autoLineLength) {
    segments.push({
      from: ray1.origin,
      to: result.point,
      edgeMidpoint: edgeMid,
      polygonCenter,
      polygonId,
      tileTypeId,
      kind: 'vertex-line',
    })
    segments.push({
      from: ray2.origin,
      to: result.point,
      edgeMidpoint: edgeMid,
      polygonCenter,
      polygonId,
      tileTypeId,
      kind: 'vertex-line',
    })
  } else {
    const t = lineLength * circumradius
    segments.push({
      from: ray1.origin,
      to: {
        x: ray1.origin.x + ray1.dir.x * t,
        y: ray1.origin.y + ray1.dir.y * t,
      },
      edgeMidpoint: edgeMid,
      polygonCenter,
      polygonId,
      tileTypeId,
      kind: 'vertex-line',
    })
    segments.push({
      from: ray2.origin,
      to: {
        x: ray2.origin.x + ray2.dir.x * t,
        y: ray2.origin.y + ray2.dir.y * t,
      },
      edgeMidpoint: edgeMid,
      polygonCenter,
      polygonId,
      tileTypeId,
      kind: 'vertex-line',
    })
  }
}

/**
 * Run the full PIC pipeline for all polygons.
 *
 * For 'star' figures: rays from adjacent edges sharing a vertex meet at
 * a star tip (Kaplan's PIC construction).
 *
 * For 'rosette' figures: same star arms plus petal connections between
 * adjacent star tips. The rosetteQ parameter (0–1) controls petal shape:
 *   q=0 → straight tip-to-tip connections
 *   q=1 → full knee through edge midpoint
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

export function runPIC(polygons: Polygon[], config: PatternConfig): Segment[] {
  const segments: Segment[] = []
  const internalEdges = buildInternalEdgeSet(polygons)
  const edgeKeyF = 1e3

  for (const poly of polygons) {
    const fig = config.figures[poly.tileTypeId]
    if (!fig) continue

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
        emitStarArms(pair, fig.autoLineLength, fig.lineLength, inradius, poly.id, poly.tileTypeId, poly.center, segments)
      }
    }

    // Rosette: add petal connections between adjacent star tips
    if (edgeEnabled && fig.type === 'rosette') {
      const q = fig.rosetteQ ?? 0.5
      for (let k = 0; k < n; k++) {
        const tipA = starTips[k]
        const tipB = starTips[(k + 1) % n]
        if (!tipA || !tipB) continue

        // Edge midpoint for edge k (between vertex k and vertex k+1)
        const edgeMid = rays[k * 2].origin

        if (Math.abs(q) < EPSILON) {
          // Direct connection between tips
          segments.push({
            from: tipA,
            to: tipB,
            edgeMidpoint: edgeMid,
            polygonCenter: poly.center,
            polygonId: poly.id,
            tileTypeId: poly.tileTypeId,
            kind: 'petal',
          })
        } else {
          // Kneed connection: two knee points displaced toward edge midpoint
          // K1 = lerp(tipA, edgeMid, q), K2 = lerp(tipB, edgeMid, q)
          // Creates a trapezoidal petal: narrow at tips, wide near edge
          const knee1 = lerp(tipA, edgeMid, q)
          const knee2 = lerp(tipB, edgeMid, q)

          segments.push({
            from: tipA,
            to: knee1,
            edgeMidpoint: edgeMid,
            polygonCenter: poly.center,
            polygonId: poly.id,
            tileTypeId: poly.tileTypeId,
            kind: 'petal',
          })
          // Only add middle segment if knees aren't coincident
          if (dist(knee1, knee2) > EPSILON) {
            segments.push({
              from: knee1,
              to: knee2,
              edgeMidpoint: edgeMid,
              polygonCenter: poly.center,
              polygonId: poly.id,
              tileTypeId: poly.tileTypeId,
              kind: 'petal',
            })
          }
          segments.push({
            from: knee2,
            to: tipB,
            edgeMidpoint: edgeMid,
            polygonCenter: poly.center,
            polygonId: poly.id,
            tileTypeId: poly.tileTypeId,
            kind: 'petal',
          })
        }
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
        emitVertexArms(pair, vtxAutoLen, vtxLineLen, circumradius, poly.id, poly.tileTypeId, poly.center, eMid, segments)
      }
    }
  }

  return segments
}
