import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import type { DecorationConfig } from '../types/editor'
import { resolveDecoration } from './resolve'
import { extractVoids } from './voids'
import { scopedKey } from './scopes'
import { centroid } from '../utils/math'

const seg = (x1: number, y1: number, x2: number, y2: number) => ({
  from: { x: x1, y: y1 }, to: { x: x2, y: y2 },
})
const boundBox = (W: number): Vec2[] => [
  { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: W }, { x: 0, y: W },
]

const deco = (over: Partial<DecorationConfig> = {}): DecorationConfig => ({
  version: 1, strandColours: [], voidFills: [], ...over,
})

// Cross partition of a 100×100 bound → 4 congruent 50×50 square Voids.
const crossSegs = [seg(50, 0, 50, 100), seg(0, 50, 100, 50)]

describe('Step 19.2 / Stage 2 — resolveDecoration', () => {
  it('absent decoration → no fills, but voids still keyed for hit-testing', () => {
    const r = resolveDecoration(crossSegs, boundBox(100), undefined)
    expect(r.fills).toEqual([])
    expect(r.voids).toHaveLength(4)
    for (const v of r.voids) {
      expect(v.patchKey).toContain('@')
      expect(v.instanceKey).toContain('@')
    }
  })

  it('congruent: fills every Void sharing a painted signature', () => {
    const sig = extractVoids(crossSegs, boundBox(100))[0].signature
    const r = resolveDecoration(crossSegs, boundBox(100), deco({
      voidFills: [{ scope: 'congruent', key: sig, colour: '#1e6b52' }],
    }))
    expect(r.fills.length).toBe(4)
    for (const f of r.fills) {
      expect(f.colour).toBe('#1e6b52')
      expect(f.polygon.length).toBeGreaterThanOrEqual(3)
    }
  })

  it("congruent '*': fills every Void; specific signatures override", () => {
    const segs = [seg(30, 0, 30, 100)]
    const voids = extractVoids(segs, boundBox(100))
    const small = voids.reduce((a, b) => (a.area < b.area ? a : b))
    const r = resolveDecoration(segs, boundBox(100), deco({
      voidFills: [
        { scope: 'congruent', key: '*', colour: '#aaa' },
        { scope: 'congruent', key: small.signature, colour: '#7d3c98' },
      ],
    }))
    expect(r.fills.length).toBe(2)
    expect(r.fills.map(f => f.colour).sort()).toEqual(['#7d3c98', '#aaa'])
  })

  describe('across-frame gradient underlay (#45)', () => {
    const frameGradient = {
      enabled: true as const, type: 'linear' as const,
      stops: [{ offset: 0, colour: '#900' }, { offset: 1, colour: '#000' }],
      start: { x: 0, y: 0 }, end: { x: 0, y: 100 },
    }

    it('fills every UNPAINTED Void with the world-space gradient (no pose)', () => {
      const r = resolveDecoration(crossSegs, boundBox(100), deco({ frameGradient }))
      expect(r.fills).toHaveLength(4)
      for (const f of r.fills) {
        expect(f.gradient).toEqual(frameGradient)
        expect(f.pose).toBeUndefined() // world-space, not canonical-pose
        expect(f.colour).toBe('#900')  // first stop = representative flat
      }
    })

    it('painted Voids keep their own fill; only the rest get the underlay', () => {
      const target = resolveDecoration(crossSegs, boundBox(100), undefined).voids[0]
      const r = resolveDecoration(crossSegs, boundBox(100), deco({
        frameGradient,
        voidFills: [{ scope: 'instance', key: target.instanceKey, colour: '#0f0' }],
      }))
      expect(r.fills).toHaveLength(4)
      const painted = r.fills.filter(f => f.colour === '#0f0' && !f.gradient)
      const underlay = r.fills.filter(f => f.gradient)
      expect(painted).toHaveLength(1)
      expect(underlay).toHaveLength(3)
    })

    it('a disabled frame gradient produces no underlay', () => {
      const r = resolveDecoration(crossSegs, boundBox(100), deco({
        frameGradient: { ...frameGradient, enabled: false },
      }))
      expect(r.fills).toEqual([])
    })
  })

  it('instance: fills exactly the keyed Void', () => {
    const target = resolveDecoration(crossSegs, boundBox(100), undefined).voids[0]
    const r = resolveDecoration(crossSegs, boundBox(100), deco({
      voidFills: [{ scope: 'instance', key: target.instanceKey, colour: '#c0392b' }],
    }))
    expect(r.fills.length).toBe(1)
    const c = centroid(r.fills[0].polygon)
    expect(scopedKey(target.signature, c)).toBe(target.instanceKey)
  })

  it('patch: fills the Lattice orbit (same offset in every stamp), not the rest', () => {
    // Two stamps at x=0 and x=100, each partitioned into 4 congruent squares.
    const segs = [
      ...crossSegs,
      seg(150, 0, 150, 100), seg(100, 50, 200, 50), seg(100, 0, 100, 100),
    ]
    const bound: Vec2[] = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 },
    ]
    const stamps: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const all = resolveDecoration(segs, bound, undefined, stamps)
    expect(all.voids).toHaveLength(8)
    // Pick a void firmly inside the origin stamp's Voronoi cell (x < 50), so
    // its translate at +100 reduces to the same orbit offset; paint its patch
    // orbit → exactly 2 fills (one per stamp).
    const target = all.voids.find(v => centroid(v.polygon).x < 50)!
    const r = resolveDecoration(segs, bound, deco({
      voidFills: [{ scope: 'patch', key: target.patchKey, colour: '#d4af37' }],
    }), stamps)
    expect(r.fills.length).toBe(2)
    const xs = r.fills.map(f => centroid(f.polygon).x).sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBeCloseTo(100, 1)
  })

  it('precedence: instance beats patch beats congruent', () => {
    const all = resolveDecoration(crossSegs, boundBox(100), undefined)
    const target = all.voids[0]
    const r = resolveDecoration(crossSegs, boundBox(100), deco({
      voidFills: [
        { scope: 'congruent', key: target.signature, colour: '#aaa' },
        { scope: 'patch', key: target.patchKey, colour: '#bbb' },
        { scope: 'instance', key: target.instanceKey, colour: '#ccc' },
      ],
    }))
    // All 4 congruent voids fill; with no stamps every centroid is its own
    // orbit, so the patch record hits only the target; instance overrides it.
    expect(r.fills).toHaveLength(4)
    const colours = r.fills.map(f => f.colour).sort()
    expect(colours).toEqual(['#aaa', '#aaa', '#aaa', '#ccc'])
  })

  it('degenerate bound → empty', () => {
    const r = resolveDecoration(crossSegs, [{ x: 0, y: 0 }], undefined)
    expect(r).toEqual({ fills: [], voids: [] })
  })
})
