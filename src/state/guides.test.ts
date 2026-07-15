import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import type { EditorGuideLine } from '../types/editor'
import { DESIGN_MODE_ACTIONS, historyCoalesceKey } from '../editor/history'

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
