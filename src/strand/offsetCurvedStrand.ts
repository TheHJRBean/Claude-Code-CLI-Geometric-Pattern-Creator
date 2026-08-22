import { add, normalize, perp, scale, sub, cross, dist, type Vec2 } from '../utils/math'
import type { CurvedStrand } from './computeCurves'

/**
 * Push a **Strand** sideways by `d` — the open-path counterpart of
 * `offsetPolygonOutward`, and the one thing the `'individual'` colour grain
 * needs that a Strand did not already have.
 *
 * Every other stroke effect is built from concentric masks, which are
 * symmetric by construction: a stroke is centred on its path, so a band cut at
 * `+x` is cut at `−x` too. Colouring one side differently is therefore not a
 * masking problem at all — it needs a path that runs down one side, and that
 * is what this returns.
 *
 * **Sign convention.** `d > 0` moves toward the left-hand normal of the
 * direction of travel. Which side of the drawn line that lands on is a
 * property of the order the Strand's Rays chained, not of the picture — see
 * `GapFillMode` — so callers must not describe it as outward or inward.
 *
 * **Joins are mitred**, matching `offsetPolygonOutward`, and clamped by the
 * same rule: past `miterLimit × |d|` the corner falls back to the plain
 * edge-normal offset rather than firing a spike across the canvas. Strand
 * chains bend hard at contact points on some tilings (Cairo pentagonal kinks
 * 15°, and a star tip far more), so the clamp is load-bearing, not defensive.
 *
 * **Curved edges offset their control points along the same normals.** That is
 * exact for a straight edge — which is most of them, since `buildStrands`
 * merges collinear runs and an uncurved field has nothing else — and a
 * standard approximation for a Bézier, with error second-order in curvature.
 * At the offsets in play (at most half a stroke width) the band stays inside
 * its own line: the alternative, subdividing each curve into offset arcs,
 * buys accuracy nothing here can see.
 */
export function offsetCurvedStrand(strand: CurvedStrand, d: number, miterLimit = 4): CurvedStrand {
  const { points, curves } = strand
  if (points.length < 2 || d === 0) return strand

  // Left-hand normal of each edge, and the edge's own offset line.
  const n = points.length
  const normals: Vec2[] = []
  for (let i = 0; i < n - 1; i++) {
    const dir = normalize(sub(points[i + 1], points[i]))
    normals.push(perp(dir))
  }

  const offsetPoints: Vec2[] = points.map((p, i) => {
    // An endpoint has one edge, so its offset is that edge's normal — there
    // is no corner to mitre. This is the difference from the closed case,
    // where every vertex joins two edges.
    if (i === 0) return add(p, scale(normals[0], d))
    if (i === n - 1) return add(p, scale(normals[n - 2], d))
    const a = { at: add(points[i], scale(normals[i - 1], d)), dir: normalize(sub(points[i], points[i - 1])) }
    const b = { at: add(points[i], scale(normals[i], d)), dir: normalize(sub(points[i + 1], points[i])) }
    const denom = cross(a.dir, b.dir)
    if (Math.abs(denom) < 1e-9) return b.at // collinear: no corner to cut
    const t = cross(sub(b.at, a.at), b.dir) / denom
    const corner = add(a.at, scale(a.dir, t))
    return dist(corner, points[i]) > miterLimit * Math.abs(d) ? b.at : corner
  })

  const offsetCurves = curves.map((cps, i) =>
    cps ? cps.map(cp => add(cp, scale(normals[i], d))) : null,
  )

  return { points: offsetPoints, curves: offsetCurves }
}
