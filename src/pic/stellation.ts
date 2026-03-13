import { Vec2, normalize, rotate, midpoint, degToRad } from '../utils/math'
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

    // Two rays symmetrically about the inward normal at angle theta from the edge
    // rotate edgeDir by +(π/2 - θ) and -(π/2 - θ) toward the interior
    const alpha = Math.PI / 2 - theta

    rays.push({
      origin,
      dir: rotate(edgeDir, alpha),
      polygonId: poly.id,
      edgeIndex: i,
      side: 'plus',
    })
    rays.push({
      origin,
      dir: rotate(edgeDir, -alpha),
      polygonId: poly.id,
      edgeIndex: i,
      side: 'minus',
    })
  }

  return rays
}
