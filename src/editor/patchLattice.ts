import type { EditorCell, EditorPatch } from '../types/editor'
import { editorLatticeStamps, editorNeighbourStamps, type LatticeStamp } from './lattice'
import { compositionLatticeStamps, compositionNeighbourStamps } from './compositionLattice'

/**
 * The **one** place anything asks "where does this Patch repeat?".
 *
 * Two dispatches used to be spelled out at every call site — single-cell vs
 * multi-cell — which meant a third case (**Freeform**: the Patch doesn't repeat
 * at all) would have had to be added at each of them, and a missed site renders
 * the Lattice the user just switched off. Both branches live here instead, so
 * `patch.freeform` is checked exactly once and every consumer — the Composition
 * field, the Design-Phase neighbour ghosts, the neighbour pick targets in
 * `patchSelectable`, the stamped Guide copies, the Decoration orbit ring —
 * agrees on what "no tiling" means.
 *
 * A Freeform Patch still has an identity stamp: it is drawn once, in place.
 * `patchNeighbourStamps` is that set minus the centre copy, so it is empty.
 */

const IDENTITY: LatticeStamp = { translation: { x: 0, y: 0 }, rotation: 0 }

interface Viewport { x: number; y: number; width: number; height: number }

/**
 * Every Lattice stamp covering `viewport`, the centre copy included.
 *
 * `cell` is the single-cell representative to read the Boundary lattice off;
 * defaults to the Patch's first Cell. (Callers holding the reducer's
 * representative Cell pass it so the two can't drift; in a single-cell Patch
 * they are the same Cell either way.)
 */
export function patchLatticeStamps(
  patch: EditorPatch,
  viewport: Viewport,
  cell: EditorCell = patch.cells[0],
): LatticeStamp[] {
  if (patch.freeform) return [IDENTITY]
  return patch.cells.length > 1
    ? compositionLatticeStamps(patch, viewport)
    : editorLatticeStamps(cell, viewport)
}

/**
 * The visible Lattice minus the centre copy — the *neighbour* stamps behind
 * the Design-Phase ghost preview, its clickable vertices and the stamped Guide
 * copies. Empty under Freeform: there are no neighbours.
 */
export function patchNeighbourStamps(
  patch: EditorPatch,
  viewport: Viewport,
  cell: EditorCell = patch.cells[0],
): LatticeStamp[] {
  if (patch.freeform) return []
  return patch.cells.length > 1
    ? compositionNeighbourStamps(patch, viewport)
    : editorNeighbourStamps(cell, viewport)
}
