import { describe, it, expect, beforeEach } from 'vitest'
import { runPIC } from './index'
import { runRosettePIC } from './rosettePatch'
import { buildStrands } from '../strand/buildStrands'
import { computeCurves } from '../strand/computeCurves'
import { generateTiling, type Viewport } from '../tilings/archimedean'
import { generateTapratsTiling } from '../tilings/tapratsTiling'
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

// The 13 `rosette-patch` tilings dispatch to `runRosettePIC` (see
// `runPICForCategory`), a separate emitter with its own bisector-anchored edge
// construction. It had no extra-set handling at all until 2026-07-31, so a user
// could add a line set to e.g. floret-pentagonal, watch the panel accept it, and
// see nothing render. Every assertion above ran through `runPIC` only, so none
// of them caught it — these pin the second emitter to the same contract.
describe('multi line sets (#42) — rosette-patch emitter', () => {
  const FLORET: PatternConfig['tiling'] = { type: 'floret-pentagonal', scale: 60 }
  const floretPolys = () => generateTapratsTiling('floret-pentagonal', VP, 60)

  it('floret-pentagonal really is on the rosette-patch dispatch', () => {
    // If this ever flips to `archimedean`, the tests below stop covering the
    // bug they were written for.
    expect(TILINGS['floret-pentagonal'].category).toBe('rosette-patch')
  })

  it('an identical-θ edge twin set exactly doubles the segment count', () => {
    const polys = floretPolys()
    const base = runRosettePIC(polys, withFig(FLORET, { 5: fig(72) }))
    const twin = runRosettePIC(polys, withFig(FLORET, { 5: fig(72, { extraSets: [edgeSet('a', 72)] }) }))
    expect(base.length).toBeGreaterThan(0)
    expect(twin.length).toBe(base.length * 2)
  })

  it('an edge set at a different θ emits its own distinct geometry, tagged', () => {
    const polys = floretPolys()
    const segs = runRosettePIC(polys, withFig(FLORET, { 5: fig(72, { extraSets: [edgeSet('a', 40)] }) }))
    const extra = segs.filter(s => s.setId === 'a')
    const primary = segs.filter(s => s.setId === undefined)
    expect(extra.length).toBeGreaterThan(0)
    expect(primary.length).toBeGreaterThan(0)
    // Different θ ⇒ the set is not a copy of the primary.
    const primaryKeys = new Set(primary.map(geomKey))
    expect(extra.some(s => !primaryKeys.has(geomKey(s)))).toBe(true)
  })

  it('vertex and boundary sets emit on this emitter too', () => {
    const polys = floretPolys()
    const segs = runRosettePIC(polys, withFig(FLORET, {
      5: fig(72, { extraSets: [vertexSet('v', 55), boundarySet('b')] }),
    }))
    expect(segs.some(s => s.setId === 'v' && s.kind === 'vertex-line')).toBe(true)
    const boundary = segs.filter(s => s.setId === 'b')
    expect(boundary.length).toBeGreaterThan(0)
    // Field-wide dedupe: a shared tile edge emits once, not once per polygon.
    expect(new Set(boundary.map(geomKey)).size).toBe(boundary.length)
  })

  it('a disabled set emits nothing', () => {
    const polys = floretPolys()
    const base = runRosettePIC(polys, withFig(FLORET, { 5: fig(72) }))
    const disabled = runRosettePIC(polys, withFig(FLORET, {
      5: fig(72, { extraSets: [edgeSet('a', 40, { enabled: false })] }),
    }))
    expect(disabled.length).toBe(base.length)
  })

  it('setless output is byte-identical to pre-extraction', () => {
    const polys = floretPolys()
    const none = runRosettePIC(polys, withFig(FLORET, { 5: fig(72) }))
    const empty = runRosettePIC(polys, withFig(FLORET, { 5: fig(72, { extraSets: [] }) }))
    expect(empty).toEqual(none)
    for (const s of none) expect('setId' in s).toBe(false)
  })

  it('no strand mixes segments from different sets', () => {
    const polys = floretPolys()
    const segs = runRosettePIC(polys, withFig(FLORET, {
      5: fig(72, { extraSets: [edgeSet('a', 40), vertexSet('v', 55)] }),
    }))
    const strands = buildStrands(segs)
    expect(strands.length).toBeGreaterThan(0)
    for (const sd of strands) {
      expect(new Set(sd.segmentIndices.map(i => segs[i].setId)).size).toBe(1)
    }
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

// Alternating curves on a `boundary` set were broken two ways at once, both
// fixed 2026-07-31 and both invisible to a unit test that only fed synthetic
// segments through computeCurves — they need the real emitter.
describe('multi line sets (#42) — boundary sets and alternating curves', () => {
  it('boundary segments carry no `side` — there is no ± ray to take one from', () => {
    const polys = squarePolys()
    const segs = runPIC(polys, withFig(SQUARE, { 4: fig(67.5, { extraSets: [boundarySet('b')] }) }))
    const boundary = segs.filter(s => s.setId === 'b')
    expect(boundary.length).toBeGreaterThan(0)
    expect(boundary.every(s => !('side' in s))).toBe(true)
    // The primary is ray-derived and still tags every segment.
    expect(segs.filter(s => s.setId === undefined).every(s => !!s.side)).toBe(true)
  })

  it('a boundary curve bulges consistently, not by floating-point noise', () => {
    // The orientation reference used to be the CW tangent, which is exactly
    // perpendicular to an outline segment's normal (dot ~1e-15): every tile
    // edge picked its bulge direction from rounding error. With alternating
    // OFF every edge of one tile must now bulge the same way.
    const polys = squarePolys()
    const curve = { enabled: true, alternating: false, points: [{ position: 0.5, offset: 0.2 }] }
    const cfg = withFig(SQUARE, { 4: fig(67.5, { extraSets: [boundarySet('b', { curve })] }) })
    const segs = runPIC(polys, cfg)
    const strands = buildStrands(segs)
    const curves = computeCurves(strands, segs, cfg)

    let checked = 0
    for (let si = 0; si < strands.length; si++) {
      const sd = strands[si]
      for (let i = 0; i < sd.segmentIndices.length; i++) {
        const seg = segs[sd.segmentIndices[i]]
        if (seg.setId !== 'b') continue
        const cp = curves[si].curves[i]
        if (!cp) continue
        // Outward from the owning tile's centre, for every edge.
        const from = sd.points[i], to = sd.points[i + 1]
        const base = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
        const rBase = Math.hypot(base.x - seg.polygonCenter.x, base.y - seg.polygonCenter.y)
        const rCp = Math.hypot(cp[0].x - seg.polygonCenter.x, cp[0].y - seg.polygonCenter.y)
        expect(rCp).toBeGreaterThan(rBase)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('with alternating ON, consecutive Rays along a boundary strand flip', () => {
    const polys = squarePolys()
    const curve = { enabled: true, alternating: true, points: [{ position: 0.5, offset: 0.2 }] }
    const cfg = withFig(SQUARE, { 4: fig(67.5, { extraSets: [boundarySet('b', { curve })] }) })
    const segs = runPIC(polys, cfg)
    const strands = buildStrands(segs)
    const curved = computeCurves(strands, segs, cfg)

    let chainsChecked = 0
    for (let si = 0; si < strands.length; si++) {
      const sd = strands[si]
      if (segs[sd.segmentIndices[0]]?.setId !== 'b') continue
      const first = sd.points[0], last = sd.points[sd.points.length - 1]
      const closed = Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6
      if (closed && sd.segmentIndices.length % 2 === 1) continue  // not 2-colourable
      const signs: number[] = []
      for (let i = 0; i < sd.segmentIndices.length; i++) {
        const seg = segs[sd.segmentIndices[i]]
        const cp = curved[si].curves[i]
        if (!cp) { signs.push(0); continue }
        const from = sd.points[i], to = sd.points[i + 1]
        const base = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
        const rBase = Math.hypot(base.x - seg.polygonCenter.x, base.y - seg.polygonCenter.y)
        const rCp = Math.hypot(cp[0].x - seg.polygonCenter.x, cp[0].y - seg.polygonCenter.y)
        signs.push(Math.sign(rCp - rBase))
      }
      if (signs.length < 2) continue
      for (let i = 1; i < signs.length; i++) expect(signs[i]).toBe(-signs[i - 1])
      chainsChecked++
    }
    expect(chainsChecked).toBeGreaterThan(0)
  })
})
