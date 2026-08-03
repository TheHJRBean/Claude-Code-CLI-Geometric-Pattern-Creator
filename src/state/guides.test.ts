import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig, createDefault488EditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import type { EditorGuideLine, EditorRegularTile, EditorTile } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { DESIGN_MODE_ACTIONS, historyCoalesceKey } from '../editor/history'
import {
  applyCellTransform,
  cellContainingPoint,
  frameSelectablePoints,
  resolveHostCell,
} from '../editor/patchSelectable'
import { patchRotation } from '../editor/compositionLattice'
import { ghostStampsOnly, neighbourGuideAnchors } from '../editor/guideStamps'
import { neighbourStampsNear, validateMultiPick } from '../editor/patchSelectable'
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

  it('stamping Anchor placement propagates the Cell\'s symmetry orbit (all-or-nothing)', () => {
    // #33 review finding 2: stamping Anchors mint ordinary Cell Tiles, so they
    // must orbit like every other Design-mode placement. D4 'full' on the
    // default square Cell + an off-axis Anchor at (250, 250) → 4 distinct
    // rotation images (reflections collapse onto them by centroid dedupe).
    const s = withGuide(placeGuide(true))
    s.editor!.cells[0] = { ...s.editor!.cells[0], symmetryMode: 'full' }
    const before = s.editor!.cells[0].tiles.length
    const out = reducer(s, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: START, sides: 4, rotation: 0 } })
    expect(out.editor!.cells[0].tiles.length).toBe(before + 4)
    expect(out.editor!.guideTiles).toBeUndefined()
    // Non-stamping Anchors stay world-space singles regardless of symmetry.
    const sw = withGuide(placeGuide(false))
    sw.editor!.cells[0] = { ...sw.editor!.cells[0], symmetryMode: 'full' }
    const outW = reducer(sw, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: START, sides: 4, rotation: 0 } })
    expect(outW.editor!.guideTiles).toHaveLength(1)
  })

  it('multi-cell: Anchor placements size to the Cell\'s Tiles, not the raw lattice constant', () => {
    // #33 review finding 1: after the boundary-size slider grows
    // `patch.edgeLength` (the lattice constant) away from the Tiles' true
    // scale, Anchor placements must still mint at the Cell-Tile edge length
    // (`cellPlacementEdgeLength`) — in BOTH the stamping and world-space
    // branches. 4.8.8 seed with edgeLength forced 2.5× the seed Tiles'.
    //
    // Tracks the RESOLVED HOST Cell, not `activeCellId` (#34). This assertion
    // used to follow the active Cell and passed only because hosting was
    // hard-wired to it; FAR sits outside every Boundary, so `resolveHostCell`
    // falls back to the nearest Cell centre — the square, not the active
    // octagon. The sizing property under test is unchanged either way.
    const FAR = { x: 900, y: 900 }
    const s: PatternConfig = {
      ...structuredClone(DEFAULT_CONFIG),
      tiling: { type: 'editor', scale: 1 },
      editor: createDefault488EditorConfig(),
    }
    const hostId = resolveHostCell(s.editor!, FAR, patchRotation(s.editor!)).id
    const activeBefore = s.editor!.cells.find(c => c.id === hostId) ?? s.editor!.cells[0]
    const seedEdge = (activeBefore.tiles[0] as EditorRegularTile).edgeLength
    s.editor!.edgeLength = seedEdge * 2.5
    const farGuide = (id: string, stamp: boolean): EditorGuideLine => ({
      id, kind: 'line', start: FAR, end: { x: FAR.x + 100, y: FAR.y },
      stamp, extend: 'none', ticksEnabled: false, manualAnchors: [],
    })

    // Stamping branch → Cell Tile at seedEdge.
    let st = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: farGuide('fs', true) } })
    st = reducer(st, { type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload: { anchor: FAR, sides: 4, rotation: 0 } })
    const activeAfter = st.editor!.cells.find(c => c.id === hostId) ?? st.editor!.cells[0]
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

describe('Guides — stamped Anchor Tiles land in the Cell that contains them (#34)', () => {
  // The 4.8.8 seed is the sharp fixture: `activeCellId` is the OCTAGON at the
  // origin, and the SQUARE Cell sits out at (120.71, 120.71) with its own
  // local frame rotated π/4. An Anchor inside the square resolves there by
  // containment, so every assertion below reads differently under the old
  // active-Cell hosting.
  const multi = (): PatternConfig => ({
    ...structuredClone(DEFAULT_CONFIG),
    tiling: { type: 'editor', scale: 1 },
    editor: createDefault488EditorConfig(),
  })
  // Inside the square Cell's Boundary, comfortably outside the octagon's.
  const IN_SQUARE = { x: 140, y: 140 }
  const squareGuide = (stamp: boolean): EditorGuideLine => ({
    id: 'sq', kind: 'line', start: IN_SQUARE, end: { x: IN_SQUARE.x + 60, y: IN_SQUARE.y },
    stamp, extend: 'none', ticksEnabled: false, manualAnchors: [],
  })
  const place = (s: PatternConfig): PatternConfig => {
    const withG = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: squareGuide(true) } })
    // `force` so the overlap gate against the square's own Seed Tile can't
    // decide the outcome — this is a routing test, not a viability one.
    return reducer(withG, {
      type: 'EDITOR_PLACE_TILE_ON_ANCHOR',
      payload: { anchor: IN_SQUARE, sides: 3, rotation: 0, force: true },
    })
  }
  const cellsById = (s: PatternConfig) => ({
    octagon: s.editor!.cells.find(c => c.id === 'octagon')!,
    square: s.editor!.cells.find(c => c.id === 'square')!,
  })
  /** Anchor placements mint regular n-gons; narrow so `center` is reachable. */
  const regular = (t: EditorTile): EditorRegularTile => {
    expect(t.kind).toBe('regular')
    return t as EditorRegularTile
  }

  it('the fixture is honest: the Anchor is inside the square, and the ACTIVE Cell is the octagon', () => {
    const s = multi()
    expect(s.editor!.activeCellId).toBe('octagon')
    expect(cellContainingPoint(s.editor!, IN_SQUARE, patchRotation(s.editor!))?.id).toBe('square')
  })

  it('stores the Tile in the containing Cell, not the active one', () => {
    const s = multi()
    const before = cellsById(s)
    const out = place(s)
    const after = cellsById(out)
    expect(after.square.tiles.length).toBe(before.square.tiles.length + 1)
    expect(after.octagon.tiles.length).toBe(before.octagon.tiles.length)
  })

  it('re-aims activeCellId at the host, so the applyWrap boundary fit follows the Tile', () => {
    expect(place(multi()).editor!.activeCellId).toBe('square')
  })

  it("converts into the HOST Cell's local frame — the Tile renders back at the Anchor", () => {
    // The bug is invisible in world space with symmetry off, because a Tile
    // stored in the wrong Cell was ALSO converted through that Cell's inverse
    // transform. What this pins is that the round-trip is self-consistent:
    // local centre → host transform → within an edge length of the Anchor.
    //
    // Reads only the Tile THIS action added (not `tiles.at(-1)`, which under
    // the old hosting was the square's untouched Seed Tile — near enough to
    // the Anchor to satisfy the bound and make the test pass vacuously).
    const s = multi()
    const beforeCount = cellsById(s).square.tiles.length
    const out = place(s)
    const host = cellsById(out).square
    const added = host.tiles.slice(beforeCount)
    expect(added).toHaveLength(1)
    const world = applyCellTransform(regular(added[0]).center, host, patchRotation(out.editor!))
    expect(Math.hypot(world.x - IN_SQUARE.x, world.y - IN_SQUARE.y)).toBeLessThan(out.editor!.edgeLength)
  })

  it('runs the symmetry orbit about the HOST Cell, not the active one', () => {
    // The load-bearing assertion. D4 on the square puts all four images
    // within the square Cell's own footprint. Hosted on the octagon, the same
    // orbit spins the Anchor about the ORIGIN — images land near (±198, ±198),
    // i.e. flung across the Patch into and past sibling Cells.
    const s = multi()
    s.editor!.cells = s.editor!.cells.map(c =>
      c.id === 'square' ? { ...c, symmetryMode: 'full' as const } : c,
    )
    const before = cellsById(s)
    const out = place(s)
    const host = cellsById(out).square
    const added = host.tiles.slice(before.square.tiles.length)
    // Full D4 = 8 images. The Anchor lies on a local symmetry axis, but the
    // placed TRIANGLE has no matching reflection symmetry, so each reflected
    // image has its own centroid and survives the dedupe. (The sibling test
    // above places a square there and collapses to 4 — same orbit, different
    // tile symmetry.)
    expect(added.length).toBe(8)
    const rot = patchRotation(out.editor!)
    const centre = applyCellTransform({ x: 0, y: 0 }, host, rot)
    for (const t of added) {
      const world = applyCellTransform(regular(t).center, host, rot)
      // Every image hugs the square Cell; the octagon's centre is 170 away.
      expect(Math.hypot(world.x - centre.x, world.y - centre.y)).toBeLessThan(100)
    }
    expect(cellsById(out).octagon.tiles.length).toBe(before.octagon.tiles.length)
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

describe('Guides — symmetry-orbit groups (slice 4 / #29)', () => {
  /** Default single-cell square Patch with the Symmetry picker turned on. */
  const symBase = (mode: 'full' | 'rotation' | 'none'): PatternConfig => {
    const s = base()
    s.editor!.cells = s.editor!.cells.map(c => ({ ...c, symmetryMode: mode }))
    return s
  }

  it('EDITOR_ADD_GUIDE lays down the whole orbit as one linked group', () => {
    // A *generic* line — the shared `guide()` helper runs along the horizontal
    // mirror axis, whose D4 orbit legitimately collapses from 8 images to 4.
    const drawn: EditorGuideLine = { ...guide('g1'), start: { x: 20, y: 30 }, end: { x: 120, y: 70 } }
    const s = reducer(symBase('full'), { type: 'EDITOR_ADD_GUIDE', payload: { guide: drawn } })
    const guides = s.editor!.guides!
    expect(guides).toHaveLength(8)
    expect(guides[0].id).toBe('g1')
    expect(new Set(guides.map(g => g.group!.id)).size).toBe(1)
    expect(new Set(guides.map(g => g.id)).size).toBe(8)
  })

  it('symmetry "none" still adds exactly one unlinked Guide', () => {
    const s = reducer(symBase('none'), { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g1') } })
    expect(s.editor!.guides).toHaveLength(1)
    expect(s.editor!.guides![0].group).toBeUndefined()
  })

  it('EDITOR_UPDATE_GUIDE on one member applies to every member', () => {
    let s = reducer(symBase('rotation'), { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g1') } })
    const memberId = s.editor!.guides![2].id
    s = reducer(s, {
      type: 'EDITOR_UPDATE_GUIDE',
      payload: { guideId: memberId, patch: { stamp: true, extend: 'both' } },
    })
    expect(s.editor!.guides!.every(g => g.stamp)).toBe(true)
    expect(s.editor!.guides!.every(g => (g as EditorGuideLine).extend === 'both')).toBe(true)
    // Ids + membership survive the edit, so the open popup stays valid.
    expect(s.editor!.guides!.map(g => g.id)).toEqual(['g1', 'g1-s1', 'g1-s2', 'g1-s3'])
  })

  it('a geometry edit reshapes the group symmetrically, not onto the dragged member', () => {
    let s = reducer(symBase('rotation'), { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g1') } })
    s = reducer(s, {
      type: 'EDITOR_UPDATE_GUIDE',
      payload: { guideId: 'g1', patch: { end: { x: 60, y: 60 } } },
    })
    const lines = s.editor!.guides! as EditorGuideLine[]
    expect(lines).toHaveLength(4)
    expect(lines[0].end).toEqual({ x: 60, y: 60 })
    // Four distinct positions — a collapse would leave one repeated point.
    const ends = new Set(lines.map(g => `${Math.round(g.end.x)},${Math.round(g.end.y)}`))
    expect(ends.size).toBe(4)
  })

  it('EDITOR_DELETE_GUIDE on one member deletes the whole group in one action', () => {
    let s = reducer(symBase('rotation'), { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g1') } })
    expect(s.editor!.guides).toHaveLength(4)
    s = reducer(s, { type: 'EDITOR_DELETE_GUIDE', payload: { guideId: 'g1-s2' } })
    // Last group gone ⇒ the whole block drops, matching migration semantics.
    expect(s.editor!.guides).toBeUndefined()
  })

  it('deleting a group leaves unrelated Guides alone', () => {
    let s = reducer(symBase('rotation'), { type: 'EDITOR_ADD_GUIDE', payload: { guide: guide('g1') } })
    // A canvas-space Guide (outside the Cell Boundary) never joins a group.
    const stray: EditorGuideLine = { ...guide('stray'), start: { x: 5000, y: 0 }, end: { x: 5100, y: 0 } }
    s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: stray } })
    expect(s.editor!.guides).toHaveLength(5)
    s = reducer(s, { type: 'EDITOR_DELETE_GUIDE', payload: { guideId: 'g1-s1' } })
    expect(s.editor!.guides!.map(g => g.id)).toEqual(['stray'])
  })
})

describe('Guides — neighbour Anchors from stamping Guides (slice 5 / #30)', () => {
  /**
   * A stamping Guide's Anchors exist on every Lattice stamp too (#30). The
   * validator and the reducer must both accept a pick there — and must still
   * refuse it when the Guide does NOT stamp, which is the entire behavioural
   * difference the stamp toggle promises.
   */
  const stampingLine = (): EditorGuideLine => ({
    ...guide('gs'),
    stamp: true,
    start: { x: 0, y: 120 },
    end: { x: 100, y: 120 },
  })

  const neighbourAnchor = (s: PatternConfig): Vec2 => {
    const patch = s.editor!
    const stamps = ghostStampsOnly(neighbourStampsNear(patch, [{ x: 0, y: 120 }, { x: 900, y: 120 }]))
    const anchors = neighbourGuideAnchors(patch, patchRotation(patch), stamps)
    expect(anchors.length).toBeGreaterThan(0)
    return anchors[0].p
  }

  it('validateMultiPick accepts a neighbour Anchor but still refuses a non-stamping one', () => {
    let s = base()
    s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: stampingLine() } })
    const p = neighbourAnchor(s)
    // Alone it is not grounding — with two real Cell vertices it is a valid pick.
    const cell = s.editor!.cells[0]
    const seedVerts = tileVertices(cell.tiles[0]).map(v => applyCellTransform(v, cell, patchRotation(s.editor!)))
    expect(validateMultiPick(s.editor!, [seedVerts[0], seedVerts[1], p]).kind).not.toBe('pick-not-selectable')

    // Same geometry with stamp OFF: the neighbour copy does not exist.
    const off = reducer(s, { type: 'EDITOR_UPDATE_GUIDE', payload: { guideId: 'gs', patch: { stamp: false } } })
    expect(validateMultiPick(off.editor!, [seedVerts[0], seedVerts[1], p]).kind).toBe('pick-not-selectable')
  })

  it('a neighbour Anchor alone cannot ground a Complete', () => {
    let s = base()
    s = reducer(s, { type: 'EDITOR_ADD_GUIDE', payload: { guide: stampingLine() } })
    const patch = s.editor!
    const stamps = ghostStampsOnly(neighbourStampsNear(patch, [{ x: 0, y: 120 }, { x: 900, y: 120 }]))
    const anchors = neighbourGuideAnchors(patch, patchRotation(patch), stamps)
    const picks = anchors.slice(0, 3).map(a => a.p)
    expect(picks).toHaveLength(3)
    expect(validateMultiPick(patch, picks).kind).toBe('no-real-cell-pick')
    expect(reducer(s, { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks } })).toBe(s)
  })
})
