import type { Vec2 } from '../utils/math'
import type { BoundaryShape, SymmetryMode } from '../types/editor'
import { BOUNDARY_SIDES } from './buildEditorPolygons'

/**
 * Step 17.4 (re-enabled) — boundary-symmetry orbit propagation under a
 * user-selectable subgroup.
 *
 * Each boundary shape carries its dihedral symmetry group D_n about the
 * boundary centre (the patch's local origin):
 *   - triangle → D3 (3 rotations + 3 reflections = 6 elements)
 *   - square   → D4 (4 rotations + 4 reflections = 8 elements)
 *   - hexagon  → D6 (6 rotations + 6 reflections = 12 elements)
 *
 * `boundarySymmetries(shape, mode)` returns the subgroup the user picked:
 * the full group, rotations only, a single mirror axis, or just the
 * identity. `Sym` is a 2x2 linear map applied about the boundary centre
 * (which is (0,0) in patch-local coords — see `editorBoundaryVertices`).
 */
export interface Sym {
  /** Row-major 2x2: [a, b; c, d] applied as (a*x + b*y, c*x + d*y). */
  a: number
  b: number
  c: number
  d: number
}

export const IDENTITY: Sym = { a: 1, b: 0, c: 0, d: 1 }

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
 * Subgroup of the boundary's dihedral group that placements should
 * propagate under, picked by `mode`. `'horizontal'` is invalid for
 * triangle (no horizontal mirror axis among its 3 mirrors); the picker UI
 * disables that combo, but defensively this returns identity-only here.
 *
 * Reflection axes pass through the boundary's vertices and edge midpoints
 * for `'full'`. For the single-mirror modes we hard-code the screen-space
 * vertical (π/2) and horizontal (0) axes — both are genuine mirrors of
 * square and hexagon boundaries (in default and alternate orientations);
 * triangle has only vertical, not horizontal.
 */
export function boundarySymmetries(shape: BoundaryShape, mode: SymmetryMode): Sym[] {
  if (mode === 'none') return [IDENTITY]
  const n = BOUNDARY_SIDES[shape]
  if (mode === 'rotation') {
    const out: Sym[] = []
    for (let k = 0; k < n; k++) out.push(rot((2 * Math.PI * k) / n))
    return out
  }
  if (mode === 'vertical') return [IDENTITY, refl(Math.PI / 2)]
  if (mode === 'horizontal') {
    if (shape === 'triangle') return [IDENTITY] // no horizontal mirror axis
    return [IDENTITY, refl(0)]
  }
  // 'full' — D_n
  const out: Sym[] = []
  for (let k = 0; k < n; k++) out.push(rot((2 * Math.PI * k) / n))
  for (let k = 0; k < n; k++) out.push(refl((Math.PI * k) / n))
  return out
}
