import type { Vec2 } from '../utils/math'
import { normalize, rotate, perp, midpoint, dist, degToRad, EPSILON } from '../utils/math'
import { rayRayIntersect } from './intersect'

/**
 * Compute the lineLength value (as a fraction of inradius) at which
 * star arms from adjacent edges meet at their tip — the "auto" value.
 *
 * Uses a unit regular polygon to determine the ratio analytically.
 */
export function computeAutoLineLength(sides: number, contactAngleDeg: number): number {
  if (sides < 3) return 1.0

  // Unit regular polygon (circumradius = 1)
  const vertices: Vec2[] = []
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides
    vertices.push({ x: Math.cos(angle), y: Math.sin(angle) })
  }

  const center: Vec2 = { x: 0, y: 0 }
  const theta = degToRad(contactAngleDeg)
  const alpha = Math.PI / 2 - theta

  // Edges sharing vertex 0: edge (n-1) and edge 0
  const A0 = vertices[0], B0 = vertices[1]
  const mid0 = midpoint(A0, B0)
  const edgeDir0 = normalize({ x: B0.x - A0.x, y: B0.y - A0.y })
  const normal0 = perp(edgeDir0)

  const Ap = vertices[sides - 1], Bp = vertices[0]
  const midP = midpoint(Ap, Bp)
  const edgeDirP = normalize({ x: Bp.x - Ap.x, y: Bp.y - Ap.y })
  const normalP = perp(edgeDirP)

  const inradius = dist(center, mid0)
  if (inradius < EPSILON) return 1.0

  // Try pairing A: prev.minus + curr.plus (matches pairAtVertex logic)
  const resA = rayRayIntersect(midP, rotate(normalP, -alpha), mid0, rotate(normal0, alpha))
  if (resA && resA.t1 > EPSILON && resA.t2 > EPSILON) {
    return resA.t1 / inradius
  }

  // Try pairing B: prev.plus + curr.minus
  const resB = rayRayIntersect(midP, rotate(normalP, alpha), mid0, rotate(normal0, -alpha))
  if (resB && resB.t1 > EPSILON && resB.t2 > EPSILON) {
    return resB.t1 / inradius
  }

  return 1.0
}

/**
 * Snap a value to the nearest snap point if within threshold.
 */
export function snapToNearest(
  value: number,
  snapPoints: number[],
  threshold: number = 0.05,
): number {
  let closest = value
  let minDist = threshold
  for (const snap of snapPoints) {
    const d = Math.abs(value - snap)
    if (d < minDist) {
      minDist = d
      closest = snap
    }
  }
  return closest
}
