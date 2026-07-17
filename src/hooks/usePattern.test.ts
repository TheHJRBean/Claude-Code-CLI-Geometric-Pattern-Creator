import { describe, it, expect, afterEach, vi } from 'vitest'
import { stampSegments, periodicFastPathEligible, runPICForCategory } from './usePattern'
import { runPIC } from '../pic/index'
import { runRosettePIC } from '../pic/rosettePatch'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import type { Segment } from '../types/geometry'
import type { LatticeStamp } from '../editor/lattice'
import type { PatternConfig, FigureConfig } from '../types/pattern'

// Characterization tests for the two PURE helpers in usePattern (thermo-nuclear
// review Chunk 4). The hook itself is React/memo plumbing verified manually;
// these pin the translation-invariant field stamping + the Lever-A fast-path
// eligibility gate, which are load-bearing for both render and Decoration.

// `periodicFastPathEligible` reads `periodicityEnabled()` from utils/perf; mock
// it behind a mutable flag so we can exercise both the on (default) and off
// branches without touching localStorage (the suite runs in the node env where
// it's absent and the real flag silently defaults to on). `vi.hoisted` keeps
// the flag accessible inside the hoisted mock factory.
const perfFlag = vi.hoisted(() => ({ periodicity: true }))
vi.mock('../utils/perf', () => ({
  periodicityEnabled: () => perfFlag.periodicity,
  recordPerf: () => {},
}))

afterEach(() => {
  perfFlag.periodicity = true
})

const seg = (over: Partial<Segment> = {}): Segment => ({
  from: { x: 1, y: 2 },
  to: { x: 3, y: 4 },
  edgeMidpoint: { x: 2, y: 3 },
  polygonCenter: { x: 0, y: 0 },
  polygonId: 'p0',
  polygonSides: 4,
  tileTypeId: '4',
  kind: 'star-arm',
  ...over,
})

const T = (x: number, y: number, rotation = 0): LatticeStamp => ({
  translation: { x, y },
  rotation,
})

describe('stampSegments', () => {
  it('returns empty when there are no stamps', () => {
    expect(stampSegments([seg()], [])).toEqual([])
  })

  it('returns empty when there are no base segments', () => {
    expect(stampSegments([], [T(5, 5)])).toEqual([])
  })

  it('translates all four point fields and preserves scalar fields (rotation 0)', () => {
    const [s] = stampSegments([seg()], [T(10, 20)])
    expect(s.from).toEqual({ x: 11, y: 22 })
    expect(s.to).toEqual({ x: 13, y: 24 })
    expect(s.edgeMidpoint).toEqual({ x: 12, y: 23 })
    expect(s.polygonCenter).toEqual({ x: 10, y: 20 })
    expect(s.polygonId).toBe('p0')
    expect(s.polygonSides).toBe(4)
    expect(s.tileTypeId).toBe('4')
    expect(s.kind).toBe('star-arm')
  })

  it('does not mutate the input segments', () => {
    const base = [seg()]
    const snapshot = structuredClone(base)
    stampSegments(base, [T(10, 20)])
    expect(base).toEqual(snapshot)
  })

  it('emits base.length × stamps.length segments, grouped by stamp in order', () => {
    const base = [seg({ polygonId: 'a' }), seg({ polygonId: 'b' })]
    const out = stampSegments(base, [T(0, 0), T(100, 0)])
    expect(out).toHaveLength(4)
    expect(out.map(s => s.polygonId)).toEqual(['a', 'b', 'a', 'b'])
    // second stamp is offset by +100 in x
    expect(out[2].from).toEqual({ x: 101, y: 2 })
    expect(out[3].to).toEqual({ x: 103, y: 4 })
  })

  it('rotates each point about the origin then translates (90°)', () => {
    // rotation π/2: (x,y) → (-y, x), then + translation
    const [s] = stampSegments([seg()], [T(5, 5, Math.PI / 2)])
    expect(s.from.x).toBeCloseTo(3, 6) // -2 + 5
    expect(s.from.y).toBeCloseTo(6, 6) //  1 + 5
    expect(s.to.x).toBeCloseTo(1, 6)   // -4 + 5
    expect(s.to.y).toBeCloseTo(8, 6)   //  3 + 5
    // origin-centred polygonCenter (0,0) maps to the pure translation
    expect(s.polygonCenter.x).toBeCloseTo(5, 6)
    expect(s.polygonCenter.y).toBeCloseTo(5, 6)
  })
})

const fig = (over: Partial<FigureConfig> = {}): FigureConfig => ({
  type: 'star',
  contactAngle: 67.5,
  lineLength: 1,
  autoLineLength: true,
  ...over,
})

const cfg = (figures: Record<string, FigureConfig> = {}): PatternConfig => ({
  tiling: { type: 'editor', scale: 1 },
  figures,
  strand: { width: 2, color: '#000', background: '#fff' },
})

describe('periodicFastPathEligible', () => {
  it('is eligible when the flag is on, no frame/lattice/vertex-lines, all stamps unrotated', () => {
    expect(periodicFastPathEligible(cfg(), false, false, [T(0, 0), T(10, 0)])).toBe(true)
  })

  it('is vacuously eligible with an empty stamp set (stamps.every is true)', () => {
    expect(periodicFastPathEligible(cfg(), false, false, [])).toBe(true)
  })

  it('is ineligible when a frame is present', () => {
    expect(periodicFastPathEligible(cfg(), true, false, [T(0, 0)])).toBe(false)
  })

  it('is ineligible when the boundary lattice overlay is on', () => {
    expect(periodicFastPathEligible(cfg(), false, true, [T(0, 0)])).toBe(false)
  })

  it('is ineligible when any figure has vertex lines enabled', () => {
    const c = cfg({ '4': fig({ vertexLinesEnabled: true }) })
    expect(periodicFastPathEligible(c, false, false, [T(0, 0)])).toBe(false)
  })

  it('stays eligible when figures exist but none enable vertex lines', () => {
    const c = cfg({ '4': fig({ vertexLinesEnabled: false }), '8': fig() })
    expect(periodicFastPathEligible(c, false, false, [T(0, 0)])).toBe(true)
  })

  it('is ineligible under an active morph, eligible when the morph is disabled or stop-less', () => {
    const morph = {
      enabled: true,
      mode: 'linear' as const,
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      easing: 'linear' as const,
      boundaries: [{ id: 'b0', position: 100, figures: {} }],
    }
    expect(periodicFastPathEligible({ ...cfg(), morph }, false, false, [T(0, 0)])).toBe(false)
    expect(periodicFastPathEligible({ ...cfg(), morph: { ...morph, enabled: false } }, false, false, [T(0, 0)])).toBe(true)
    expect(periodicFastPathEligible({ ...cfg(), morph: { ...morph, boundaries: [] } }, false, false, [T(0, 0)])).toBe(true)
  })

  it('is ineligible when any stamp carries a non-zero rotation', () => {
    expect(periodicFastPathEligible(cfg(), false, false, [T(0, 0), T(10, 0, Math.PI / 3)])).toBe(false)
  })

  it('is ineligible when the periodicity flag is off, even with everything else clear', () => {
    perfFlag.periodicity = false
    expect(periodicFastPathEligible(cfg(), false, false, [T(0, 0)])).toBe(false)
  })
})

// Rosette epic Step 4 (ticket #23) — pins the category dispatch so a
// mis-wired branch (e.g. a merge accidentally routing rosette-patch tilings
// back through runPIC) fails a fast unit test instead of only showing up as
// a silent visual regression on the Gallery's irregular tilings.
describe('runPICForCategory', () => {
  const VP = { x: -150, y: -150, width: 300, height: 300 }

  it('archimedean category dispatches to runPIC', () => {
    const polys = generateTiling(TILINGS['square'], VP, 100)
    expect(runPICForCategory('archimedean', polys, DEFAULT_CONFIG)).toEqual(runPIC(polys, DEFAULT_CONFIG))
  })

  it('rosette-patch category dispatches to runRosettePIC, not runPIC', () => {
    const polys = generateRosettePatch(TILINGS['cairo-pentagonal'], VP, 50)
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'cairo-pentagonal', scale: 50 },
      figures: { '5': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 27.5 } },
    }
    const dispatched = runPICForCategory('rosette-patch', polys, config)
    expect(dispatched).toEqual(runRosettePIC(polys, config))
    // Cairo@27.5 is one of the retired golden cases precisely because
    // runPIC's ray-ray intersection produces a different (degenerate)
    // output than the bisector construction here — a real behavioural
    // check, not just "different function reference".
    expect(dispatched).not.toEqual(runPIC(polys, config))
  })
})
