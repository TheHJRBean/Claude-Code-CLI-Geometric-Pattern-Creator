import { describe, it, expect } from 'vitest'
import { promoteGuideTiles } from './promoteGuideTiles'
import { createDefaultEditorConfig, createDefault31212EditorConfig } from './createDefault'
import { applyCellTransform, cellContainingPoint } from './patchSelectable'
import { compositionToPolygons, patchRotation } from './compositionLattice'
import { tileVertices } from './exposedEdges'
import { tileTypeIdFor } from './tileTypeId'
import { reducer } from '../state/reducer'
import { DEFAULT_CONFIG } from '../state/defaults'
import type { EditorConfig, EditorPatch, EditorTile } from '../types/editor'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * Promotion of world-space Guide Tiles into Cell Tiles.
 *
 * The property that matters is that promotion is **invisible on the canvas**:
 * the Tile must not move. Everything the user complained about (it now repeats
 * under the Lattice) follows from being a Cell Tile at all, but a promotion
 * that also shifted the Tile would be a worse bug than the one it fixes.
 */

/** World-space vertices of a Tile owned by `cell` (or of a world-space Tile
 *  when `cell` is null). */
function worldVertices(tile: EditorTile, patch: EditorPatch, cellId: string | null): Vec2[] {
  const local = tileVertices(tile)
  if (cellId === null) return local
  const cell = patch.cells.find(c => c.id === cellId)!
  const patchRot = patchRotation(patch)
  return local.map(v => applyCellTransform(v, cell, patchRot))
}

function closeTo(a: Vec2[], b: Vec2[], tol = 1e-9): void {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) {
    expect(Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)).toBeLessThan(tol)
  }
}

describe('promoteGuideTiles', () => {
  it('is a no-op when there are no world-space Tiles', () => {
    const patch = createDefaultEditorConfig()
    expect(promoteGuideTiles(patch, 0)).toBe(patch)
  })

  it('moves a world-space Tile into the Cell that contains it, unmoved', () => {
    const base = createDefault31212EditorConfig()
    const patchRot = patchRotation(base)
    // A triangle sitting near the dodecagon Cell's centre — squarely inside
    // one Cell's Boundary, so containment (not the fallback) resolves it.
    const guideTile: EditorTile = {
      id: 'guide-0',
      kind: 'irregular',
      vertices: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 34 }],
      source: 'completed',
    }
    const patch: EditorPatch = { ...base, guideTiles: [guideTile] }
    const before = worldVertices(guideTile, patch, null)

    const out = promoteGuideTiles(patch, patchRot)

    expect(out.guideTiles).toBeUndefined()
    const host = out.cells.find(c => c.tiles.some(t => t.id.startsWith('promoted-')))
    expect(host).toBeDefined()
    // Hosted by the Cell whose Boundary actually contains it.
    expect(host!.id).toBe(cellContainingPoint(base, { x: 20, y: 11.333 }, patchRot)!.id)
    const promoted = host!.tiles.find(t => t.id.startsWith('promoted-'))!
    closeTo(worldVertices(promoted, out, host!.id), before)
  })

  it('keeps a regular Tile regular and preserves its world pose', () => {
    const base = createDefault31212EditorConfig()
    const patchRot = patchRotation(base)
    const guideTile: EditorTile = {
      id: 'guide-0',
      kind: 'regular',
      sides: 4,
      center: { x: 30, y: -20 },
      edgeLength: 40,
      rotation: 0.7,
      source: 'placed',
    }
    const patch: EditorPatch = { ...base, guideTiles: [guideTile] }
    const before = worldVertices(guideTile, patch, null)

    const out = promoteGuideTiles(patch, patchRot)
    const host = out.cells.find(c => c.tiles.some(t => t.id.startsWith('promoted-')))!
    const promoted = host.tiles.find(t => t.id.startsWith('promoted-'))!

    expect(promoted.kind).toBe('regular')
    if (promoted.kind === 'regular') expect(promoted.edgeLength).toBeCloseTo(40, 9)
    closeTo(worldVertices(promoted, out, host.id), before)
  })

  it('routes each Tile to its own Cell and re-mints ids uniquely', () => {
    const base = createDefault31212EditorConfig()
    const patchRot = patchRotation(base)
    // One per Cell centre — each must land in a different Cell.
    const guideTiles: EditorTile[] = base.cells.map((cell, i) => {
      const c = applyCellTransform({ x: 0, y: 0 }, cell, patchRot)
      return {
        // Same source id on every Tile: promotion must not rely on them.
        id: 'guide-0',
        kind: 'regular' as const,
        sides: 3,
        center: c,
        edgeLength: 20,
        rotation: 0.1 * i,
        source: 'completed' as const,
      }
    })
    const patch: EditorPatch = { ...base, guideTiles }

    const out = promoteGuideTiles(patch, patchRot)
    const promoted = out.cells.flatMap(c => c.tiles.filter(t => t.id.startsWith('promoted-')))
    expect(promoted).toHaveLength(base.cells.length)
    expect(new Set(promoted.map(t => t.id)).size).toBe(base.cells.length)
    // Exactly one per Cell.
    for (const cell of out.cells) {
      expect(cell.tiles.filter(t => t.id.startsWith('promoted-'))).toHaveLength(1)
    }
  })

  it('places a Tile outside every Boundary via the nearest-Cell fallback, unmoved', () => {
    const base = createDefault31212EditorConfig()
    const patchRot = patchRotation(base)
    // Far outside every Cell-Boundary — the reporter's save had several of
    // these, completed against Guide circles beyond the Patch.
    const guideTile: EditorTile = {
      id: 'guide-0',
      kind: 'irregular',
      vertices: [
        { x: -445, y: -445 },
        { x: -240, y: -240 },
        { x: -281, y: -80 },
        { x: -608, y: -163 },
      ],
      source: 'completed',
    }
    const patch: EditorPatch = { ...base, guideTiles: [guideTile] }
    const before = worldVertices(guideTile, patch, null)

    const out = promoteGuideTiles(patch, patchRot)
    const host = out.cells.find(c => c.tiles.some(t => t.id.startsWith('promoted-')))!
    const promoted = host.tiles.find(t => t.id.startsWith('promoted-'))!
    closeTo(worldVertices(promoted, out, host.id), before)
  })
})

describe('EDITOR_PROMOTE_GUIDE_TILES', () => {
  /** The reporter's substrate: a 3.12.12 Patch carrying world-space Tiles
   *  completed against non-stamping Guide circles. */
  function reporterConfig(): PatternConfig {
    const base = createDefault31212EditorConfig()
    const patchRot = patchRotation(base)
    const guideTiles: EditorTile[] = base.cells.slice(0, 2).map((cell, i) => {
      const c = applyCellTransform({ x: 0, y: 0 }, cell, patchRot)
      return {
        id: `guide-${i}`,
        kind: 'irregular' as const,
        vertices: [
          { x: c.x, y: c.y },
          { x: c.x + 30, y: c.y },
          { x: c.x + 30, y: c.y + 30 },
          { x: c.x, y: c.y + 30 },
        ],
        source: 'completed' as const,
      }
    })
    return {
      ...DEFAULT_CONFIG,
      tiling: { ...DEFAULT_CONFIG.tiling, type: 'editor' },
      editor: { ...base, guideTiles } as EditorConfig,
    }
  }

  it('empties the world-space bucket and grows the rendered Patch by the same count', () => {
    const before = reporterConfig()
    const beforePolys = compositionToPolygons(before.editor!).length
    const beforeTiles = before.editor!.cells.reduce((n, c) => n + c.tiles.length, 0)

    const after = reducer(before, { type: 'EDITOR_PROMOTE_GUIDE_TILES' })

    expect(after.editor!.guideTiles).toBeUndefined()
    expect(after.editor!.cells.reduce((n, c) => n + c.tiles.length, 0)).toBe(beforeTiles + 2)
    // The promoted Tiles are now part of the Patch the Lattice stamps, which
    // is the whole point — `compositionToPolygons` is what every stamp copies.
    expect(compositionToPolygons(after.editor!).length).toBe(beforePolys + 2)
  })

  it('seeds a Figure recipe for every promoted Tile type', () => {
    const after = reducer(reporterConfig(), { type: 'EDITOR_PROMOTE_GUIDE_TILES' })
    for (const cell of after.editor!.cells) {
      for (const tile of cell.tiles) {
        expect(after.figures[tileTypeIdFor(tile)]).toBeDefined()
      }
    }
  })

  it('is inert when there is nothing to promote', () => {
    const base = { ...DEFAULT_CONFIG, tiling: { ...DEFAULT_CONFIG.tiling, type: 'editor' as const }, editor: createDefault31212EditorConfig() }
    expect(reducer(base, { type: 'EDITOR_PROMOTE_GUIDE_TILES' })).toBe(base)
  })
})
