import { Vec2, EPSILON, cross, dot, sub, len } from '../utils/math'

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

/**
 * Meeting point of two **collinear** rays that approach each other head-on.
 *
 * `rayRayIntersect` returns null for any parallel pair, which is right for the
 * general case but wrong for the one degenerate configuration PIC actually
 * hits: two contact rays lying on the SAME line, aimed at one another. They do
 * meet — everywhere along the overlap — and the symmetric answer is the
 * midpoint of the two origins, reached at half the origin separation along
 * each ray.
 *
 * This is a genuine limit, not a patch. On an equilateral triangle at θ=60°
 * adjacent edges' pair-A rays become exactly collinear; the intersection is
 * (0,−14.48) at θ=59.9° and (0,−14.39) at θ=60.1°, and the origin-midpoint
 * this returns is (0,−14.43) — continuous through the degeneracy. Without it
 * the whole figure falls through to pair-B, whose meeting points sit ON the
 * polygon boundary where `pointInPolygon` classifies them inconsistently
 * between symmetric vertices, and the tile loses its own rotational symmetry.
 *
 * Kept separate from `rayRayIntersect` deliberately: that function is also the
 * workhorse for `clipSegmentToPolygon` and `findOrphanRayEndpoint`, where a
 * segment running collinear with a polygon edge must keep returning null.
 * Only the figure-pairing probe opts in.
 *
 * Returns null unless the rays are collinear AND closing: parallel-but-offset
 * rays never meet, and collinear rays pointing the same way or away from each
 * other have no meeting point ahead of both origins.
 */
export function collinearApproach(
  o1: Vec2, d1: Vec2,
  o2: Vec2, d2: Vec2,
): IntersectResult | null {
  if (Math.abs(cross(d1, d2)) >= EPSILON) return null

  const delta = sub(o2, o1)
  // Scale the collinearity test by the vectors involved: `cross` grows with
  // both magnitudes, so a fixed absolute epsilon would reject genuinely
  // collinear rays once the tiling is drawn at a large scale or far from the
  // origin.
  const scale = len(delta) * len(d1)
  if (Math.abs(cross(delta, d1)) >= EPSILON * Math.max(1, scale)) return null

  const d1sq = dot(d1, d1)
  const d2sq = dot(d2, d2)
  if (d1sq < EPSILON || d2sq < EPSILON) return null

  // Half the separation, expressed in each ray's own parameter units so the
  // result is interchangeable with the non-degenerate branch above.
  const t1 = dot(delta, d1) / (2 * d1sq)
  const t2 = -dot(delta, d2) / (2 * d2sq)
  if (t1 <= EPSILON || t2 <= EPSILON) return null

  return {
    t1,
    t2,
    point: { x: o1.x + delta.x / 2, y: o1.y + delta.y / 2 },
  }
}
