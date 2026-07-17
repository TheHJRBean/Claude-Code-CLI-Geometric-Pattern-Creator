import { Vec2, normalize, rotate, perp, midpoint, degToRad, sub, add } from '../utils/math'
import type { Polygon } from '../types/geometry'

export interface ContactRay {
  origin: Vec2     // edge midpoint
  dir: Vec2        // direction into the polygon
  polygonId: string
  edgeIndex: number
  side: 'plus' | 'minus'
}

/**
 * For a given polygon and contact angle θ (degrees),
 * compute the two contact rays for each edge.
 *
 * The contact angle θ is measured from the edge itself.
 * At θ=90° rays are perpendicular (fully open).
 * At θ=0° rays run parallel to the edge (closed).
 * The useful Islamic range is roughly 30°–80°.
 */
export function computeContactRays(poly: Polygon, contactAngleDeg: number): ContactRay[] {
  return computeContactRaysPerEdge(poly, () => contactAngleDeg)
}

/**
 * Per-edge-θ variant for the Morph engine (ADR-0009 §2): `angleDegForEdge`
 * is called once per edge with the edge index and midpoint, so a spatial
 * field can assign each edge its own contact angle. Because a shared edge
 * has one midpoint, both adjacent polygons derive the same θ there and
 * Strands stay straight through the contact point by construction.
 */
export function computeContactRaysPerEdge(
  poly: Polygon,
  angleDegForEdge: (edgeIndex: number, edgeMidpoint: Vec2) => number,
): ContactRay[] {
  const rays: ContactRay[] = []

  for (let i = 0; i < poly.sides; i++) {
    const A = poly.vertices[i]
    const B = poly.vertices[(i + 1) % poly.sides]
    const origin = midpoint(A, B)
    const edgeDir = normalize({ x: B.x - A.x, y: B.y - A.y })
    const theta = degToRad(angleDegForEdge(i, origin))

    // Two rays symmetrically about the inward normal at angle (π/2 - θ) from it.
    // For a CW polygon in SVG (y-down), the inward normal is perp(edgeDir)
    // (the left-hand / CCW perpendicular). We rotate the inward normal by
    // ±(π/2 - θ) to get two rays that both point into the polygon interior.
    const alpha = Math.PI / 2 - theta
    const inwardNormal = perp(edgeDir)

    rays.push({
      origin,
      dir: rotate(inwardNormal, alpha),
      polygonId: poly.id,
      edgeIndex: i,
      side: 'plus',
    })
    rays.push({
      origin,
      dir: rotate(inwardNormal, -alpha),
      polygonId: poly.id,
      edgeIndex: i,
      side: 'minus',
    })
  }

  return rays
}

export interface VertexRay {
  origin: Vec2       // vertex position
  dir: Vec2          // direction into the polygon
  polygonId: string
  vertexIndex: number
  side: 'plus' | 'minus'
}

/**
 * For a given polygon and contact angle θ (degrees),
 * compute two rays at each vertex, symmetric about the
 * interior angle bisector.
 *
 * The bisector points inward (toward polygon center).
 * Rays are rotated by ±(π/2 − θ) from the bisector,
 * mirroring the edge-midpoint convention.
 */
export function computeVertexRays(poly: Polygon, contactAngleDeg: number): VertexRay[] {
  return computeVertexRaysPerVertex(poly, () => contactAngleDeg)
}

/**
 * Per-vertex-θ variant for the Morph engine: `angleDegForVertex` is called
 * once per vertex, so a spatial field can assign each vertex its own contact
 * angle. A shared vertex is one world point, so every polygon meeting there
 * derives the same θ (the vertex-line analogue of the per-edge-midpoint rule).
 */
export function computeVertexRaysPerVertex(
  poly: Polygon,
  angleDegForVertex: (vertexIndex: number, vertex: Vec2) => number,
): VertexRay[] {
  const rays: VertexRay[] = []

  for (let k = 0; k < poly.sides; k++) {
    const V = poly.vertices[k]
    const alpha = Math.PI / 2 - degToRad(angleDegForVertex(k, V))
    const prev = poly.vertices[(k - 1 + poly.sides) % poly.sides]
    const next = poly.vertices[(k + 1) % poly.sides]

    // Two edge directions emanating from vertex k
    const toPrev = normalize(sub(prev, V))
    const toNext = normalize(sub(next, V))

    // Interior angle bisector (points inward for convex polygons)
    const bisector = normalize(add(toPrev, toNext))

    rays.push({
      origin: V,
      dir: rotate(bisector, alpha),
      polygonId: poly.id,
      vertexIndex: k,
      side: 'plus',
    })
    rays.push({
      origin: V,
      dir: rotate(bisector, -alpha),
      polygonId: poly.id,
      vertexIndex: k,
      side: 'minus',
    })
  }

  return rays
}
