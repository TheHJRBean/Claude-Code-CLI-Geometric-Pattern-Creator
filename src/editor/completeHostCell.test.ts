import { describe, it, expect } from 'vitest'
import { reducer } from '../state/reducer'
import { DEFAULT_CONFIG } from '../state/defaults'
import { createDefault4612EditorConfig } from './createDefault'
import { computeBoundaryCycle } from './boundary'
import { editorBoundaryVertices } from './buildEditorPolygons'
import { applyCellTransform, cellContainingPoint, inverseCellTransform, resolveHostCell } from './patchSelectable'
import { patchRotation } from './compositionLattice'
import { tileVertices } from './exposedEdges'
import { centroid, pointInPolygon } from '../utils/math'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * Multi-vertex Complete must host the new Tile in the Cell that geometrically
 * contains the gap, not in `activeCellId`.
 *
 * `activeCellId` stopped being a user-facing selection in 2026-06-18 — it is
 * now just "the last Cell mutated", and *turning symmetry on for a Cell is
 * itself such a mutation*. Hosting there meant a gap completed in Cell X ran
 * its symmetry orbit in Cell Y's local frame, about Cell Y's centre, under
 * Cell Y's dihedral group — fanning copies onto the sibling Cells and the
 * neighbouring lattice stamps (reported 2026-07-31, 4.6.12).
 */

/** 4.6.12 Patch with the named Cells emptied so there are real gaps. */
function patch4612(...emptyCellIds: string[]): PatternConfig {
  const editor = createDefault4612EditorConfig()
  return {
    ...DEFAULT_CONFIG,
    tiling: { ...DEFAULT_CONFIG.tiling, type: 'editor' },
    editor: {
      ...editor,
      cells: editor.cells.map(c =>
        emptyCellIds.includes(c.id) ? { ...c, noSeed: true, tiles: [] } : c,
      ),
    },
  }
}

/** Patch-world Cell-Boundary corners of a Cell. */
function boundaryCornersWorld(state: PatternConfig, cellId: string): Vec2[] {
  const patch = state.editor!
  const cell = patch.cells.find(c => c.id === cellId)!
  const rot = patchRotation(patch)
  return computeBoundaryCycle(cell).map(v => applyCellTransform(v.p, cell, rot))
}

/** Every Tile in the Patch as `{ cellId, world centroid }`. */
function tileCentroids(state: PatternConfig): { cellId: string; c: Vec2 }[] {
  const patch = state.editor!
  const rot = patchRotation(patch)
  return patch.cells.flatMap(cell =>
    cell.tiles.map(t => ({ cellId: cell.id, c: applyCellTransform(centroid(tileVertices(t)), cell, rot) })),
  )
}

describe('multi-vertex Complete — host Cell resolution', () => {
  it('hosts the completed Tile in the Cell containing the gap, not the active Cell', () => {
    const state = patch4612('square-1')
    const picks = boundaryCornersWorld(state, 'square-1')
    expect(state.editor!.activeCellId).toBe('dodecagon')

    const next = reducer(state, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks } })
    const completed = tileCentroids(next).filter(t => t.cellId === 'square-1')
    expect(completed).toHaveLength(1)
    expect(completed[0].c.x).toBeCloseTo(centroid(picks).x, 6)
    expect(completed[0].c.y).toBeCloseTo(centroid(picks).y, 6)
  })

  it("does not apply an unrelated Cell's symmetry orbit to the completed Tile", () => {
    let state = patch4612('square-1')
    const picks = boundaryCornersWorld(state, 'square-1')
    const before = tileCentroids(state).length

    // The user turns symmetry ON for the dodecagon — which also makes the
    // dodecagon the internal active Cell — then Completes the square gap.
    state = reducer(state, {
      type: 'SET_EDITOR_SYMMETRY_MODE',
      payload: { mode: 'full', cellId: 'dodecagon' },
    })
    expect(state.editor!.activeCellId).toBe('dodecagon')

    const next = reducer(state, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks } })
    const after = tileCentroids(next)

    // Exactly one new Tile: square-1's own symmetryMode is 'none'. Before the
    // fix this produced six, fanned around the dodecagon's centre — two landing
    // on top of square-2 / square-3's seeds and three outside the Patch.
    expect(after).toHaveLength(before + 1)
    const added = after.filter(t => t.cellId === 'square-1')
    expect(added).toHaveLength(1)
    expect(added[0].c.x).toBeCloseTo(centroid(picks).x, 6)
  })

  it("still propagates the host Cell's own symmetry orbit", () => {
    // Empty the dodecagon and complete one wedge from its centre out to two
    // adjacent Boundary corners, with D12 symmetry on that same Cell.
    let state = patch4612('dodecagon')
    const corners = boundaryCornersWorld(state, 'dodecagon')
    const rot = patchRotation(state.editor!)
    const dodec = state.editor!.cells.find(c => c.id === 'dodecagon')!
    const centre = applyCellTransform({ x: 0, y: 0 }, dodec, rot)
    const picks = [centre, corners[0], corners[1]]

    state = reducer(state, {
      type: 'SET_EDITOR_SYMMETRY_MODE',
      payload: { mode: 'rotation', cellId: 'dodecagon' },
    })
    const next = reducer(state, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks } })

    const added = tileCentroids(next).filter(t => t.cellId === 'dodecagon')
    expect(added).toHaveLength(12)
    // Every wedge stays inside the dodecagon's own Boundary.
    const boundary = editorBoundaryVertices(dodec)
    for (const t of added) {
      expect(pointInPolygon(inverseCellTransform(t.c, dodec, rot), boundary)).toBe(true)
    }
  })
})

describe('cellContainingPoint / resolveHostCell', () => {
  it('resolves each Cell centre to that Cell', () => {
    const patch = patch4612().editor!
    const rot = patchRotation(patch)
    for (const cell of patch.cells) {
      const world = applyCellTransform({ x: 0, y: 0 }, cell, rot)
      expect(cellContainingPoint(patch, world, rot)?.id).toBe(cell.id)
      expect(resolveHostCell(patch, world, rot).id).toBe(cell.id)
    }
  })

  it('falls back to the nearest Cell centre outside every Boundary', () => {
    const patch = patch4612().editor!
    const rot = patchRotation(patch)
    const sq1 = patch.cells.find(c => c.id === 'square-1')!
    const sq1Centre = applyCellTransform({ x: 0, y: 0 }, sq1, rot)
    // Well outside every Boundary, but closest to square-1.
    const outside = { x: sq1Centre.x + 400, y: sq1Centre.y }
    expect(cellContainingPoint(patch, outside, rot)).toBeNull()
    expect(resolveHostCell(patch, outside, rot).id).toBe('square-1')
  })
})
