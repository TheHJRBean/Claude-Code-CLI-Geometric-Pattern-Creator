import { describe, it, expect } from 'vitest'
import type { MorphBoundary, MorphConfig, PatternConfig } from '../types/pattern'
import { DEFAULT_CONFIG } from '../state/defaults'
import { createDefaultEditorConfig } from './createDefault'
import {
  buildMorphBoundary,
  clipInfiniteLineToBounds,
  createDefaultMorph,
  defaultMorphBoundaryPosition,
  insertMorphBoundary,
} from './morph'
import { morphFieldValue } from '../pic/morph'

const editorConfig = (): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor: createDefaultEditorConfig(),
})

const linearMorph = (boundaries: MorphBoundary[], overrides?: Partial<MorphConfig>): MorphConfig => ({
  enabled: true,
  mode: 'linear',
  origin: { x: 0, y: 0 },
  direction: { x: 1, y: 0 },
  easing: 'linear',
  boundaries,
  ...overrides,
})

describe('createDefaultMorph', () => {
  it('is enabled, Linear, at the origin, with no Boundaries', () => {
    const m = createDefaultMorph()
    expect(m.enabled).toBe(true)
    expect(m.mode).toBe('linear')
    expect(m.origin).toEqual({ x: 0, y: 0 })
    expect(m.direction).toEqual({ x: 1, y: 0 })
    expect(m.boundaries).toEqual([])
  })
})

describe('buildMorphBoundary', () => {
  it('with no active morph, reproduces the start recipe (fallback to config.figures keys)', () => {
    const config = DEFAULT_CONFIG // no editor — exercises the Object.keys(figures) fallback
    const b = buildMorphBoundary(config, 200)
    expect(b.figures['4'].contactAngle).toBe(config.figures['4'].contactAngle)
    expect(b.position).toBe(200)
  })

  it('walks the Patch tile types when an editor Patch is present', () => {
    const config = editorConfig()
    const b = buildMorphBoundary(config, 150)
    expect(Object.keys(b.figures)).toEqual(['4'])
    expect(b.figures['4'].contactAngle).toBe(config.figures['4'].contactAngle)
  })

  it('does not write vertexContactAngle when vertex lines are not decoupled', () => {
    const config = editorConfig()
    const b = buildMorphBoundary(config, 150)
    expect(b.figures['4'].vertexContactAngle).toBeUndefined()
  })

  it('writes vertexContactAngle when vertex lines are decoupled', () => {
    const config = editorConfig()
    config.figures['4'] = { ...config.figures['4'], vertexLinesDecoupled: true, vertexContactAngle: 30 }
    const b = buildMorphBoundary(config, 150)
    expect(b.figures['4'].vertexContactAngle).toBe(30)
  })

  it('pre-fills from the CURRENT field value at that position, so inserting is a visual no-op', () => {
    const config = editorConfig()
    const existing = [
      { id: 'a', position: 0, figures: { '4': { contactAngle: 20 } } },
      { id: 'b', position: 400, figures: { '4': { contactAngle: 80 } } },
    ]
    config.morph = linearMorph(existing)
    const startAngle = config.figures['4'].contactAngle

    // Sample the field at a handful of positions BEFORE inserting a new stop.
    const samples = [-50, 0, 100, 200, 300, 400, 500]
    const before = samples.map(d => morphFieldValue(config.morph!, '4', 'contactAngle', startAngle, d))

    const fresh = buildMorphBoundary(config, 200)
    const afterBoundaries = insertMorphBoundary(config.morph!.boundaries, fresh)
    const afterMorph = linearMorph(afterBoundaries)
    const after = samples.map(d => morphFieldValue(afterMorph, '4', 'contactAngle', startAngle, d))

    expect(after).toEqual(before)
    // And the inserted stop landed exactly where the pre-insert field was.
    expect(fresh.figures['4'].contactAngle).toBeCloseTo(50, 10) // midpoint of 20→80 at d=200 of [0,400]
  })
})

describe('insertMorphBoundary', () => {
  it('keeps the array sorted ascending by position regardless of insertion order', () => {
    const b = (id: string, position: number): MorphBoundary => ({ id, position, figures: {} })
    let boundaries = insertMorphBoundary([], b('mid', 200))
    boundaries = insertMorphBoundary(boundaries, b('first', 0))
    boundaries = insertMorphBoundary(boundaries, b('last', 500))
    expect(boundaries.map(x => x.id)).toEqual(['first', 'mid', 'last'])
  })
})

describe('defaultMorphBoundaryPosition', () => {
  it('spaces successive Add-Boundary positions out along the axis', () => {
    const config = editorConfig()
    const p0 = defaultMorphBoundaryPosition(config)
    expect(p0).toBeGreaterThan(0)
    config.morph = linearMorph([{ id: 'a', position: p0, figures: {} }])
    const p1 = defaultMorphBoundaryPosition(config)
    expect(p1).toBeGreaterThan(p0)
  })
})

describe('clipInfiniteLineToBounds', () => {
  const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50 }

  it('clips a vertical line through the bounds', () => {
    const span = clipInfiniteLineToBounds({ x: 0, y: 0 }, { x: 0, y: 1 }, bounds)
    expect(span).not.toBeNull()
    expect(span!.a.x).toBeCloseTo(0)
    expect(span!.b.x).toBeCloseTo(0)
    expect([span!.a.y, span!.b.y].sort((x, y) => x - y)).toEqual([-50, 50])
  })

  it('clips a horizontal line offset from centre through the bounds', () => {
    const span = clipInfiniteLineToBounds({ x: 0, y: 20 }, { x: 1, y: 0 }, bounds)
    expect(span).not.toBeNull()
    expect([span!.a.x, span!.b.x].sort((x, y) => x - y)).toEqual([-100, 100])
    expect(span!.a.y).toBeCloseTo(20)
    expect(span!.b.y).toBeCloseTo(20)
  })

  it('returns null when the line misses the bounds entirely', () => {
    const span = clipInfiniteLineToBounds({ x: 0, y: 1000 }, { x: 1, y: 0 }, bounds)
    expect(span).toBeNull()
  })
})
