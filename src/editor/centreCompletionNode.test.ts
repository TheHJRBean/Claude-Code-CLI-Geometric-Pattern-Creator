import { describe, it, expect } from 'vitest'
import { createDefaultEditorConfig } from './createDefault'
import { cellLocalSelectableVertices, isPatchSelectableVertex } from './patchSelectable'
import type { EditorPatch } from '../types/editor'

/**
 * When the Seed Tile is removed (`noSeed`), the Cell centre becomes a
 * completion node — a selectable Complete-mode pick target — so the user can
 * build wedge Tiles radially from the middle out to the Boundary corners
 * (2026-07-08). This locks the reducer-side selectability that the Canvas
 * `centre` overlay renders against.
 */
describe('no-Seed Cell centre completion node', () => {
  const CENTRE = { x: 0, y: 0 }
  const has = (verts: { x: number; y: number }[], p: { x: number; y: number }) =>
    verts.some(v => Math.abs(v.x - p.x) < 1e-6 && Math.abs(v.y - p.y) < 1e-6)

  it('exposes the Cell-local centre only when noSeed is on', () => {
    const seeded = createDefaultEditorConfig().cells[0]
    expect(has(cellLocalSelectableVertices(seeded), CENTRE)).toBe(false)

    const empty = { ...seeded, noSeed: true, tiles: [] }
    expect(has(cellLocalSelectableVertices(empty), CENTRE)).toBe(true)
  })

  it('accepts the Patch-world centre as a selectable vertex for a noSeed Cell', () => {
    const base = createDefaultEditorConfig()
    // Single cell at the Patch origin — Cell-local centre maps to Patch (0, 0).
    const patch: EditorPatch = {
      ...base,
      cells: [{ ...base.cells[0], noSeed: true, tiles: [] }],
    }
    expect(isPatchSelectableVertex(patch, CENTRE, false)).toBe(true)

    const seededPatch: EditorPatch = base
    expect(isPatchSelectableVertex(seededPatch, CENTRE, false)).toBe(false)
  })
})
