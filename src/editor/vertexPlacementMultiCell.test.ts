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
      payload: { vertexKey: chosen!.key, sides: 3, rotation: chosen!.rotation, hostCellId: 'square' },
    })

    const sqAfter = next.editor!.cells.find(c => c.id === 'square')!
    const octAfter = next.editor!.cells.find(c => c.id === 'octagon')!
    expect(sqAfter.tiles.length).toBe(1)
    expect(sqAfter.tiles[0].kind).toBe('regular')
    expect(octAfter.tiles.length).toBe(octBefore)
  })

  it('routes placement by hostCellId, not the (internal) active cell', () => {
    const state = multiCellState()
    // Active cell is the octagon; the click is on a square vertex.
    state.editor!.activeCellId = 'octagon'
    const squareCell = state.editor!.cells.find(c => c.id === 'square')!
    const v = computeExposedVertices(squareCell)[0]
    const clean = vertexPlacementOrientations(v, 3, state.editor!.edgeLength, squareCell)
      .find(o => !o.overlaps)!
    const octBefore = state.editor!.cells.find(c => c.id === 'octagon')!.tiles.length

    const next = reducer(state, {
      type: 'EDITOR_PLACE_TILE_ON_VERTEX',
      payload: { vertexKey: v.key, sides: 3, rotation: clean.rotation, hostCellId: 'square' },
    })
    // Tile landed in the square (the host), NOT the active octagon.
    expect(next.editor!.cells.find(c => c.id === 'square')!.tiles.length).toBe(1)
    expect(next.editor!.cells.find(c => c.id === 'octagon')!.tiles.length).toBe(octBefore)
    // updateCell focuses the host as the internal activeCellId.
    expect(next.editor!.activeCellId).toBe('square')
  })

  it('sizes the placed Tile to the Cell Seed, not the (enlarged) lattice edgeLength', () => {
    // Simulate the real scenario: the boundary-size slider has been dragged, so
    // `patch.edgeLength` is the lattice constant (200) while the Seed Tiles keep
    // their original size (100). Vertex dots only appear in multi-cell once the
    // lattice is enlarged enough to expose the Boundary corners.
    const editor = createDefault488EditorConfig()
    const SEED_EDGE = editor.cells.find(c => c.id === 'square')!.tiles[0]
    expect(SEED_EDGE.kind).toBe('regular')
    const seedEdgeLength = (SEED_EDGE as { edgeLength: number }).edgeLength // 100
    editor.edgeLength = seedEdgeLength * 2 // 200 — lattice grew, Tiles fixed
    editor.activeCellId = 'square'
    editor.cells = editor.cells.map(c =>
      c.id === 'square' ? { ...c, boundarySize: seedEdgeLength * 2 } : c,
    )
    const state = { tiling: { type: 'editor', scale: 1 }, editor, figures: {} } as unknown as PatternConfig

    const squareCell = state.editor!.cells.find(c => c.id === 'square')!
    // With the boundary enlarged, the Seed (edge 100) no longer reaches the
    // Boundary corners — they're now exposed with the full inward wedge.
    const verts = computeExposedVertices(squareCell)
    let chosen: { key: string; rotation: number } | null = null
    for (const v of verts) {
      const clean = vertexPlacementOrientations(v, 3, seedEdgeLength, squareCell)
        .find(o => !o.overlaps)
      if (clean) {
        chosen = { key: v.key, rotation: clean.rotation }
        break
      }
    }
    expect(chosen).not.toBeNull()

    const next = reducer(state, {
      type: 'EDITOR_PLACE_TILE_ON_VERTEX',
      payload: { vertexKey: chosen!.key, sides: 3, rotation: chosen!.rotation, hostCellId: 'square' },
    })
    const placed = next.editor!.cells.find(c => c.id === 'square')!.tiles
      .find(t => t.source === 'placed')
    expect(placed).toBeDefined()
    // The fix: sized to the Seed (100), NOT the lattice edgeLength (200).
    expect((placed as { edgeLength: number }).edgeLength).toBe(seedEdgeLength)
  })
})
