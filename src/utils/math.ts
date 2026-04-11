export const EPSILON = 1e-9

export interface Vec2 {
  x: number
  y: number
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
export const len = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y)
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => add(scale(a, 1 - t), scale(b, t))

export const normalize = (v: Vec2): Vec2 => {
  const l = len(v)
  if (l < EPSILON) return { x: 1, y: 0 }
  return { x: v.x / l, y: v.y / l }
}

export const rotate = (v: Vec2, angle: number): Vec2 => ({
  x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
  y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
})

/** Left-hand (CCW) perpendicular */
export const perp = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x })

export const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b))

export const pointsEqual = (a: Vec2, b: Vec2, eps = EPSILON): boolean =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v))

export const degToRad = (d: number): number => (d * Math.PI) / 180
export const radToDeg = (r: number): number => (r * 180) / Math.PI

/** Test if a polygon's vertices are all convex (no reflex angles) */
export function isConvexPolygon(poly: Vec2[]): boolean {
  const n = poly.length
  if (n < 3) return true
  let sign = 0
  for (let i = 0; i < n; i++) {
    const o = poly[i]
    const a = poly[(i + 1) % n]
    const b = poly[(i + 2) % n]
    const c = (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
    if (Math.abs(c) < EPSILON) continue
    if (sign === 0) sign = c > 0 ? 1 : -1
    else if ((c > 0 ? 1 : -1) !== sign) return false
  }
  return true
}

/** Test if point P is strictly inside a convex or concave polygon using ray casting */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = (yi > p.y) !== (yj > p.y) &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Centroid of a polygon */
export function centroid(poly: Vec2[]): Vec2 {
  const n = poly.length
  let x = 0, y = 0
  for (const v of poly) { x += v.x; y += v.y }
  return { x: x / n, y: y / n }
}

/* ── Bézier utilities ──────────────────────────────────────────── */

export interface CubicCurve {
  cp1: Vec2
  cp2: Vec2
  end: Vec2
}

/** Evaluate a quadratic Bézier B(t) = (1-t)²P0 + 2(1-t)tCP + t²P1 */
export function evalQuadratic(p0: Vec2, cp: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
  }
}

/** Evaluate a cubic Bézier B(t) = (1-t)³P0 + 3(1-t)²tCP1 + 3(1-t)t²CP2 + t³P1 */
export function evalCubic(p0: Vec2, cp1: Vec2, cp2: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t
  const uu = u * u, tt = t * t
  return {
    x: uu * u * p0.x + 3 * uu * t * cp1.x + 3 * u * tt * cp2.x + tt * t * p1.x,
    y: uu * u * p0.y + 3 * uu * t * cp1.y + 3 * u * tt * cp2.y + tt * t * p1.y,
  }
}

/** Split a cubic Bézier at parameter t using De Casteljau, returning two cubics */
export function splitCubic(
  p0: Vec2, cp1: Vec2, cp2: Vec2, p1: Vec2, t: number,
): [CubicCurve, CubicCurve] {
  const a = lerp(p0, cp1, t)
  const b = lerp(cp1, cp2, t)
  const c = lerp(cp2, p1, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const mid = lerp(d, e, t)
  return [
    { cp1: a, cp2: d, end: mid },
    { cp1: e, cp2: c, end: p1 },
  ]
}

/**
 * Approximate a quartic Bézier (5 control points) as two cubic Béziers.
 * Uses De Casteljau subdivision at t=0.5 on the quartic, then degree-reduces
 * each half to a cubic.
 */
export function quarticToCubics(
  p0: Vec2, cp1: Vec2, cp2: Vec2, cp3: Vec2, p4: Vec2,
): [CubicCurve, CubicCurve] {
  // De Casteljau at t=0.5 for degree 4
  const m01 = midpoint(p0, cp1)
  const m12 = midpoint(cp1, cp2)
  const m23 = midpoint(cp2, cp3)
  const m34 = midpoint(cp3, p4)
  const m012 = midpoint(m01, m12)
  const m123 = midpoint(m12, m23)
  const m234 = midpoint(m23, m34)
  const m0123 = midpoint(m012, m123)
  const m1234 = midpoint(m123, m234)
  const mid = midpoint(m0123, m1234)

  // Degree-reduce each quartic half to a cubic (best L2 approximation)
  // Left half: p0, m01, m012, m0123, mid → cubic p0, c1L, c2L, mid
  const c1L = lerp(m01, m012, 1 / 3)
  const c2L = lerp(m0123, m012, 1 / 3)
  // Right half: mid, m1234, m234, m34, p4 → cubic mid, c1R, c2R, p4
  const c1R = lerp(m1234, m234, 1 / 3)
  const c2R = lerp(m34, m234, 1 / 3)

  return [
    { cp1: c1L, cp2: c2L, end: mid },
    { cp1: c1R, cp2: c2R, end: p4 },
  ]
}
