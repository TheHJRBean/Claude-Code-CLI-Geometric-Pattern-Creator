import { describe, it, expect } from 'vitest'
import { createDefault488EditorConfig } from './createDefault'
import { computeBoundarySections } from './boundaryInward'
import { computeExposedEdges } from './exposedEdges'
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

  it('routes the placement to hostCellId even after another Cell was edited', () => {
    // Regression (thermonuclear round 2, 2026-07-08): the section flow used to
    // resolve its target Cell from `activeCellId` at commit time, so a per-Cell
    // control edit while the picker was open repointed the placement into the
    // wrong Cell. The action now carries the picked section's hostCellId.
    const editor = createDefault488EditorConfig()
    const state = { tiling: { type: 'editor', scale: 1 }, editor, figures: {} } as unknown as PatternConfig
    // A per-Cell control edit re-aims activeCellId at the octagon…
    const edited = reducer(state, { type: 'SET_CELL_SEED_SIDES', payload: { sides: 8, cellId: 'octagon' } })
    expect(edited.editor!.activeCellId).toBe('octagon')
    // …but a pending section pick on the square must still land in the square.
    const squareCell = edited.editor!.cells.find(c => c.id === 'square')!
    const section = computeBoundarySections(squareCell)[0]
    const next = reducer(edited, {
      type: 'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION',
      payload: {
        edgeIndex: section.edgeIndex,
        sectionIndex: section.sectionIndex,
        sides: 3,
        force: true,
        hostCellId: 'square',
      },
    })
    const placedIn = (id: string) =>
      next.editor!.cells.find(c => c.id === id)!.tiles.filter(t => t.source === 'placed')
    expect(placedIn('square').length).toBeGreaterThan(0)
    expect(placedIn('octagon').length).toBe(0)
  })

  it('routes edge placement to hostCellId the same way', () => {
    const editor = createDefault488EditorConfig()
    const state = { tiling: { type: 'editor', scale: 1 }, editor, figures: {} } as unknown as PatternConfig
    const edited = reducer(state, { type: 'SET_CELL_SEED_SIDES', payload: { sides: 8, cellId: 'octagon' } })
    const squareCell = edited.editor!.cells.find(c => c.id === 'square')!
    const edge = computeExposedEdges(squareCell, edited.editor!.edgeLength)[0]
    expect(edge).toBeDefined()
    const next = reducer(edited, {
      type: 'EDITOR_PLACE_TILE_ON_EDGE',
      payload: {
        tileId: edge.tileId,
        edgeIndex: edge.edgeIndex,
        sides: 3,
        force: true,
        hostCellId: 'square',
      },
    })
    const placedIn = (id: string) =>
      next.editor!.cells.find(c => c.id === id)!.tiles.filter(t => t.source === 'placed')
    expect(placedIn('square').length).toBeGreaterThan(0)
    expect(placedIn('octagon').length).toBe(0)
  })
})
