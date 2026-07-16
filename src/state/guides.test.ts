import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig, createDefault488EditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import type { EditorGuideLine, EditorRegularTile, EditorTile } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { DESIGN_MODE_ACTIONS, historyCoalesceKey } from '../editor/history'
import { frameSelectablePoints } from '../editor/patchSelectable'
import { tileVertices } from '../editor/exposedEdges'

const base = (): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor: createDefaultEditorConfig(),
})

const guide = (id = 'g1'): EditorGuideLine => ({
  id,
  kind: 'line',
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  stamp: false,
  extend: 'none',
  manualAnchors: [],
})

describe('Guides — reducer actions (slice 1)', () => {
  it('EDITOR_ADD_GUIDE appends to editor.guides', () => {
    let s = base()
    s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g1') } })
    s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g2') } })
    expect(s.editor!.guides!.map(g => g.id)).toEqual(['g1', 'g2'])
  })

  it('EDITOR_UPDATE_GUIDE patches fields but never id/kind; unknown id fails closed', () => {
    let s = base()
    s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g1') } })
    s = reducer(s, {
      type: 'EDITOR_UPDATE_GUIDE',
      payload: { guideId: 'g1', patch: { stamp: true, extend: 'both', tickSpacing: 42 } },
    })
    const g = s.editor!.guides![0] as EditorGuideLine
    expect(g.stamp).toBe(true)
    expect(g.extend).toBe('both')
    expect(g.tickSpacing).toBe(42)
    expect(g.id).toBe('g1')
    const unchanged = reducer(s, { type: 'EDITOR_UPDATE_GUIDE', payload: { guideId: 'nope', patch: { stamp: false } } })
    expect(unchanged).toBe(s)
  })

  it('EDITOR_DELETE_GUIDE removes by id; the last delete drops the block', () => {
    let s = base()
    s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g1') } })
    s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g2') } })
    s = reducer(s, { type: 'EDITOR_DELETE_GUIDE', payload: { guideId: 'g1' } })
    expect(s.editor!.guides!.map(g => g.id)).toEqual(['g2'])
    s = reducer(s, { type: 'EDITOR_DELETE_GUIDE', payload: { guideId: 'g2' } })
    expect(s.editor!.guides).toBeUndefined()
  })

  it('guide actions no-op without an editor patch', () => {
    const s: PatternConfig = { ...structuredClone(DEFAULT_CONFIG) }
    delete s.editor
    expect(reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide() } })).toBe(s)
    expect(reducer(s, { type: 'EDITOR_UPDATE_GUIDE', payload: { guideId: 'g1', patch: {} } })).toBe(s)
    expect(reducer(s, { type: 'EDITOR_DELETE_GUIDE', payload: { guideId: 'g1' } })).toBe(s)
  })
})

describe('Guides — Complete on Anchors (slice 3)', () => {
  // Three non-stamping Guide lines whose shared endpoints form an equilateral
  // triangle far from the Seed Tile — a free-standing Anchor set that fits a
  // regular 3-gon (so the minted Tile keys as type '3').
  const P0 = { x: 200, y: 200 }
  const P1 = { x: 300, y: 200 }
  const APEX = { x: 250, y: 200 + 50 * Math.sqrt(3) }
  const triangleGuides = (stamp = false): EditorGuideLine[] => [
    { id: 'a', kind: 'line', start: P0, end: P1, stamp, extend: 'none', manualAnchors: [] },
    { id: 'b', kind: 'line', start: P1, end: APEX, stamp, extend: 'none', manualAnchors: [] },
    { id: 'c', kind: 'line', start: APEX, end: P0, stamp, extend: 'none', manualAnchors: [] },
  ]
  const triangle = [P0, P1, APEX]

  const withGuides = (guides: EditorGuideLine[]): PatternConfig => {
    let s = base()
    for (const g of guides) s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: g } })
    return s
  }

  it('free-standing Complete on non-stamping Guide Anchors → world-space guideTiles (not a Cell Tile)', () => {
    const s = withGuides(triangleGuides(false))
    const cellTilesBefore = s.editor!.cells[0].tiles.length
    const out = reducer(s, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks: triangle } })
    expect(out.editor!.guideTiles).toHaveLength(1)
    expect(out.editor!.cells[0].tiles).toHaveLength(cellTilesBefore) // Seed untouched
    // A triangle fits regular, so it minted a regular 3-gon.
    expect(out.editor!.guideTiles![0].kind).toBe('regular')
  })

  it('seeds a Figure recipe for the minted world-space Tile', () => {
    const s = withGuides(triangleGuides(false))
    const out = reducer(s, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks: triangle } })
    // The 3-gon type key '3' now has a figure entry.
    expect(out.figures['3']).toBeDefined()
  })

  it('Complete on stamping Guide Anchors → ordinary Cell Tile (repeats under the Lattice)', () => {
    const s = withGuides(triangleGuides(true))
    const before = s.editor!.cells[0].tiles.length
    const out = reducer(s, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks: triangle } })
    expect(out.editor!.cells[0].tiles.length).toBe(before + 1)
    expect(out.editor!.guideTiles).toBeUndefined()
  })

  it('rejects a polygon built purely from neighbour ghosts (grounding still enforced)', () => {
    // No guides, picks off in space with no real vertex / anchor → no-op.
    const s = base()
    const out = reducer(s, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks: triangle } })
    expect(out).toBe(s)
  })
})

describe('Guides — Place on Anchors (slice 3 / #33)', () => {
  // A single horizontal Guide line clear of the Seed Tile (ticks off so the
  // only self-Anchors are the two endpoints); the start endpoint is the target.
  const START = { x: 250, y: 250 }
  const placeGuide = (stamp = false): EditorGuideLine => ({
    id: 'p1', kind: 'line', start: START, end: { x: 350, y: 250 },
    stamp, extend: 'none', ticksEnabled: false, manualAnchors: [],
  })
  const withGuide = (g: EditorGuideLine): PatternConfig =>
    reducer(base(), { type: 'EDITOR_ADD_GUIDE', payload: { guide: g } })

  it('non-stamping Anchor → world-space guideTile (Cell untouched)', () => {
    const s = withGuide(placeGuide(false))
    const before = s.editor!.cells[0].tiles.length
    const out = reducer(s, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: START, sides: 4, rotation: 0 } })
    expect(out.editor!.guideTiles).toHaveLength(1)
    expect(out.editor!.guideTiles![0].kind).toBe('regular')
    expect(out.editor!.cells[0].tiles).toHaveLength(before) // Seed untouched
  })

  it('minted world-space Tile seeds a Figure recipe', () => {
    const s = withGuide(placeGuide(false))
    const out = reducer(s, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: START, sides: 4, rotation: 0 } })
    expect(out.figures['4']).toBeDefined()
  })

  it('stamping Anchor → ordinary Cell Tile (repeats under the Lattice)', () => {
    const s = withGuide(placeGuide(true))
    const before = s.editor!.cells[0].tiles.length
    const out = reducer(s, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: START, sides: 4, rotation: 0 } })
    expect(out.editor!.cells[0].tiles).toHaveLength(before + 1)
    expect(out.editor!.guideTiles).toBeUndefined()
  })

  it('fails closed on an Anchor point that matches no Guide Anchor', () => {
    const s = withGuide(placeGuide(false))
    const out = reducer(s, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: { x: -999, y: -999 }, sides: 4, rotation: 0 } })
    expect(out).toBe(s)
  })

  it('no-ops without an editor patch', () => {
    const s: PatternConfig = { ...structuredClone(DEFAULT_CONFIG) }
    delete s.editor
    expect(reducer(s, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: START, sides: 4, rotation: 0 } })).toBe(s)
  })

  it('the action is Design-mode undoable', () => {
    expect(DESIGN_MODE_ACTIONS.has('EDITOR_PLACE_TILE_ON_ANCHOR')).toBe(true)
  })

  it('multi-cell: Anchor placements size to the Cell\'s Tiles, not the raw lattice constant', () => {
    // #33 review finding 1: after the boundary-size slider grows
    // `patch.edgeLength` (the lattice constant) away from the Tiles' true
    // scale, Anchor placements must still mint at the Cell-Tile edge length
    // (`cellPlacementEdgeLength`) — in BOTH the stamping and world-space
    // branches. 4.8.8 seed with edgeLength forced 2.5× the seed Tiles'.
    const FAR = { x: 900, y: 900 }
    const s: PatternConfig = {
      ...structuredClone(DEFAULT_CONFIG),
      tiling: { type: 'editor', scale: 1 },
      editor: createDefault488EditorConfig(),
    }
    const activeId = s.editor!.activeCellId
    const activeBefore = s.editor!.cells.find(c => c.id === activeId) ?? s.editor!.cells[0]
    const seedEdge = (activeBefore.tiles[0] as EditorRegularTile).edgeLength
    s.editor!.edgeLength = seedEdge * 2.5
    const farGuide = (id: string, stamp: boolean): EditorGuideLine => ({
      id, kind: 'line', start: FAR, end: { x: FAR.x + 100, y: FAR.y },
      stamp, extend: 'none', ticksEnabled: false, manualAnchors: [],
    })

    // Stamping branch → Cell Tile at seedEdge.
    let st = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: farGuide('fs', true) } })
    st = reducer(st, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: FAR, sides: 4, rotation: 0 } })
    const activeAfter = st.editor!.cells.find(c => c.id === activeId) ?? st.editor!.cells[0]
    const stamped = activeAfter.tiles[activeAfter.tiles.length - 1] as EditorRegularTile
    expect(activeAfter.tiles.length).toBeGreaterThan(activeBefore.tiles.length)
    expect(stamped.edgeLength).toBeCloseTo(seedEdge)

    // World-space branch → guideTile at seedEdge.
    let sw = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: farGuide('fw', false) } })
    sw = reducer(sw, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: FAR, sides: 4, rotation: 0 } })
    expect(sw.editor!.guideTiles).toHaveLength(1)
    expect((sw.editor!.guideTiles![0] as EditorRegularTile).edgeLength).toBeCloseTo(seedEdge)
  })
})

describe('Guides — frame completion overlap probe includes guideTiles', () => {
  // #33 review finding 3: the frame-scoped completion branch built its
  // world-tiles probe without `patch.guideTiles`, so a frame-node Complete
  // could silently mint a Tile through an existing world-space guide Tile.
  // Fixture: default square-seed Patch + square Shape Frame; picks = the
  // seed's rightmost vertex + the two right-edge Frame nodes nearest y=0.
  const withFrame = (): PatternConfig => {
    const s = base()
    s.editor!.frame = { type: 'shape', shape: 'square', size: 300, boundaryTreatment: 'complete' }
    return s
  }
  const picksFor = (s: PatternConfig): Vec2[] => {
    const seedVerts = tileVertices(s.editor!.cells[0].tiles[0])
    const seedV = seedVerts.reduce((a, b) => (b.x > a.x ? b : a))
    const nodes = frameSelectablePoints(s.editor!)
    const maxX = Math.max(...nodes.map(p => p.x))
    const right = nodes
      .filter(p => Math.abs(p.x - maxX) < 1e-6)
      .sort((a, b) => Math.abs(a.y) - Math.abs(b.y))
    return [seedV, right[0], right[1]]
  }
  // World-space guide Tile squarely inside the completion triangle's span,
  // clear of the Seed and the Frame outline.
  const blockingGuideTile = (): EditorTile => ({
    id: 'gt-block',
    kind: 'irregular',
    vertices: [
      { x: 120, y: -80 }, { x: 280, y: -80 }, { x: 280, y: 80 }, { x: 120, y: 80 },
    ],
    source: 'completed',
  })

  it('sanity: the frame-node Complete succeeds with no guideTiles present', () => {
    const s = withFrame()
    const out = reducer(s, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks: picksFor(s) } })
    expect(out.editor!.frame!.completedTiles).toHaveLength(1)
  })

  it('rejects a frame-node Complete overlapping an existing guideTile (force still overrides)', () => {
    const s = withFrame()
    s.editor!.guideTiles = [blockingGuideTile()]
    const picks = picksFor(s)
    const rejected = reducer(s, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks } })
    expect(rejected).toBe(s)
    const forced = reducer(s, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks, force: true } })
    expect(forced.editor!.frame!.completedTiles).toHaveLength(1)
  })
})

describe('Guides — undo wiring', () => {
  it('all three guide actions are Design-mode undoable', () => {
    expect(DESIGN_MODE_ACTIONS.has('EDITOR_ADD_GUIDE')).toBe(true)
    expect(DESIGN_MODE_ACTIONS.has('EDITOR_UPDATE_GUIDE')).toBe(true)
    expect(DESIGN_MODE_ACTIONS.has('EDITOR_DELETE_GUIDE')).toBe(true)
  })

  it('UPDATE coalesces per guideId — drags on different Guides stay separate steps', () => {
    const a = historyCoalesceKey({ type: 'EDITOR_UPDATE_GUIDE', payload: { guideId: 'g1', patch: {} } })
    const b = historyCoalesceKey({ type: 'EDITOR_UPDATE_GUIDE', payload: { guideId: 'g2', patch: {} } })
    expect(a).not.toEqual(b)
  })
})
