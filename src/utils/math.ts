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
