import { describe, it, expect, beforeEach } from 'vitest'
import { runPIC } from './index'
import { buildStrands } from '../strand/buildStrands'
import { generateTiling, type Viewport } from '../tilings/archimedean'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { resetIds } from '../tilings/shared'
import { loadPatternConfig } from '../state/configValidation'
import type { FigureConfig, FigureLineSet, PatternConfig } from '../types/pattern'

// Ticket #42 — multi line sets. A Figure recipe can carry additional edge /
// vertex line sets emitted from the same origins as the primary figure, each
// with its own θ / length / curve. These pin the engine contract: sets emit
// independently, chain within-set, survive dedup as distinct lines, tag their
// output with `setId`, and leave setless output byte-identical to pre-#42.

beforeEach(() => resetIds())

const VP: Viewport = { x: -150, y: -150, width: 300, height: 300 }

const fig = (contactAngle: number, over: Partial<FigureConfig> = {}): FigureConfig =>
  ({ type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle, ...over })

const edgeSet = (id: string, contactAngle: number, over: Partial<FigureLineSet> = {}): FigureLineSet =>
  ({ id, kind: 'edge', contactAngle, lineLength: 1.0, autoLineLength: true, ...over })

const vertexSet = (id: string, contactAngle: number, over: Partial<FigureLineSet> = {}): FigureLineSet =>
  ({ id, kind: 'vertex', contactAngle, lineLength: 1.0, autoLineLength: true, ...over })

const boundarySet = (id: string, over: Partial<FigureLineSet> = {}): FigureLineSet =>
  ({ id, kind: 'boundary', contactAngle: 67.5, lineLength: 1.0, autoLineLength: true, ...over })

const withFig = (tiling: PatternConfig['tiling'], figures: Record<string, FigureConfig>): PatternConfig =>
  ({ ...DEFAULT_CONFIG, tiling, figures })

const SQUARE: PatternConfig['tiling'] = { type: 'square', scale: 100 }
const HEX: PatternConfig['tiling'] = { type: 'hexagonal', scale: 80 }
const squarePolys = () => generateTiling(TILINGS['square'], VP, 100)
const hexPolys = () => generateTiling(TILINGS['hexagonal'], VP, 80)

/** Endpoint-order-independent rounded key for a segment's geometry. */
function geomKey(s: { from: { x: number; y: number }; to: { x: number; y: number } }): string {
  const r = (n: number) => Math.round(n * 1000)
  const a = `${r(s.from.x)},${r(s.from.y)}`
  const b = `${r(s.to.x)},${r(s.to.y)}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

describe('multi line sets (#42) — emission scaling', () => {
  it('an identical-θ edge twin set exactly doubles the segment count (square)', () => {
    const polys = squarePolys()
    const base = runPIC(polys, withFig(SQUARE, { 4: fig(67.5) }))
    const twin = runPIC(polys, withFig(SQUARE, { 4: fig(67.5, { extraSets: [edgeSet('a', 67.5)] }) }))
    expect(base.length).toBeGreaterThan(0)
    expect(twin.length).toBe(base.length * 2)
  })

  it('two identical edge twin sets triple the count (hexagonal)', () => {
    const polys = hexPolys()
    const base = runPIC(polys, withFig(HEX, { 6: fig(60) }))
    const tripled = runPIC(polys, withFig(HEX, {
      6: fig(60, { extraSets: [edgeSet('a', 60), edgeSet('b', 60)] }),
    }))
    expect(base.length).toBeGreaterThan(0)
    expect(tripled.length).toBe(base.length * 3)
  })

  it('a disabled set emits nothing', () => {
    const polys = squarePolys()
    const base = runPIC(polys, withFig(SQUARE, { 4: fig(67.5) }))
    const disabled = runPIC(polys, withFig(SQUARE, {
      4: fig(67.5, { extraSets: [edgeSet('a', 50, { enabled: false })] }),
    }))
    expect(disabled.length).toBe(base.length)
  })

  it('a vertex extra set adds vertex-line segments to an edge-only primary', () => {
    const polys = squarePolys()
    const base = runPIC(polys, withFig(SQUARE, { 4: fig(67.5) }))
    const withVtx = runPIC(polys, withFig(SQUARE, { 4: fig(67.5, { extraSets: [vertexSet('v', 55)] }) }))
    expect(withVtx.length).toBeGreaterThan(base.length)
    expect(withVtx.some(s => s.setId === 'v' && s.kind === 'vertex-line')).toBe(true)
  })
})

describe('multi line sets — boundary (tile-to-strand) sets', () => {
  it('a boundary set emits each tile edge exactly once, tagged with its setId', () => {
    const polys = squarePolys()
    const base = runPIC(polys, withFig(SQUARE, { 4: fig(67.5) }))
    const segs = runPIC(polys, withFig(SQUARE, { 4: fig(67.5, { extraSets: [boundarySet('b')] }) }))
    const boundary = segs.filter(s => s.setId === 'b')
    expect(boundary.length).toBeGreaterThan(0)
    expect(segs.length - boundary.length).toBe(base.length)
    // Field-wide dedupe: a shared edge between two squares emits once, so no
    // two boundary segments share the same geometry.
    const keys = new Set(boundary.map(geomKey))
    expect(keys.size).toBe(boundary.length)
    // Every boundary segment lies on a polygon edge (endpoints are vertices).
    const vertexKeys = new Set<string>()
    for (const p of polys) for (const v of p.vertices) {
      vertexKeys.add(`${Math.round(v.x * 1000)},${Math.round(v.y * 1000)}`)
    }
    for (const s of boundary) {
      expect(vertexKeys.has(`${Math.round(s.from.x * 1000)},${Math.round(s.from.y * 1000)}`)).toBe(true)
      expect(vertexKeys.has(`${Math.round(s.to.x * 1000)},${Math.round(s.to.y * 1000)}`)).toBe(true)
    }
  })

  it('boundary segments chain into strands without mixing with the primary', () => {
    const polys = hexPolys()
    const segs = runPIC(polys, withFig(HEX, { 6: fig(60, { extraSets: [boundarySet('b')] }) }))
    const strands = buildStrands(segs)
    for (const sd of strands) {
      const setIds = new Set(sd.segmentIndices.map(i => segs[i].setId))
      expect(setIds.size).toBe(1)
    }
    // At least one strand is made purely of boundary segments.
    expect(strands.some(sd => segs[sd.segmentIndices[0]].setId === 'b')).toBe(true)
  })
})

describe('multi line sets (#42) — strand chaining stays within-set', () => {
  it('no strand mixes segments from different sets', () => {
    const polys = squarePolys()
    const segs = runPIC(polys, withFig(SQUARE, {
      4: fig(67.5, { extraSets: [edgeSet('a', 50), vertexSet('v', 55)] }),
    }))
    const strands = buildStrands(segs)
    expect(strands.length).toBeGreaterThan(0)
    for (const sd of strands) {
      const setIds = new Set(sd.segmentIndices.map(i => segs[i].setId))
      expect(setIds.size).toBe(1)
    }
  })
})

describe('multi line sets (#42) — dedup is set-scoped', () => {
  it('equal-θ twin sets are kept as coincident distinct segments', () => {
    const polys = squarePolys()
    const segs = runPIC(polys, withFig(SQUARE, { 4: fig(67.5, { extraSets: [edgeSet('a', 67.5)] }) }))
    const primary = segs.filter(s => s.setId === undefined)
    const extra = segs.filter(s => s.setId === 'a')
    expect(extra.length).toBeGreaterThan(0)
    expect(primary.length).toBe(extra.length)
    // Every primary segment has a coincident twin in the extra set — proof the
    // dedup did NOT collapse across sets.
    const extraKeys = new Set(extra.map(geomKey))
    for (const p of primary) expect(extraKeys.has(geomKey(p))).toBe(true)
  })

  it('within a single set the collinear double-emission still collapses (triangles @60°)', () => {
    const polys = generateTiling(TILINGS['triangular'], VP, 60)
    const segs = runPIC(polys, withFig({ type: 'triangular', scale: 60 }, {
      3: fig(60, { extraSets: [edgeSet('a', 60)] }),
    }))
    // Per set, per polygon: no two segments share both endpoints.
    for (const sid of [undefined, 'a']) {
      const byPoly = new Map<string, Set<string>>()
      for (const s of segs) {
        if (s.setId !== sid) continue
        const seen = byPoly.get(s.polygonId) ?? new Set<string>()
        const k = geomKey(s)
        expect(seen.has(k)).toBe(false)
        seen.add(k)
        byPoly.set(s.polygonId, seen)
      }
    }
  })
})

describe('multi line sets (#42) — setId tagging', () => {
  it('extra-set segments carry their setId; primary segments omit the property', () => {
    const polys = squarePolys()
    const segs = runPIC(polys, withFig(SQUARE, { 4: fig(67.5, { extraSets: [edgeSet('x', 50)] }) }))
    const tagged = segs.filter(s => 'setId' in s)
    expect(tagged.length).toBeGreaterThan(0)
    expect(tagged.every(s => s.setId === 'x')).toBe(true)
    // Primary segments exist and carry no setId key at all.
    expect(segs.length).toBeGreaterThan(tagged.length)
  })
})

describe('multi line sets (#42) — setless output unchanged', () => {
  it('empty extraSets is identical to no extraSets, with no setId property', () => {
    const polys = squarePolys()
    const none = runPIC(polys, withFig(SQUARE, { 4: fig(67.5) }))
    const empty = runPIC(polys, withFig(SQUARE, { 4: fig(67.5, { extraSets: [] }) }))
    expect(empty).toEqual(none)
    for (const s of none) expect('setId' in s).toBe(false)
  })
})

describe('multi line sets (#42) — save/load round-trip', () => {
  it('extraSets survive a JSON round-trip through loadPatternConfig', () => {
    const config = withFig(SQUARE, {
      4: fig(67.5, {
        extraSets: [
          edgeSet('a', 50, { curve: { enabled: true, points: [{ position: 0.5, offset: 0.2 }] } }),
          vertexSet('v', 55),
        ],
      }),
    })
    const round = loadPatternConfig(JSON.parse(JSON.stringify(config)))
    const sets = round.figures['4'].extraSets
    expect(sets).toBeDefined()
    expect(sets!.length).toBe(2)
    expect(sets![0]).toMatchObject({ id: 'a', kind: 'edge', contactAngle: 50 })
    expect(sets![0].curve?.enabled).toBe(true)
    expect(sets![1]).toMatchObject({ id: 'v', kind: 'vertex', contactAngle: 55 })
  })

  it('a legacy config with no extraSets still loads', () => {
    const legacy = withFig(SQUARE, { 4: fig(67.5) })
    const round = loadPatternConfig(JSON.parse(JSON.stringify(legacy)))
    expect(round.figures['4'].extraSets).toBeUndefined()
  })
})
