import { describe, it, expect } from 'vitest'
import { createDefaultEditorConfig } from './createDefault'
import { computeExposedVertices, vertexPlacementOrientations } from './vertexPlacement'
import { vertexOrientationsWithOrbit } from './orbit'
import { reducer } from '../state/reducer'
import type { PatternConfig } from '../types/pattern'
import type { SymmetryMode } from '../types/editor'

/**
 * Regression for the vertex-placement silent no-op under symmetry.
 *
 * The picker classifies a size/orientation as "clean" (commit directly,
 * force=false) vs "overlap" (⚠ badge → force-confirm modal). Before the fix
 * that classification used single-tile viability only, but under a symmetry
 * mode the reducer places the whole orbit all-or-nothing — so a single-tile-
 * clean orientation whose orbit sibling collided made `placeTilesOnVertexOrbit`
 * return null and the Place silently did nothing. The picker now uses the
 * orbit-aware `vertexOrientationsWithOrbit`, so anything it reports clean
 * actually commits.
 */
const MODES: SymmetryMode[] = ['none', 'rotation', 'vertical', 'horizontal', 'full']

function freshState(mode: SymmetryMode): PatternConfig {
  const state = {
    tiling: { type: 'editor', scale: 1 },
    editor: createDefaultEditorConfig(),
    figures: {},
  } as unknown as PatternConfig
  state.editor!.cells[0].symmetryMode = mode
  return state
}

describe('vertex placement — orbit-aware picker classification', () => {
  it('single-tile clean path still places (mode=none)', () => {
    const state = freshState('none')
    const cell = state.editor!.cells[0]
    const v = computeExposedVertices(cell)[0]
    const clean = vertexPlacementOrientations(v, 3, state.editor!.edgeLength, cell)
      .find(o => !o.overlaps)!
    const next = reducer(state, {
      type: 'EDITOR_PLACE_TILE_ON_VERTEX',
      payload: { vertexKey: v.key, sides: 3, rotation: clean.rotation },
    })
    expect(next.editor!.cells[0].tiles.length).toBe(cell.tiles.length + 1)
  })

  it.each(MODES)('orbit-aware "clean" orientations never silently no-op (mode=%s)', (mode) => {
    const probe = createDefaultEditorConfig()
    probe.cells[0].symmetryMode = mode
    const cell = probe.cells[0]
    const verts = computeExposedVertices(cell)

    let total = 0
    for (const v of verts) {
      for (const sides of [3, 4, 6, 8, 12]) {
        const clean = vertexOrientationsWithOrbit(v, sides, probe.edgeLength, cell)
          .find(o => !o.overlaps)
        if (!clean) continue
        total++
        const state = freshState(mode)
        const before = state.editor!.cells[0].tiles.length
        const next = reducer(state, {
          type: 'EDITOR_PLACE_TILE_ON_VERTEX',
          payload: { vertexKey: v.key, sides, rotation: clean.rotation },
        })
        expect(next.editor!.cells[0].tiles.length).toBeGreaterThan(before)
      }
    }
    expect(total).toBeGreaterThan(0)
  })

  it('orbit-colliding sizes that the old picker mislabelled clean still place via force', () => {
    // Under full symmetry, find a size the SINGLE-TILE classifier calls clean
    // but the orbit-aware one flags as overlap — the force path must place it.
    const probe = createDefaultEditorConfig()
    probe.cells[0].symmetryMode = 'full'
    const cell = probe.cells[0]
    let placedViaForce = 0
    for (const v of computeExposedVertices(cell)) {
      for (const sides of [3, 4, 6, 8, 12]) {
        const single = vertexPlacementOrientations(v, sides, probe.edgeLength, cell).find(o => !o.overlaps)
        const orbit = vertexOrientationsWithOrbit(v, sides, probe.edgeLength, cell).find(o => !o.overlaps)
        if (!single || orbit) continue // only the reclassified cases
        const state = freshState('full')
        const before = state.editor!.cells[0].tiles.length
        const next = reducer(state, {
          type: 'EDITOR_PLACE_TILE_ON_VERTEX',
          payload: { vertexKey: v.key, sides, rotation: single.rotation, force: true },
        })
        if (next.editor!.cells[0].tiles.length > before) placedViaForce++
      }
    }
    expect(placedViaForce).toBeGreaterThan(0)
  })
})
