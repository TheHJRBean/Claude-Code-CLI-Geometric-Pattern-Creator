import { describe, it, expect } from 'vitest'
import { patchLatticeStamps, patchNeighbourStamps } from './patchLattice'
import { createDefaultEditorConfig, createDefault488EditorConfig } from './createDefault'
import { computeExposedVertices } from './vertexPlacement'
import { editorBoundaryVertices } from './buildEditorPolygons'
import { migrateEditorConfig } from './migrations'
import { nRingFrameSupported } from './frameNRing'
import { neighbourStampsNear } from './patchSelectable'
import { periodicFastPathEligible } from '../hooks/usePattern'
import { reducer } from '../state/reducer'
import { DEFAULT_CONFIG } from '../state/defaults'
import { DESIGN_MODE_ACTIONS } from './history'
import type { EditorConfig } from '../types/editor'
import type { PatternConfig } from '../types/pattern'

/**
 * **Freeform** — the Patch stops being a repeat unit (`EditorPatch.freeform`).
 *
 * Two claims are worth pinning, because both are the kind that fail silently:
 *
 * 1. *Nothing repeats.* Every consumer must agree, so they all ask
 *    `patchLattice.ts`. A site that kept its own single-cell/multi-cell
 *    dispatch would go on stamping the Lattice the user switched off, and the
 *    only symptom is a canvas that looks unchanged.
 * 2. *The Boundary is not an authoring surface.* Withdrawing the pick targets
 *    is only half of it: a Tile corner sitting on the (now invisible) outline
 *    must also stop having its placement wedge clipped inward, or the picker
 *    refuses placements for a reason nothing on screen explains.
 */

const VIEWPORT = { x: -1000, y: -1000, width: 2000, height: 2000 }

const withPatch = (editor: EditorConfig): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor,
})

describe('Freeform — the Lattice is switched off', () => {
  it('single-cell: the whole visible lattice collapses to the one Patch', () => {
    const tiled = createDefaultEditorConfig({ shape: 'square' })
    expect(patchLatticeStamps(tiled, VIEWPORT).length).toBeGreaterThan(4)

    const free = { ...tiled, freeform: true }
    expect(patchLatticeStamps(free, VIEWPORT)).toEqual([
      { translation: { x: 0, y: 0 }, rotation: 0 },
    ])
  })

  it('multi-cell Configurations collapse the same way', () => {
    const tiled = createDefault488EditorConfig()
    expect(patchLatticeStamps(tiled, VIEWPORT).length).toBeGreaterThan(4)
    expect(patchLatticeStamps({ ...tiled, freeform: true }, VIEWPORT)).toHaveLength(1)
  })

  it('leaves no neighbours to ghost, pick or stamp Guides onto', () => {
    const tiled = createDefaultEditorConfig({ shape: 'hexagon' })
    expect(patchNeighbourStamps(tiled, VIEWPORT).length).toBeGreaterThan(0)
    expect(patchNeighbourStamps({ ...tiled, freeform: true }, VIEWPORT)).toEqual([])
  })

  it('withdraws the neighbour stamps the reducer validates picks against', () => {
    // `patchSelectable` is the seam the Complete reducer shares with the canvas
    // overlay; if it kept stamping, a neighbour vertex would stay clickable
    // with no ghost drawn under it.
    const tiled = createDefaultEditorConfig({ shape: 'square' })
    const pts = [{ x: 0, y: 0 }]
    expect(neighbourStampsNear(tiled, pts).length).toBeGreaterThan(0)
    expect(neighbourStampsNear({ ...tiled, freeform: true }, pts)).toEqual([])
  })

  it('declines the periodic fast path', () => {
    // The <use>-tiled fragment is a statement about a lattice. Under Freeform
    // `decorationReps` measures its extraction off the nearest neighbouring
    // stamp — infinitely far away — and every Void fill resolves to nothing.
    const tiled = withPatch(createDefaultEditorConfig({ shape: 'square' }))
    const stamps = patchLatticeStamps(tiled.editor!, VIEWPORT)
    expect(periodicFastPathEligible(tiled, false, false, stamps)).toBe(true)

    const free = withPatch({ ...createDefaultEditorConfig({ shape: 'square' }), freeform: true })
    expect(periodicFastPathEligible(free, false, false, stamps)).toBe(false)
  })

  it('withholds the n-Ring Frame, which is defined in shells of neighbours', () => {
    const tiled = createDefaultEditorConfig({ shape: 'square' })
    expect(nRingFrameSupported(tiled)).toBe(true)
    expect(nRingFrameSupported({ ...tiled, freeform: true })).toBe(false)
  })
})

describe('Freeform — the Boundary stops bounding', () => {
  it('drops the Boundary corners from the placement picker', () => {
    const cell = createDefaultEditorConfig({ shape: 'square' }).cells[0]
    const tiled = computeExposedVertices(cell)
    expect(tiled.some(v => v.boundaryCornerIndex !== undefined)).toBe(true)

    const free = computeExposedVertices(cell, { ignoreBoundary: true })
    expect(free.some(v => v.boundaryCornerIndex !== undefined)).toBe(false)
    // Every Tile corner survives — only the Boundary's own corners go.
    expect(free.length).toBe(tiled.filter(v => v.incidentTiles.length > 0).length)
  })

  it('stops clipping a corner that sits on the outline to the inward wedge', () => {
    // A Tile corner ON the Boundary outline. Tiled, its open turn is clipped to
    // the Boundary's interior wedge; under Freeform the only thing subtracted is
    // the Tile's own wedge — which is what makes "build outward as far as you
    // like" true at the very corners the user builds outward from.
    const base = createDefaultEditorConfig({ shape: 'square' })
    const corner = editorBoundaryVertices(base.cells[0])[0]
    // A small triangle hanging off that corner, pointing back at the Cell
    // centre. Wound CCW (the irregular-Tile contract).
    const inward = Math.atan2(-corner.y, -corner.x)
    const at = (angle: number, r: number) => ({
      x: corner.x + r * Math.cos(angle),
      y: corner.y + r * Math.sin(angle),
    })
    const tri = [corner, at(inward - 0.3, 40), at(inward + 0.3, 40)]
    const cross = (tri[1].x - tri[0].x) * (tri[2].y - tri[0].y)
      - (tri[1].y - tri[0].y) * (tri[2].x - tri[0].x)
    const cell = {
      ...base.cells[0],
      tiles: [{
        id: 'probe',
        kind: 'irregular' as const,
        source: 'completed' as const,
        vertices: cross > 0 ? tri : [tri[0], tri[2], tri[1]],
      }],
    }
    const sweepAt = (vs: ReturnType<typeof computeExposedVertices>) => {
      const v = vs.find(u => Math.hypot(u.p.x - corner.x, u.p.y - corner.y) < 1e-6)
      return v ? v.openSectors.reduce((sum, sec) => sum + sec.sweep, 0) : null
    }
    const own = 0.6 // the triangle's own interior angle at that corner
    // Tiled: the square Boundary's interior right angle, less the Tile's wedge.
    expect(sweepAt(computeExposedVertices(cell))!).toBeCloseTo(Math.PI / 2 - own, 6)
    // Freeform: the whole turn, less the Tile's wedge.
    expect(sweepAt(computeExposedVertices(cell, { ignoreBoundary: true }))!)
      .toBeCloseTo(2 * Math.PI - own, 6)
  })
})

describe('Freeform — the flag itself', () => {
  it('sets and clears without rewriting any geometry', () => {
    const before = withPatch(createDefaultEditorConfig({ shape: 'hexagon' }))
    const on = reducer(before, { type: 'SET_EDITOR_FREEFORM', payload: true })
    expect(on.editor!.freeform).toBe(true)
    expect(on.editor!.cells).toEqual(before.editor!.cells)

    const off = reducer(on, { type: 'SET_EDITOR_FREEFORM', payload: false })
    // Absent, not `false` — the additive-field contract, so a Patch that never
    // used Freeform round-trips byte-identically.
    expect('freeform' in off.editor!).toBe(false)
    expect(off.editor!.cells).toEqual(before.editor!.cells)
  })

  it('is undoable — it withdraws pick targets, so it must be reversible', () => {
    expect(DESIGN_MODE_ACTIONS.has('SET_EDITOR_FREEFORM')).toBe(true)
  })

  it('suspends Wrap boundary instead of clearing it', () => {
    // Wrap fits the Boundary to the Tiles; under Freeform there is no Boundary
    // to fit. Keeping the per-Cell flag means turning Freeform off resumes
    // wrapping with the user's setting intact.
    const wrapped = createDefaultEditorConfig({ shape: 'square' })
    wrapped.cells[0].wrapBoundary = true
    const state = reducer(withPatch(wrapped), { type: 'SET_EDITOR_FREEFORM', payload: true })
    expect(state.editor!.cells[0].wrapBoundary).toBe(true)

    const size = state.editor!.cells[0].boundarySize
    const grown = reducer(state, { type: 'SET_CELL_SEED_SIDES', payload: { sides: 8 } })
    expect(grown.editor!.cells[0].boundarySize).toBe(size)
  })

  it('survives a save / load round trip', () => {
    const saved = JSON.parse(JSON.stringify({
      ...createDefaultEditorConfig({ shape: 'square' }),
      freeform: true,
    }))
    expect(migrateEditorConfig(saved)?.freeform).toBe(true)
    // Absent stays absent rather than becoming `false`.
    const plain = JSON.parse(JSON.stringify(createDefaultEditorConfig({ shape: 'square' })))
    expect('freeform' in (migrateEditorConfig(plain) ?? {})).toBe(false)
  })
})
