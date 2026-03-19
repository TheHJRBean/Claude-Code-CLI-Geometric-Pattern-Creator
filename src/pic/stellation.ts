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
  const theta = degToRad(contactAngleDeg)
  const rays: ContactRay[] = []

  for (let i = 0; i < poly.sides; i++) {
    const A = poly.vertices[i]
    const B = poly.vertices[(i + 1) % poly.sides]
    const origin = midpoint(A, B)
    const edgeDir = normalize({ x: B.x - A.x, y: B.y - A.y })

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
  const theta = degToRad(contactAngleDeg)
  const alpha = Math.PI / 2 - theta
  const rays: VertexRay[] = []

  for (let k = 0; k < poly.sides; k++) {
    const V = poly.vertices[k]
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
