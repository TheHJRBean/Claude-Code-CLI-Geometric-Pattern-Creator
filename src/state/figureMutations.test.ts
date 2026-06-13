import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { DEFAULT_EDITOR_FIGURE } from '../editor/tileTypes'
import { createDefault488EditorConfig, createDefaultEditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import type { Action } from './actions'

// Characterization tests for reducer.ts's figure/curve mutation helpers and the
// invariant-carrying simple cases (thermo-nuclear review Chunk 5). The reducer
// is under the 1k bar and the mega-switch is idiomatic, so no restructure — this
// pins the behaviour a refactor could silently break (the line-enable mutual
// exclusion, the decouple seeding, curve defaults/clamping, reset semantics,
// immutability, and the no-op guards). The decoration actions + figure-key
// pruning already have their own suites (decoration.test.ts / figurePrune.test.ts).

const gallery = (): PatternConfig => structuredClone(DEFAULT_CONFIG) // square, figures { '4': 67.5° }
const editor = (over = {}): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor: createDefaultEditorConfig(over),
})

describe('scalar figure-field mutations', () => {
  it('SET_CONTACT_ANGLE writes only the targeted tile type, preserving the rest', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '4', angle: 30 } } as Action)
    expect(s.figures['4'].contactAngle).toBe(30)
    // unrelated fields preserved
    expect(s.figures['4'].lineLength).toBe(1.0)
    expect(s.figures['4'].autoLineLength).toBe(true)
  })

  it('mutating an unknown tile type seeds it from the fallback figure', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '8', angle: 45 } } as Action)
    // FALLBACK_FIGURE: star / 60° / lineLength 1 / auto, with the override applied
    expect(s.figures['8']).toEqual({ type: 'star', contactAngle: 45, lineLength: 1.0, autoLineLength: true })
    // existing '4' untouched
    expect(s.figures['4'].contactAngle).toBe(67.5)
  })

  it('SET_LINE_LENGTH / SET_AUTO_LINE_LENGTH / SET_SNAP_LINE_LENGTH write their field', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_LINE_LENGTH', payload: { tileTypeId: '4', lineLength: 0.5 } } as Action)
    s = reducer(s, { type: 'SET_AUTO_LINE_LENGTH', payload: { tileTypeId: '4', auto: false } } as Action)
    s = reducer(s, { type: 'SET_SNAP_LINE_LENGTH', payload: { tileTypeId: '4', snap: true } } as Action)
    expect(s.figures['4']).toMatchObject({ lineLength: 0.5, autoLineLength: false, snapLineLength: true })
  })

  it('does not mutate the previous state (immutability)', () => {
    const s0 = gallery()
    const snapshot = structuredClone(s0)
    reducer(s0, { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '4', angle: 12 } } as Action)
    expect(s0).toEqual(snapshot)
  })
})

describe('edge/vertex line mutual-exclusion invariant', () => {
  it('disabling edge lines force-enables vertex lines (a tile must keep one line source)', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_EDGE_LINES_ENABLED', payload: { tileTypeId: '4', enabled: false } } as Action)
    expect(s.figures['4'].edgeLinesEnabled).toBe(false)
    expect(s.figures['4'].vertexLinesEnabled).toBe(true)
  })

  it('disabling vertex lines force-enables edge lines', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_VERTEX_LINES_ENABLED', payload: { tileTypeId: '4', enabled: false } } as Action)
    expect(s.figures['4'].vertexLinesEnabled).toBe(false)
    expect(s.figures['4'].edgeLinesEnabled).toBe(true)
  })

  it('enabling a line source does not touch the other source', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_VERTEX_LINES_ENABLED', payload: { tileTypeId: '4', enabled: true } } as Action)
    expect(s.figures['4'].vertexLinesEnabled).toBe(true)
    expect(s.figures['4'].edgeLinesEnabled).toBeUndefined()
  })
})

describe('SET_VERTEX_LINES_DECOUPLED seeding', () => {
  it('decoupling seeds the vertex fields from the coupled values', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '4', angle: 40 } } as Action)
    s = reducer(s, { type: 'SET_LINE_LENGTH', payload: { tileTypeId: '4', lineLength: 0.7 } } as Action)
    s = reducer(s, { type: 'SET_VERTEX_LINES_DECOUPLED', payload: { tileTypeId: '4', decoupled: true } } as Action)
    const f = s.figures['4']
    expect(f.vertexLinesDecoupled).toBe(true)
    expect(f.vertexContactAngle).toBe(40)
    expect(f.vertexLineLength).toBe(0.7)
    expect(f.vertexAutoLineLength).toBe(f.autoLineLength)
  })

  it('decoupling deep-copies the coupled curve into vertexCurve', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CURVE_ENABLED', payload: { tileTypeId: '4', enabled: true } } as Action)
    s = reducer(s, { type: 'SET_VERTEX_LINES_DECOUPLED', payload: { tileTypeId: '4', decoupled: true } } as Action)
    const f = s.figures['4']
    expect(f.vertexCurve).toEqual(f.curve)
    // a deep copy — points are not the same array reference
    expect(f.vertexCurve!.points).not.toBe(f.curve!.points)
  })

  it('re-coupling (decoupled:false) only flips the flag', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_VERTEX_LINES_DECOUPLED', payload: { tileTypeId: '4', decoupled: true } } as Action)
    s = reducer(s, { type: 'SET_VERTEX_LINES_DECOUPLED', payload: { tileTypeId: '4', decoupled: false } } as Action)
    expect(s.figures['4'].vertexLinesDecoupled).toBe(false)
  })
})

describe('curve mutations (edge target)', () => {
  it('SET_CURVE_ENABLED creates a curve with a default point when none exists', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CURVE_ENABLED', payload: { tileTypeId: '4', enabled: true } } as Action)
    expect(s.figures['4'].curve).toEqual({ enabled: true, points: [{ position: 0.5, offset: 0.2 }] })
  })

  it('SET_CURVE_POINT_COUNT clamps to [1,3]', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CURVE_POINT_COUNT', payload: { tileTypeId: '4', count: 9 } } as Action)
    expect(s.figures['4'].curve!.points).toHaveLength(3)
    s = reducer(s, { type: 'SET_CURVE_POINT_COUNT', payload: { tileTypeId: '4', count: 0 } } as Action)
    expect(s.figures['4'].curve!.points).toHaveLength(1)
  })

  it('SET_CURVE_POINT_COUNT preserves existing point values', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CURVE_POINT', payload: { tileTypeId: '4', index: 0, point: { offset: 0.9 } } } as Action)
    s = reducer(s, { type: 'SET_CURVE_POINT_COUNT', payload: { tileTypeId: '4', count: 2 } } as Action)
    expect(s.figures['4'].curve!.points[0].offset).toBe(0.9)
    expect(s.figures['4'].curve!.points).toHaveLength(2)
  })

  it('SET_CURVE_POINT merges into the point at the given index only', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CURVE_POINT_COUNT', payload: { tileTypeId: '4', count: 2 } } as Action)
    s = reducer(s, { type: 'SET_CURVE_POINT', payload: { tileTypeId: '4', index: 1, point: { position: 0.8 } } } as Action)
    const pts = s.figures['4'].curve!.points
    expect(pts[1].position).toBe(0.8)
    expect(pts[0].position).toBe(0.5) // untouched
  })

  it('SET_CURVE_ALTERNATING and SET_CURVE_DIRECTION write to the edge curve', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CURVE_ALTERNATING', payload: { tileTypeId: '4', alternating: true } } as Action)
    s = reducer(s, { type: 'SET_CURVE_DIRECTION', payload: { tileTypeId: '4', direction: 'right' } } as Action)
    expect(s.figures['4'].curve).toMatchObject({ alternating: true, direction: 'right' })
  })
})

describe('curve mutations (vertex target)', () => {
  it('target "vertex" writes to vertexCurve, leaving the edge curve untouched', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CURVE_ENABLED', payload: { tileTypeId: '4', enabled: true } } as Action)
    s = reducer(s, { type: 'SET_CURVE_ENABLED', payload: { tileTypeId: '4', enabled: true, target: 'vertex' } } as Action)
    expect(s.figures['4'].vertexCurve).toEqual({ enabled: true, points: [{ position: 0.5, offset: 0.2 }] })
    expect(s.figures['4'].curve).toBeDefined()
    // mutating the vertex curve doesn't bleed into the edge curve
    s = reducer(s, { type: 'SET_CURVE_DIRECTION', payload: { tileTypeId: '4', direction: 'left', target: 'vertex' } } as Action)
    expect(s.figures['4'].vertexCurve!.direction).toBe('left')
    expect(s.figures['4'].curve!.direction).toBeUndefined()
  })
})

describe('RESET_FIGURES', () => {
  it('resets a tweaked gallery figure to its tiling default', () => {
    let s = gallery()
    s = reducer(s, { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '4', angle: 10 } } as Action)
    s = reducer(s, { type: 'RESET_FIGURES' } as Action)
    expect(s.figures['4'].contactAngle).toBe(67.5) // square's default
  })

  it('resets Builder figures to DEFAULT_EDITOR_FIGURE', () => {
    let s = editor()
    // ensure a figure entry exists, then tweak it
    const id = Object.keys(s.figures)[0]
    s = reducer(s, { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: id, angle: 12 } } as Action)
    s = reducer(s, { type: 'RESET_FIGURES' } as Action)
    expect(s.figures[id]).toEqual(DEFAULT_EDITOR_FIGURE)
  })
})

describe('top-level config mutations', () => {
  it('SET_SCALE updates tiling.scale only', () => {
    const s = reducer(gallery(), { type: 'SET_SCALE', payload: 250 } as Action)
    expect(s.tiling.scale).toBe(250)
    expect(s.tiling.type).toBe('square')
  })

  it('SET_STRAND_STYLE merges the partial into strand', () => {
    const s = reducer(gallery(), { type: 'SET_STRAND_STYLE', payload: { width: 8 } } as Action)
    expect(s.strand.width).toBe(8)
    expect(s.strand.color).toBe('#1a1a2e') // preserved
  })

  it('SET_SMOOTH_TRANSITIONS and SET_FIGURE_ROUTING set their flags', () => {
    let s = reducer(gallery(), { type: 'SET_SMOOTH_TRANSITIONS', payload: true } as Action)
    expect(s.smoothTransitions).toBe(true)
    s = reducer(s, { type: 'SET_FIGURE_ROUTING', payload: 'centroid' } as Action)
    expect(s.figureRouting).toBe('centroid')
  })
})

describe('editor no-op guards and invariants', () => {
  it('editor actions return the same state reference when no patch is present', () => {
    const s = gallery() // no editor
    expect(reducer(s, { type: 'SET_CELL_SHAPE', payload: 'hexagon' } as Action)).toBe(s)
    expect(reducer(s, { type: 'SET_CELL_BOUNDARY_SIZE', payload: 200 } as Action)).toBe(s)
    expect(reducer(s, { type: 'EDITOR_DELETE_TILE', payload: { tileId: 'x' } } as Action)).toBe(s)
  })

  it('SET_CELL_BOUNDARY_SIZE with a non-positive size is a no-op', () => {
    const s = editor()
    expect(reducer(s, { type: 'SET_CELL_BOUNDARY_SIZE', payload: 0 } as Action)).toBe(s)
    expect(reducer(s, { type: 'SET_CELL_BOUNDARY_SIZE', payload: -5 } as Action)).toBe(s)
  })

  it('SET_EDITOR_SYMMETRY_MODE coerces horizontal→none on a triangle cell (no horizontal mirror)', () => {
    const s = editor({ shape: 'triangle' })
    const out = reducer(s, { type: 'SET_EDITOR_SYMMETRY_MODE', payload: 'horizontal' } as Action)
    expect(out.editor!.cells[0].symmetryMode).toBe('none')
  })

  it('multi-cell SET_CELL_BOUNDARY_SIZE scales the whole lattice and keeps the edge invariant', () => {
    const s: PatternConfig = {
      ...structuredClone(DEFAULT_CONFIG),
      tiling: { type: 'editor', scale: 1 },
      editor: createDefault488EditorConfig(),
    }
    const e0 = s.editor!.edgeLength
    const centres0 = s.editor!.cells.map(c => ({ ...c.center }))
    const next = e0 * 2
    const out = reducer(s, { type: 'SET_CELL_BOUNDARY_SIZE', payload: next } as Action)
    expect(out.editor!.edgeLength).toBe(next)
    // every cell's boundarySize follows edgeLength (the 4.8.8 edge invariant)
    expect(out.editor!.cells.every(c => c.boundarySize === next)).toBe(true)
    // centres scale by k = next/e0 = 2
    out.editor!.cells.forEach((c, i) => {
      expect(c.center.x).toBeCloseTo(centres0[i].x * 2, 6)
      expect(c.center.y).toBeCloseTo(centres0[i].y * 2, 6)
    })
  })
})
