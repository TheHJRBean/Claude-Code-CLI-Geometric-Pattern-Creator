import type { Vec2 } from '../utils/math'
import type { BoundaryShape } from '../types/editor'
import { BOUNDARY_SIDES } from './buildEditorPolygons'

/**
 * Step 17.4 — boundary-symmetry orbit propagation.
 *
 * Each boundary shape carries its dihedral symmetry group D_n about the
 * boundary centre (the patch's local origin):
 *   - triangle → D3 (3 rotations + 3 reflections = 6 elements)
 *   - square   → D4 (4 rotations + 4 reflections = 8 elements)
 *   - hexagon  → D6 (6 rotations + 6 reflections = 12 elements)
 *
 * `Sym` is a 2x2 linear map applied about the boundary centre (which is
 * (0,0) in patch-local coords — see `editorBoundaryVertices`). Decision 8:
 * placements propagate under the boundary's orbit.
 */
export interface Sym {
  /** Row-major 2x2: [a, b; c, d] applied as (a*x + b*y, c*x + d*y). */
  a: number
  b: number
  c: number
  d: number
}

const rot = (theta: number): Sym => ({
  a: Math.cos(theta), b: -Math.sin(theta),
  c: Math.sin(theta), d:  Math.cos(theta),
})

/** Reflection across the line through the origin at angle `axis` (radians). */
const refl = (axis: number): Sym => {
  const c = Math.cos(2 * axis)
  const s = Math.sin(2 * axis)
  return { a: c, b: s, c: s, d: -c }
}

export function applySym(s: Sym, p: Vec2): Vec2 {
  return { x: s.a * p.x + s.b * p.y, y: s.c * p.x + s.d * p.y }
}

/**
 * Generate the full dihedral group D_n about the boundary centre. Reflection
 * axes pass through the boundary's vertices and edge midpoints; the exact
 * axis angles don't matter for orbit-equivalence as long as they form D_n
 * with the rotations, so we use multiples of π/(2n) starting from 0.
 */
export function boundarySymmetries(shape: BoundaryShape): Sym[] {
  const n = BOUNDARY_SIDES[shape]
  const out: Sym[] = []
  for (let k = 0; k < n; k++) out.push(rot((2 * Math.PI * k) / n))
  for (let k = 0; k < n; k++) out.push(refl((Math.PI * k) / n))
  return out
}
