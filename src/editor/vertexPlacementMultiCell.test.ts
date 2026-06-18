import { describe, it, expect } from 'vitest'
import { createDefault488EditorConfig } from './createDefault'
import { computeExposedVertices, vertexPlacementOrientations } from './vertexPlacement'
import { reducer } from '../state/reducer'
import type { PatternConfig } from '../types/pattern'

/**
 * Multi-cell vertex placement (Step 17.13, multi-cell lift 2026-06-18).
 *
 * Vertex placement used to be hard-gated to single-cell Patches (the reducer
 * bailed when `cells.length > 1`). The geometry, orbit, and viability helpers
 * are all Cell-local + Cell-scoped, so — exactly like boundary-section (17.12)
 * — routing through `updateActiveCell` places into the active Cell of a
 * multi-cell Patch without any Patch-level transform. This pins that the
 * reducer now does so, and that the placement is confined to the active Cell.
 */
describe('vertex placement — multi-cell Patches', () => {
  function multiCellState(): PatternConfig {
    const editor = createDefault488EditorConfig()
    // Activate the square Cell and empty it so its Boundary corners are exposed
    // with the full inward wedge — the boundary-matching Seed Tile would
    // otherwise fill every corner, leaving no open sector to place into.
    editor.activeCellId = 'square'
    editor.cells = editor.cells.map(c => (c.id === 'square' ? { ...c, tiles: [] } : c))
    return { tiling: { type: 'editor', scale: 1 }, editor, figures: {} } as unknown as PatternConfig
  }

  it('places a Tile into the active Cell of a 4.8.8 Patch, leaving the sibling Cell untouched', () => {
    const state = multiCellState()
    const squareCell = state.editor!.cells.find(c => c.id === 'square')!
    const verts = computeExposedVertices(squareCell)
    expect(verts.length).toBeGreaterThan(0)

    // First vertex with a clean (overlap-free) triangle orientation.
    let chosen: { key: string; rotation: number } | null = null
    for (const v of verts) {
      const clean = vertexPlacementOrientations(v, 3, state.editor!.edgeLength, squareCell)
        .find(o => !o.overlaps)
      if (clean) {
        chosen = { key: v.key, rotation: clean.rotation }
        break
      }
    }
    expect(chosen).not.toBeNull()

    const octBefore = state.editor!.cells.find(c => c.id === 'octagon')!.tiles.length
    const next = reducer(state, {
      type: 'EDITOR_PLACE_TILE_ON_VERTEX',
      payload: { vertexKey: chosen!.key, sides: 3, rotation: chosen!.rotation },
    })

    const sqAfter = next.editor!.cells.find(c => c.id === 'square')!
    const octAfter = next.editor!.cells.find(c => c.id === 'octagon')!
    expect(sqAfter.tiles.length).toBe(1)
    expect(sqAfter.tiles[0].kind).toBe('regular')
    expect(octAfter.tiles.length).toBe(octBefore)
  })
})
