import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { createDefault488EditorConfig, createDefaultEditorConfig } from '../editor/createDefault'
import { BOUNDARY_ROTATION } from '../editor/buildEditorPolygons'
import { cellPlacementEdgeLength } from '../editor/active'
import type { PatternConfig } from '../types/pattern'
import type { EditorRegularTile } from '../types/editor'

/**
 * Regression (thermonuclear round 2, 2026-07-08):
 *
 * 1. SET_CELL_NO_SEED off re-seeded at `patch.edgeLength` (the lattice
 *    constant in a multi-cell Patch, which the boundary-size slider grows
 *    away from the Tiles) with rotation 0 — missing both the
 *    b3a4c09/a171058 sizing convention and the boundary-matching rotation
 *    multi-cell Seeds are constructed with.
 * 2. `cellPlacementEdgeLength` fell back to the same lattice constant for an
 *    empty No-Seed Cell, reintroducing the oversize bug for that one flow.
 *    It now reads the Patch's true Tile scale off the sibling Cells.
 */

function asState(editor: ReturnType<typeof createDefault488EditorConfig>): PatternConfig {
  return { tiling: { type: 'editor', scale: 1 }, editor, figures: {} } as unknown as PatternConfig
}

function seedOf(state: PatternConfig, cellId: string): EditorRegularTile {
  const tile = state.editor!.cells.find(c => c.id === cellId)!.tiles
    .find(t => t.source === 'seed')
  expect(tile).toBeDefined()
  return tile as EditorRegularTile
}

describe('SET_CELL_NO_SEED off — restored Seed convention', () => {
  it('multi-cell: restores a boundary-matching Seed at the Tile scale after lattice drift', () => {
    let state = asState(createDefault488EditorConfig())
    const originalSeed = seedOf(state, 'square')
    // Remove the square Cell's Seed, then drag the boundary-size slider:
    // lattice 100 → 200 while the octagon's Tiles stay at 100.
    state = reducer(state, { type: 'SET_CELL_NO_SEED', payload: { value: true, cellId: 'square' } })
    state = reducer(state, { type: 'SET_CELL_BOUNDARY_SIZE', payload: 200 })
    expect(state.editor!.edgeLength).toBe(200)
    // Toggling the Seed back on must restore the original convention, not
    // a rotation-0 Seed at the drifted lattice constant.
    state = reducer(state, { type: 'SET_CELL_NO_SEED', payload: { value: false, cellId: 'square' } })
    const restored = seedOf(state, 'square')
    expect(restored.edgeLength).toBe(originalSeed.edgeLength) // 100, the sibling Tile scale
    expect(restored.rotation).toBeCloseTo(BOUNDARY_ROTATION.square, 10)
  })

  it('single-cell: keeps the original patch.edgeLength + rotation-0 convention', () => {
    let state = asState(createDefaultEditorConfig())
    const originalSeed = seedOf(state, 'main')
    state = reducer(state, { type: 'SET_CELL_NO_SEED', payload: { value: true } })
    state = reducer(state, { type: 'SET_CELL_NO_SEED', payload: { value: false } })
    const restored = seedOf(state, 'main')
    expect(restored.edgeLength).toBe(originalSeed.edgeLength)
    expect(restored.rotation).toBe(0)
  })
})

describe('updateCell — stale cellId fails closed', () => {
  it('ignores a mutation targeting a Cell id that no longer exists', () => {
    const state = asState(createDefault488EditorConfig())
    const next = reducer(state, { type: 'SET_CELL_SEED_SIDES', payload: { sides: 3, cellId: 'no-such-cell' } })
    // Must NOT fall back to mutating the active Cell. (applyWrap/seedFigures
    // wrappers may rewrap the object, so compare structurally.)
    expect(next.editor).toEqual(state.editor)
  })
})

describe('cellPlacementEdgeLength — empty No-Seed Cell fallback', () => {
  it('reads the sibling Cells\' Tile scale, not the lattice constant', () => {
    const editor = createDefault488EditorConfig()
    const square = editor.cells.find(c => c.id === 'square')!
    const emptySquare = { ...square, noSeed: true, tiles: [] }
    // Simulate the dragged slider: lattice 200, sibling Tiles still 100.
    expect(cellPlacementEdgeLength(emptySquare, 200, editor.cells.map(c =>
      c.id === 'square' ? emptySquare : c,
    ))).toBe(100)
  })

  it('falls back to patch.edgeLength when no Cell holds a regular Tile', () => {
    const editor = createDefaultEditorConfig()
    const empty = { ...editor.cells[0], noSeed: true, tiles: [] }
    expect(cellPlacementEdgeLength(empty, 100, [empty])).toBe(100)
  })
})
