import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { computeContactRays, type ContactRay } from './stellation'
import { rayRayIntersect, type IntersectResult } from './intersect'
import { EPSILON, dist } from '../utils/math'

/**
 * For a given vertex (shared by prevEdge and currEdge), find the correct
 * ray pairing. The pairing depends on polygon winding, so we try both
 * combinations and pick the one where both t values are positive.
 */
function pairAtVertex(
  rays: ContactRay[],
  prevEdge: number,
  currEdge: number,
): { ray1: ContactRay; ray2: ContactRay; result: IntersectResult } | null {
  // Try pairing A: prev.minus + curr.plus
  const rA1 = rays[prevEdge * 2 + 1]
  const rA2 = rays[currEdge * 2]
  const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
  if (resA && resA.t1 > EPSILON && resA.t2 > EPSILON) {
    return { ray1: rA1, ray2: rA2, result: resA }
  }

  // Try pairing B: prev.plus + curr.minus
  const rB1 = rays[prevEdge * 2]
  const rB2 = rays[currEdge * 2 + 1]
  const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
  if (resB && resB.t1 > EPSILON && resB.t2 > EPSILON) {
    return { ray1: rB1, ray2: rB2, result: resB }
  }

  return null
}

/**
 * Run the full PIC pipeline for all polygons.
 *
 * For each polygon vertex, pairs the two adjacent rays (one from each
 * flanking edge) and intersects them to find the star tip. This is
 * Kaplan's correct PIC construction: rays from adjacent edges sharing
 * a vertex meet at a star tip, producing connected star figures.
 *
 * When autoLineLength is false, line length is an absolute value based
 * on the polygon's inradius, independent of the contact angle.
 */
export function runPIC(polygons: Polygon[], config: PatternConfig): Segment[] {
  const segments: Segment[] = []

  for (const poly of polygons) {
    const fig = config.figures[poly.sides]
    if (!fig) continue

    const rays = computeContactRays(poly, fig.contactAngle)
    const n = poly.sides

    // Inradius = distance from center to edge midpoint (constant for regular polygon)
    const inradius = n > 0 ? dist(poly.center, rays[0].origin) : 0

    // For each vertex k (shared by edge k-1 and edge k),
    // find the correct ray pair and intersect them.
    for (let k = 0; k < n; k++) {
      const prevEdge = (k - 1 + n) % n
      const pair = pairAtVertex(rays, prevEdge, k)
      if (!pair) continue

      const { ray1, ray2, result } = pair

      if (fig.autoLineLength) {
        segments.push({
          from: ray1.origin,
          to: result.point,
          edgeMidpoint: ray1.origin,
          polygonId: poly.id,
        })
        segments.push({
          from: ray2.origin,
          to: result.point,
          edgeMidpoint: ray2.origin,
          polygonId: poly.id,
        })
      } else {
        // Absolute line length based on inradius, independent of contact angle
        const t = fig.lineLength * inradius
        segments.push({
          from: ray1.origin,
          to: {
            x: ray1.origin.x + ray1.dir.x * t,
            y: ray1.origin.y + ray1.dir.y * t,
          },
          edgeMidpoint: ray1.origin,
          polygonId: poly.id,
        })
        segments.push({
          from: ray2.origin,
          to: {
            x: ray2.origin.x + ray2.dir.x * t,
            y: ray2.origin.y + ray2.dir.y * t,
          },
          edgeMidpoint: ray2.origin,
          polygonId: poly.id,
        })
      }
    }
  }

  return segments
}
