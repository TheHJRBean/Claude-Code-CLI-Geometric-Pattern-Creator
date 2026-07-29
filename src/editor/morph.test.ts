import { describe, it, expect } from 'vitest'
import type { MorphConfig, MorphOrigin, PatternConfig } from '../types/pattern'
import { DEFAULT_CONFIG } from '../state/defaults'
import { createDefaultEditorConfig } from './createDefault'
import {
  autoReachAt,
  buildMorphOrigin,
  clipInfiniteLineToBounds,
  createDefaultMorph,
  defaultMorphOriginPosition,
  insertMorphOrigin,
  morphSideLabels,
  visibleMorphBand,
} from './morph'
import { morphFieldValue } from '../pic/morph'

const editorConfig = (): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor: createDefaultEditorConfig(),
})

const linearMorph = (origins: MorphOrigin[], overrides?: Partial<MorphConfig>): MorphConfig => ({
  enabled: true,
  mode: 'linear',
  axisOrigin: { x: 0, y: 0 },
  direction: { x: 1, y: 0 },
  easing: 'linear',
  origins,
  ...overrides,
})

/** A bare Origin with no overlay — for the ordering/positioning suites. */
const bare = (id: string, position: number): MorphOrigin =>
  ({ id, position, reach: 100, sides: 'both', figures: {} })

describe('createDefaultMorph', () => {
  it('is enabled, Linear, at the axis origin, with no Origins', () => {
    const m = createDefaultMorph()
    expect(m.enabled).toBe(true)
    expect(m.mode).toBe('linear')
    expect(m.axisOrigin).toEqual({ x: 0, y: 0 })
    expect(m.direction).toEqual({ x: 1, y: 0 })
    expect(m.origins).toEqual([])
  })
})

describe('morphSideLabels', () => {
  it('labels the stored union per mode', () => {
    expect(morphSideLabels('linear')).toEqual({ both: 'Both', negative: 'Left', positive: 'Right' })
    expect(morphSideLabels('radial')).toEqual({ both: 'Both', negative: 'Inside', positive: 'Outside' })
  })
})

describe('buildMorphOrigin', () => {
  it('with no active morph, reproduces the start recipe (fallback to config.figures keys)', () => {
    const config = DEFAULT_CONFIG // no editor — exercises the Object.keys(figures) fallback
    const b = buildMorphOrigin(config, 200)
    expect(b.figures['4'].contactAngle).toBe(config.figures['4'].contactAngle)
    expect(b.position).toBe(200)
  })

  it('walks the Patch tile types when an editor Patch is present', () => {
    const config = editorConfig()
    const b = buildMorphOrigin(config, 150)
    expect(Object.keys(b.figures)).toEqual(['4'])
    expect(b.figures['4'].contactAngle).toBe(config.figures['4'].contactAngle)
  })

  it('does not write vertexContactAngle when vertex lines are not decoupled', () => {
    const config = editorConfig()
    const b = buildMorphOrigin(config, 150)
    expect(b.figures['4'].vertexContactAngle).toBeUndefined()
  })

  it('writes vertexContactAngle when vertex lines are decoupled', () => {
    const config = editorConfig()
    config.figures['4'] = { ...config.figures['4'], vertexLinesDecoupled: true, vertexContactAngle: 30 }
    const b = buildMorphOrigin(config, 150)
    expect(b.figures['4'].vertexContactAngle).toBe(30)
  })

  it('defaults to a both-sided auto-fitting ramp reaching 4 edge-lengths', () => {
    const config = editorConfig()
    const o = buildMorphOrigin(config, 150)
    expect(o.sides).toBe('both')
    expect(o.autoReach).toBe(true)
    expect(o.reach).toBe(4 * config.editor!.edgeLength)
  })

  it("samples the target at the AUTO far end when a neighbour is present", () => {
    const config = editorConfig()
    const startAngle = config.figures['4'].contactAngle
    config.morph = linearMorph([{ id: 'a', position: 0, reach: 400, sides: 'both', figures: { '4': { contactAngle: 80 } } }])
    // Auto reach for an Origin dropped at 600 = half the 600 gap = 300.
    const fresh = buildMorphOrigin(config, 600)
    const expected = morphFieldValue(config.morph, '4', 'contactAngle', startAngle, 600 + 300)
    expect(fresh.figures['4'].contactAngle).toBeCloseTo(expected, 10)
  })

  it('with NO existing morph, the fresh Origin is flat at the base recipe', () => {
    const config = editorConfig()
    const startAngle = config.figures['4'].contactAngle
    const fresh = buildMorphOrigin(config, 200)
    const m = linearMorph([fresh])
    // Base everywhere: the line holds base, and the target equals it too.
    for (const d of [-500, 0, 200, 400, 900]) {
      expect(morphFieldValue(m, '4', 'contactAngle', startAngle, d)).toBeCloseTo(startAngle, 10)
    }
  })

  it('an explicit reach overrides the auto far end', () => {
    const config = editorConfig()
    const startAngle = config.figures['4'].contactAngle
    config.morph = linearMorph([{ id: 'a', position: 0, reach: 400, sides: 'both', figures: { '4': { contactAngle: 80 } } }])
    // buildMorphOrigin still auto-fits, so the caller's reach only sets the
    // stored fallback — the sampled far end follows the auto value (100).
    const fresh = buildMorphOrigin(config, 200, 4000)
    expect(fresh.reach).toBe(4000)
    const expected = morphFieldValue(config.morph, '4', 'contactAngle', startAngle, 300)
    expect(fresh.figures['4'].contactAngle).toBeCloseTo(expected, 10)
  })
})

describe('autoReachAt', () => {
  it('is half the gap to the nearest existing Origin', () => {
    const os = [bare('a', 0), bare('b', 1000)]
    expect(autoReachAt(os, 400, 999)).toBe(200)   // nearest is 'a' at 400 away
    expect(autoReachAt(os, 700, 999)).toBe(150)   // nearest is 'b' at 300 away
  })

  it('falls back when there is nothing to meet', () => {
    expect(autoReachAt([], 400, 999)).toBe(999)
    // A coincident Origin is not something to meet halfway.
    expect(autoReachAt([bare('a', 400)], 400, 999)).toBe(999)
  })
})

describe('insertMorphOrigin', () => {
  it('keeps the array sorted ascending by position regardless of insertion order', () => {
    let origins = insertMorphOrigin([], bare('mid', 200))
    origins = insertMorphOrigin(origins, bare('first', 0))
    origins = insertMorphOrigin(origins, bare('last', 500))
    expect(origins.map(x => x.id)).toEqual(['first', 'mid', 'last'])
  })
})

describe('defaultMorphOriginPosition', () => {
  it('spaces successive Add-Origin positions out along the axis', () => {
    const config = editorConfig()
    const p0 = defaultMorphOriginPosition(config)
    expect(p0).toBeGreaterThan(0)
    config.morph = linearMorph([bare('a', p0)])
    const p1 = defaultMorphOriginPosition(config)
    expect(p1).toBeGreaterThan(p0)
  })

  it('keeps the spaced position when it is well inside the visible band', () => {
    const config = editorConfig()
    config.morph = linearMorph([])
    const spaced = defaultMorphOriginPosition(config)
    const p = defaultMorphOriginPosition(config, { min: 0, max: spaced * 4 })
    expect(p).toBe(spaced)
  })

  it('lands at the visible-band centre when the spaced position is off screen', () => {
    const config = editorConfig()
    config.morph = linearMorph([])
    const band = { min: -100, max: 100 } // spaced default (4×edgeLength) way outside
    const p = defaultMorphOriginPosition(config, band)
    expect(p).toBe(0) // band centre
  })

  it('steps aside from an Origin already sitting at the band centre', () => {
    const config = editorConfig()
    config.morph = linearMorph([bare('a', 0)])
    const band = { min: -100, max: 100 }
    const p = defaultMorphOriginPosition(config, band)
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThanOrEqual(band.max)
  })

  it('ignores a degenerate band', () => {
    const config = editorConfig()
    config.morph = linearMorph([])
    const spaced = defaultMorphOriginPosition(config)
    expect(defaultMorphOriginPosition(config, { min: 5, max: 5 })).toBe(spaced)
  })
})

describe('visibleMorphBand', () => {
  const bounds = { minX: -100, minY: -50, maxX: 300, maxY: 50 }

  it('linear: projects the rect corners onto the direction axis', () => {
    const band = visibleMorphBand(linearMorph([]), bounds)
    expect(band.min).toBeCloseTo(-100)
    expect(band.max).toBeCloseTo(300)
  })

  it('linear: respects a non-axis direction and a shifted origin', () => {
    const m = linearMorph([], { axisOrigin: { x: 100, y: 0 }, direction: { x: 0, y: 1 } })
    const band = visibleMorphBand(m, bounds)
    expect(band.min).toBeCloseTo(-50)
    expect(band.max).toBeCloseTo(50)
  })

  it('radial: centre inside the rect spans 0 → farthest corner', () => {
    const m = linearMorph([], { mode: 'radial' })
    const band = visibleMorphBand(m, bounds)
    expect(band.min).toBe(0)
    expect(band.max).toBeCloseTo(Math.hypot(300, 50))
  })

  it('radial: centre outside the rect starts at the nearest rect point', () => {
    const m = linearMorph([], { mode: 'radial', axisOrigin: { x: -300, y: 0 } })
    const band = visibleMorphBand(m, bounds)
    expect(band.min).toBeCloseTo(200) // distance to the minX edge
    expect(band.max).toBeCloseTo(Math.hypot(600, 50))
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
