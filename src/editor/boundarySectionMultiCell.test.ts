import { describe, it, expect } from 'vitest'
import { createDefault488EditorConfig } from './createDefault'
import { computeBoundarySections } from './boundaryInward'
import { reducer } from '../state/reducer'
import type { PatternConfig } from '../types/pattern'

/**
 * Multi-cell boundary-section sizing (2026-06-18).
 *
 * Same bug as multi-cell vertex placement: in a multi-cell Patch the
 * boundary-size slider repurposes `patch.edgeLength` as the lattice constant
 * while Tiles stay fixed, so boundary-section placement sized to
 * `patch.edgeLength` came out lattice-sized (too large). The reducer now sizes
 * to the Cell's own Tiles via `cellPlacementEdgeLength`. This keeps vertex /
 * edge / section at one uniform size (the 2026-05-31 decision) even after the
 * lattice grows.
 */
describe('boundary-section placement — multi-cell sizing', () => {
  it('sizes the placed Tile to the Cell Seed, not the (enlarged) lattice edgeLength', () => {
    const editor = createDefault488EditorConfig()
    const seedEdgeLength = (editor.cells.find(c => c.id === 'square')!.tiles[0] as { edgeLength: number })
      .edgeLength // 100
    // Simulate a dragged boundary-size slider: lattice = 200, Seed Tiles = 100.
    editor.edgeLength = seedEdgeLength * 2
    editor.activeCellId = 'square'
    editor.cells = editor.cells.map(c =>
      c.id === 'square' ? { ...c, boundarySize: seedEdgeLength * 2 } : c,
    )
    const state = { tiling: { type: 'editor', scale: 1 }, editor, figures: {} } as unknown as PatternConfig

    const squareCell = state.editor!.cells.find(c => c.id === 'square')!
    const section = computeBoundarySections(squareCell)[0]
    expect(section).toBeDefined()

    // Force-place to isolate the sizing concern from the overlap gate.
    const next = reducer(state, {
      type: 'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION',
      payload: { edgeIndex: section.edgeIndex, sectionIndex: section.sectionIndex, sides: 3, force: true },
    })
    const placed = next.editor!.cells.find(c => c.id === 'square')!.tiles
      .find(t => t.source === 'placed')
    expect(placed).toBeDefined()
    expect((placed as { edgeLength: number }).edgeLength).toBe(seedEdgeLength)
  })
})
