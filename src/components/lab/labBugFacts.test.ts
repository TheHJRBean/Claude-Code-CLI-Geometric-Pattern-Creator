import { describe, it, expect } from 'vitest'
import { PHASE_LABELS, describeLabOverlays, describeLabSelection } from './labBugFacts'

describe('PHASE_LABELS', () => {
  it("maps the legacy 'strand' key to the Composition Phase the UI names", () => {
    // A report saying "strand phase" would send a triage session looking for
    // a Phase that does not exist in CONTEXT.md's vocabulary.
    expect(PHASE_LABELS.strand).toBe('Composition')
    expect(PHASE_LABELS.design).toBe('Design')
    expect(PHASE_LABELS.decoration).toBe('Decoration')
  })
})

describe('describeLabSelection', () => {
  it('names the host Cell of an edge selection', () => {
    expect(describeLabSelection({ tileId: 't3', edgeIndex: 2, hostCellId: 'square' }, null))
      .toBe('edge 2 of tile t3 in square')
  })

  it('omits the host when the pick predates the field', () => {
    expect(describeLabSelection({ tileId: 't3', edgeIndex: 2 }, null)).toBe('edge 2 of tile t3')
  })

  it('describes a boundary-section selection', () => {
    expect(describeLabSelection(null, { edgeIndex: 1, sectionIndex: 0, hostCellId: 'octagon' }))
      .toBe('boundary section 0 on edge 1 in octagon')
  })

  it('prefers the edge when both are somehow set', () => {
    expect(describeLabSelection({ tileId: 't1', edgeIndex: 0 }, { edgeIndex: 9, sectionIndex: 9 }))
      .toBe('edge 0 of tile t1')
  })

  it('reports none rather than an empty string', () => {
    expect(describeLabSelection(null, null)).toBe('none')
  })
})

describe('describeLabOverlays', () => {
  const allOff = {
    showStrands: false, showTiles: false, showGuides: false, showBoundaryLattice: false,
    showNeighbours: false, showNeighbourBoundaries: false, showNeighbourStrands: false,
  }

  it('lists only what is on', () => {
    expect(describeLabOverlays({ ...allOff, showStrands: true, showGuides: true }))
      .toBe('strands, guides')
  })

  it('says so when everything is off — itself the answer to most "nothing renders" reports', () => {
    expect(describeLabOverlays(allOff)).toBe('none on')
  })
})
