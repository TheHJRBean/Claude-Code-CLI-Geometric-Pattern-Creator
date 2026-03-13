import { Vec2, EPSILON, cross, sub } from '../utils/math'

export interface IntersectResult {
  t1: number
  t2: number
  point: Vec2
}

/**
 * Intersect two rays: o1 + t1*d1 = o2 + t2*d2
 * Returns null if parallel.
 */
export function rayRayIntersect(
  o1: Vec2, d1: Vec2,
  o2: Vec2, d2: Vec2,
): IntersectResult | null {
  const denom = cross(d1, d2)
  if (Math.abs(denom) < EPSILON) return null

  const delta = sub(o2, o1)
  const t1 = cross(delta, d2) / denom
  const t2 = cross(delta, d1) / denom

  return {
    t1,
    t2,
    point: {
      x: o1.x + t1 * d1.x,
      y: o1.y + t1 * d1.y,
    },
  }
}
