import { describe, it, expect } from 'vitest'
import { createDefaultEditorConfig } from './createDefault'
import { activeCell } from './active'
import { computeExposedEdges } from './exposedEdges'
import { isPlacementViable, viableSidesForEdge, PICKER_SIDES } from './placement'
import { computeBoundarySections, viableSidesForBoundarySection } from './boundaryInward'
import { computeExposedVertices, viableSidesForVertex } from './vertexPlacement'
import { placedTileOverlaps } from './tileOverlap'
import { regularPolygonVertices } from './regularPolygon'
import type { EditorRegularTile } from '../types/editor'

// Characterization of the three placement validators (thermo-nuclear review
// Chunk 8). They share a triplicated body-overlap probe (extracted to
// tileOverlap.placedTileOverlaps); these viable-size-set fingerprints, captured
// on the default single-cell square Patch, guard that the extraction is
// behaviour-preserving. Captured on `main` @ 3c28352.

const patch = () => createDefaultEditorConfig()

describe('placement validators — viable-size fingerprints (default square cell)', () => {
  it('edge placement: viable sizes on the first exposed edge are stable', () => {
    const cell = activeCell(patch())
    const edges = computeExposedEdges(cell, 100)
    expect(edges.length).toBeGreaterThan(0)
    expect(viableSidesForEdge(edges[0], cell, edges[0].length)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 12])
  })

  it('boundary-section placement: viable sizes on the first section are stable', () => {
    const cell = activeCell(patch())
    const sections = computeBoundarySections(cell)
    expect(sections.length).toBeGreaterThan(0)
    expect(viableSidesForBoundarySection(sections[0], cell, cell.boundarySize)).toEqual([3])
  })

  it('vertex placement: viable sizes on the first exposed vertex are stable', () => {
    const cell = activeCell(patch())
    const verts = computeExposedVertices(cell)
    expect(verts.length).toBeGreaterThan(0)
    // Captured fingerprint — the corner's open sector admits these sizes.
    expect(viableSidesForVertex(verts[0], 100, cell, PICKER_SIDES)).toEqual([3, 4, 5, 6, 7, 8])
  })

  it('all three validators reject sides < 3', () => {
    const cell = activeCell(patch())
    const edge = computeExposedEdges(cell, 100)[0]
    const section = computeBoundarySections(cell)[0]
    expect(isPlacementViable(edge, 2, cell, edge.length)).toBe(false)
    expect(isPlacementViable(edge, 0, cell, edge.length)).toBe(false)
    // boundary-section / vertex validators share the same sides<3 guard
    expect(viableSidesForBoundarySection(section, cell, cell.boundarySize).every(n => n >= 3)).toBe(true)
  })
})

describe('placedTileOverlaps — the extracted shared body-overlap probe', () => {
  const square = (cx: number, cy: number): EditorRegularTile =>
    ({ id: `t-${cx}-${cy}`, kind: 'regular', sides: 4, center: { x: cx, y: cy }, edgeLength: 10, rotation: 0, source: 'placed' })
  const vertsOf = (t: EditorRegularTile) => regularPolygonVertices(t.sides, t.center, t.edgeLength, t.rotation)

  it('reports a strong overlap (candidate centre inside an existing tile)', () => {
    const existing = square(0, 0)
    const candidate = square(2, 0) // heavily overlapping
    expect(placedTileOverlaps(vertsOf(candidate), candidate.center, [existing])).toBe(true)
  })

  it('reports no overlap for a clearly-disjoint candidate', () => {
    const existing = square(0, 0)
    const candidate = square(100, 0)
    expect(placedTileOverlaps(vertsOf(candidate), candidate.center, [existing])).toBe(false)
  })

  it('treats an empty tile list as no overlap', () => {
    const candidate = square(0, 0)
    expect(placedTileOverlaps(vertsOf(candidate), candidate.center, [])).toBe(false)
  })
})
