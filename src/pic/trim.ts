import { Vec2, pointInPolygon, EPSILON } from '../utils/math'
import type { Polygon, Segment } from '../types/geometry'
import type { ContactRay } from './stellation'
import { rayRayIntersect } from './intersect'

/**
 * For each polygon, intersect all its contact rays pairwise.
 * Keep intersections where both t values are positive and the point
 * is inside the polygon. Trim each ray to its nearest such intersection.
 *
 * @param lengthScale - optional multiplier on the auto-computed length (1.0 = meet neighbours)
 */
export function trimRays(poly: Polygon, rays: ContactRay[], lengthScale?: number): Segment[] {
  const segments: Segment[] = []
  const n = rays.length

  // For each ray, find the nearest valid intersection
  for (let i = 0; i < n; i++) {
    const r1 = rays[i]
    let nearestT = Infinity
    let nearestPoint: Vec2 | null = null

    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const r2 = rays[j]

      // Skip rays from the same edge — they share an origin
      if (r1.edgeIndex === r2.edgeIndex) continue

      const result = rayRayIntersect(r1.origin, r1.dir, r2.origin, r2.dir)
      if (!result) continue
      if (result.t1 < EPSILON || result.t2 < EPSILON) continue

      // Must be inside the polygon
      if (!pointInPolygon(result.point, poly.vertices)) continue

      if (result.t1 < nearestT) {
        nearestT = result.t1
        nearestPoint = result.point
      }
    }

    if (nearestPoint) {
      let to = nearestPoint
      if (lengthScale !== undefined && lengthScale !== 1.0) {
        to = {
          x: r1.origin.x + (nearestPoint.x - r1.origin.x) * lengthScale,
          y: r1.origin.y + (nearestPoint.y - r1.origin.y) * lengthScale,
        }
      }
      segments.push({
        from: r1.origin,
        to,
        edgeMidpoint: r1.origin,
        polygonCenter: poly.center,
        polygonSides: poly.sides,
        polygonId: poly.id,
        tileTypeId: poly.tileTypeId,
        kind: 'star-arm',
        side: r1.side,
      })
    }
  }

  return segments
}
