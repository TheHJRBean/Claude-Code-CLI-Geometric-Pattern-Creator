import type { Vec2 } from '../utils/math'
import type { BoundaryShape, EditorConfig } from '../types/editor'

/**
 * Step 17.6 — strand-editor mode lattice preview.
 *
 * Stamp the patch across the viewport on the boundary's translation lattice
 * so the user can see how strands flow across boundaries (Decision 17).
 *
 * Lattice bases (centred on the boundary centre = patch origin):
 *   - Square (edge L): u = (L, 0), v = (0, L). One orientation per stamp.
 *   - Hexagon (edge L): u = (√3·L, 0), v = (√3·L/2, 1.5·L). One orientation
 *     per stamp (point-up hexes tile under the same rotation).
 *   - Triangle (edge L): single-cell preview in v1. Equilateral triangles
 *     need a 2-orientation lattice (up + 180°-rotated down) which is
 *     deferred to a 17.6c follow-up; until then the user sees one stamp
 *     with the strand controls applied.
 */
export interface LatticeStamp {
  /** Translation applied to every patch tile in this stamp. */
  translation: Vec2
  /** Rotation applied (about the patch centre) before translation. 0 in v1. */
  rotation: number
}

/** Boundary's lattice basis vectors. `null` for shapes without a v1 lattice. */
function latticeBasis(editor: EditorConfig): { u: Vec2; v: Vec2 } | null {
  const L = editor.boundarySize
  let basis: { u: Vec2; v: Vec2 } | null
  switch (editor.boundaryShape) {
    case 'square':
      basis = { u: { x: L, y: 0 }, v: { x: 0, y: L } }
      break
    case 'hexagon': {
      const s = Math.sqrt(3) * L
      basis = { u: { x: s, y: 0 }, v: { x: s / 2, y: 1.5 * L } }
      break
    }
    case 'triangle':
      return null // deferred to 17.6c
  }
  if (editor.alternateBoundary) {
    // Rotate basis vectors by π/n so the lattice cells track the rotated
    // boundary outline (square → diamond, hex point-up → flat-top).
    const sides = editor.boundaryShape === 'square' ? 4 : 6
    const a = Math.PI / sides
    const c = Math.cos(a), s = Math.sin(a)
    basis = {
      u: { x: basis.u.x * c - basis.u.y * s, y: basis.u.x * s + basis.u.y * c },
      v: { x: basis.v.x * c - basis.v.y * s, y: basis.v.x * s + basis.v.y * c },
    }
  }
  return basis
}

/** True iff the boundary supports a lattice preview in this version. */
export function supportsLatticePreview(shape: BoundaryShape): boolean {
  return shape !== 'triangle'
}

/**
 * Step 17.6d — one ring of neighbour stamps around the patch (centre stamp
 * excluded). Used by Design-mode "Show neighbours" preview so the user can
 * see how the patch joins its lattice neighbours before flipping to Strand
 * mode. Returns `[]` for triangle boundaries (no v1 lattice).
 *
 * Square: 8 neighbours (orthogonal + diagonal).
 * Hexagon: 6 neighbours (axial 1-ring; (1,1) / (-1,-1) are 2 cells away).
 */
export function editorOneRingNeighbourStamps(editor: EditorConfig): LatticeStamp[] {
  const basis = latticeBasis(editor)
  if (!basis) return []
  const offsets: Array<[number, number]> = editor.boundaryShape === 'square'
    ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]
  return offsets.map(([a, b]) => ({
    translation: {
      x: a * basis.u.x + b * basis.v.x,
      y: a * basis.u.y + b * basis.v.y,
    },
    rotation: 0,
  }))
}

/**
 * Generate enough lattice stamps to cover the given viewport (world coords).
 * The patch always renders at lattice point (0,0); additional stamps are
 * added in a square envelope of the basis sufficient to fill the viewport
 * plus a one-cell margin so panning doesn't reveal seams.
 */
export function editorLatticeStamps(
  editor: EditorConfig,
  viewport: { x: number; y: number; width: number; height: number },
): LatticeStamp[] {
  const basis = latticeBasis(editor)
  if (!basis) return [{ translation: { x: 0, y: 0 }, rotation: 0 }]

  // Map viewport corners back to lattice coords (a, b) such that
  // (a·u + b·v) lies near each corner. Solve a 2x2 linear system per corner.
  const det = basis.u.x * basis.v.y - basis.u.y * basis.v.x
  if (Math.abs(det) < 1e-9) return [{ translation: { x: 0, y: 0 }, rotation: 0 }]
  const inv = {
    a: basis.v.y / det, b: -basis.v.x / det,
    c: -basis.u.y / det, d: basis.u.x / det,
  }
  const corners: Vec2[] = [
    { x: viewport.x, y: viewport.y },
    { x: viewport.x + viewport.width, y: viewport.y },
    { x: viewport.x, y: viewport.y + viewport.height },
    { x: viewport.x + viewport.width, y: viewport.y + viewport.height },
  ]
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity
  for (const c of corners) {
    const a = inv.a * c.x + inv.b * c.y
    const b = inv.c * c.x + inv.d * c.y
    if (a < aMin) aMin = a
    if (a > aMax) aMax = a
    if (b < bMin) bMin = b
    if (b > bMax) bMax = b
  }
  const a0 = Math.floor(aMin) - 1
  const a1 = Math.ceil(aMax) + 1
  const b0 = Math.floor(bMin) - 1
  const b1 = Math.ceil(bMax) + 1

  const stamps: LatticeStamp[] = []
  for (let a = a0; a <= a1; a++) {
    for (let b = b0; b <= b1; b++) {
      stamps.push({
        translation: {
          x: a * basis.u.x + b * basis.v.x,
          y: a * basis.u.y + b * basis.v.y,
        },
        rotation: 0,
      })
    }
  }
  return stamps
}
