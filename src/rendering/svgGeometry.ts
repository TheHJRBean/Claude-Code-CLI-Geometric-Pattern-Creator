import type { Vec2 } from '../utils/math'

/**
 * Pure SVG-geometry helpers for the render layer (thermo-nuclear review
 * Chunk 10). Extracted from the rendering components — which are React/SVG and
 * can't be snapshot-tested in the node test env — so the behaviour-bearing
 * geometry can be unit-tested directly. `polygonPath` was copy-pasted in
 * `VoidFillLayer` + `DecorationPaintLayer`; the hit-test pair backs the
 * Decoration strand Paint overlay.
 */

/** SVG path `d` for a closed polygon outline. Empty string for degenerate
 *  (<3-vertex) input — callers render nothing. */
export function polygonPath(poly: Vec2[]): string {
  if (poly.length < 3) return ''
  return `M${poly.map(p => `${p.x},${p.y}`).join('L')}Z`
}

/** Shortest distance from point `p` to the segment a→b. The projection is
 *  clamped to the segment, and a zero-length segment degenerates to the
 *  distance from `p` to `a`. */
export function pointSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0
  t = Math.max(0, Math.min(1, t))
  const qx = a.x + dx * t, qy = a.y + dy * t
  return Math.hypot(p.x - qx, p.y - qy)
}

/** Shortest distance from `p` to a polyline (min over its chords). */
export function pointPolylineDist(p: Vec2, pts: Vec2[]): number {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const d = pointSegmentDist(p, pts[i - 1], pts[i])
    if (d < best) best = d
  }
  return best
}

/** Index of the segment nearest `p`, but only within `tol`; `null` otherwise.
 *  The lowest index wins ties. Used by the Decoration strand hit-test, where a
 *  miss (null) deliberately lets the click fall through to the pan handler.
 *  A segment carrying `poly` (its flattened rendered Bézier) is measured
 *  against that polyline instead of the straight `from`→`to` chord — curved
 *  strokes bow away from the chord, which left dead pick zones mid-bulge. */
export function nearestSegmentIndex(
  p: Vec2,
  segs: { from: Vec2; to: Vec2; poly?: Vec2[] }[],
  tol: number,
): number | null {
  let best = -1
  let bestD = tol
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const d = s.poly ? pointPolylineDist(p, s.poly) : pointSegmentDist(p, s.from, s.to)
    if (d < bestD) { bestD = d; best = i }
  }
  return best >= 0 ? best : null
}
