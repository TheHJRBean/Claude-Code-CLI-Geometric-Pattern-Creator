import { add, scale, normalize, midpoint, Vec2 } from '../utils/math'
import type { Polygon } from '../types/geometry'

let _idCounter = 0
export const resetIds = () => { _idCounter = 0 }
export const nextId = () => `p${_idCounter++}`

/**
 * Create a regular n-gon centered at `center` with circumradius `R`
 * and initial rotation angle `phi` (radians).
 */
export function createPolygon(sides: number, center: Vec2, R: number, phi: number): Polygon {
  const vertices: Vec2[] = []
  for (let k = 0; k < sides; k++) {
    const angle = phi + (2 * Math.PI * k) / sides
    vertices.push({ x: center.x + R * Math.cos(angle), y: center.y + R * Math.sin(angle) })
  }
  return { id: nextId(), sides, vertices, center }
}

/**
 * Given edge length `s`, compute the circumradius of a regular n-gon.
 */
export const circumradius = (sides: number, edgeLen: number): number =>
  edgeLen / (2 * Math.sin(Math.PI / sides))

/**
 * Compute the polygon that shares edge (A → B) with an m-sided neighbor.
 * The neighbor's center is placed on the outward perpendicular bisector.
 */
export function neighborPolygon(A: Vec2, B: Vec2, sides: number, edgeLen: number): Polygon {
  const mid = midpoint(A, B)
  const edgeDir = normalize({ x: B.x - A.x, y: B.y - A.y })
  // Right-hand perpendicular = outward normal for CW polygon in SVG (y-down coords).
  // perp() is the CCW (left-hand) perp, which is the INWARD normal for CW polygons,
  // so we negate it to get the outward direction.
  const outward = { x: edgeDir.y, y: -edgeDir.x }
  const apothem = (edgeLen / 2) / Math.tan(Math.PI / sides)
  const center = add(mid, scale(outward, apothem))
  // Initial rotation: vertex 0 at position A
  const phi = Math.atan2(A.y - center.y, A.x - center.x)
  const R = circumradius(sides, edgeLen)
  return createPolygon(sides, center, R, phi)
}

/** Round a coordinate for use as a map key */
export const roundKey = (v: Vec2, precision = 3): string => {
  const f = 10 ** precision
  return `${Math.round(v.x * f)},${Math.round(v.y * f)}`
}

export const polygonKey = (p: Polygon): string => roundKey(p.center)
