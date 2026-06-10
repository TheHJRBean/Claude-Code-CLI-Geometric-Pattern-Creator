import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../utils/math'
import { cellFramesFromOutlines, cellOrbitKey, reduceToOrbit } from './cellScope'
import { resolveDecoration } from './resolve'
import { centroid } from '../utils/math'
import type { DecorationConfig } from '../types/editor'

// A 100×100 square cell outline, vertex 0 at the bottom-left corner.
const squareOutline: Vec2[] = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
]
const frames = cellFramesFromOutlines([squareOutline])

const rotAboutCentre = (p: Vec2): Vec2 => ({ x: 100 - p.y, y: p.x }) // +90° about (50,50)
const mirrorVertical = (p: Vec2): Vec2 => ({ x: 100 - p.x, y: p.y }) // axis x=50

const key = (poly: Vec2[], sig = 'sig') => cellOrbitKey(sig, poly, true, centroid(poly), frames)

describe('cellFramesFromOutlines', () => {
  it('derives centre, side count, and vertex angle per outline', () => {
    const [f] = frames
    expect(f.tag).toBe('c0')
    expect(f.centre).toEqual({ x: 50, y: 50 })
    expect(f.n).toBe(4)
    expect(f.theta0).toBeCloseTo(Math.atan2(-50, -50))
  })

  it('skips degenerate outlines but keeps index-derived tags', () => {
    const fs = cellFramesFromOutlines([[{ x: 0, y: 0 }], squareOutline])
    expect(fs).toHaveLength(1)
    expect(fs[0].tag).toBe('c1')
  })
})

describe('cellOrbitKey', () => {
  // An asymmetric triangle, off-centre.
  const tri: Vec2[] = [{ x: 60, y: 55 }, { x: 70, y: 55 }, { x: 60, y: 75 }]

  it('gives D4 orbit twins one key (rotation + mirror)', () => {
    const base = key(tri)
    expect(key(tri.map(rotAboutCentre))).toBe(base)
    expect(key(tri.map(mirrorVertical))).toBe(base)
    // Start-vertex choice must not matter.
    expect(key([tri[1], tri[2], tri[0]])).toBe(base)
  })

  it('distinguishes congruent shapes that no cell symmetry maps onto each other', () => {
    const translated = tri.map(p => ({ x: p.x + 7, y: p.y + 3 }))
    expect(key(translated)).not.toBe(key(tri))
  })

  it('REGRESSION: same-centroid congruent shapes are NOT twins unless a symmetry maps them', () => {
    // Both rectangles are centred exactly on the cell centre. The 90°-rotated
    // one IS a D4 image; the 45°-rotated one is NOT (a centroid-only key
    // collapsed all three — the original over-grouping bug).
    const rect: Vec2[] = [{ x: 40, y: 45 }, { x: 60, y: 45 }, { x: 60, y: 55 }, { x: 40, y: 55 }]
    const rect90 = rect.map(rotAboutCentre)
    const rot45 = (p: Vec2): Vec2 => {
      const dx = p.x - 50, dy = p.y - 50
      const c = Math.SQRT1_2
      return { x: 50 + c * dx - c * dy, y: 50 + c * dx + c * dy }
    }
    const rect45 = rect.map(rot45)
    expect(key(rect90)).toBe(key(rect))
    expect(key(rect45)).not.toBe(key(rect))
  })

  it('is stable under small float noise', () => {
    const noisy = tri.map(p => ({ x: p.x + 1e-9, y: p.y - 1e-9 }))
    expect(key(noisy)).toBe(key(tri))
  })

  it('distinguishes signatures and host cells', () => {
    const twoCells = cellFramesFromOutlines([
      squareOutline,
      squareOutline.map(v => ({ x: v.x + 200, y: v.y })),
    ])
    const triB = tri.map(p => ({ x: p.x + 200, y: p.y }))
    const a = cellOrbitKey('sig', tri, true, centroid(tri), twoCells)
    const b = cellOrbitKey('sig', triB, true, centroid(triB), twoCells)
    expect(a).toContain('#c0:')
    expect(b).toContain('#c1:')
    expect(cellOrbitKey('other', tri, true, centroid(tri), twoCells)).not.toBe(a)
  })

  it('reduceToOrbit shifts points by the centroid→orbit translation', () => {
    const moved = reduceToOrbit(tri, { x: 265, y: 155 }, { x: 65, y: 55 })
    expect(moved[0]).toEqual({ x: -140, y: -45 })
  })

  it('open chains canonicalise over traversal direction', () => {
    const chain: Vec2[] = [{ x: 60, y: 55 }, { x: 70, y: 55 }, { x: 70, y: 70 }]
    const fwd = cellOrbitKey('sig', chain, false, centroid(chain), frames)
    const rev = cellOrbitKey('sig', chain.slice().reverse(), false, centroid(chain), frames)
    expect(rev).toBe(fwd)
  })
})

describe('resolveDecoration — cell rung', () => {
  const deco = (over: Partial<DecorationConfig> = {}): DecorationConfig => ({
    version: 1, strandColours: [], voidFills: [], ...over,
  })
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({
    from: { x: x1, y: y1 }, to: { x: x2, y: y2 },
  })

  it('fills mirror twins but not unrelated congruent voids', () => {
    // Horizontal strips: 0–10, 10–30, 30–40, 40–60, 60–100. The two 20-high
    // strips (10–30 and 40–60) are CONGRUENT but NOT symmetry twins (the
    // mirror of 10–30 about y=50 is 70–90, which isn't a void here).
    const segs = [seg(0, 10, 100, 10), seg(0, 30, 100, 30), seg(0, 40, 100, 40), seg(0, 60, 100, 60)]
    const all = resolveDecoration(segs, squareOutline, undefined, [], frames)
    const strip20 = all.voids.find(v => Math.abs(centroid(v.polygon).y - 20) < 1)!
    const cong = resolveDecoration(segs, squareOutline, deco({
      voidFills: [{ scope: 'congruent', key: strip20.signature, colour: '#aaa' }],
    }), [], frames)
    expect(cong.fills).toHaveLength(2)
    const cell = resolveDecoration(segs, squareOutline, deco({
      voidFills: [{ scope: 'cell', key: strip20.cellKey, colour: '#bbb' }],
    }), [], frames)
    expect(cell.fills).toHaveLength(1)
    expect(Math.abs(centroid(cell.fills[0].polygon).y - 20)).toBeLessThan(1)
  })

  it('fills the whole symmetry orbit with one key', () => {
    // Strips symmetric about y=50: the two 20-strips ARE mirror twins.
    const segs = [seg(0, 10, 100, 10), seg(0, 30, 100, 30), seg(0, 70, 100, 70), seg(0, 90, 100, 90)]
    const all = resolveDecoration(segs, squareOutline, undefined, [], frames)
    const strip20 = all.voids.find(v => Math.abs(centroid(v.polygon).y - 20) < 1)!
    const r = resolveDecoration(segs, squareOutline, deco({
      voidFills: [{ scope: 'cell', key: strip20.cellKey, colour: '#d4af37' }],
    }), [], frames)
    expect(r.fills).toHaveLength(2)
    const ys = r.fills.map(f => centroid(f.polygon).y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(20, 0)
    expect(ys[1]).toBeCloseTo(80, 0)
  })

  it('precedence: patch beats cell beats congruent', () => {
    const segs = [seg(0, 10, 100, 10), seg(0, 30, 100, 30), seg(0, 70, 100, 70), seg(0, 90, 100, 90)]
    const all = resolveDecoration(segs, squareOutline, undefined, [], frames)
    const strip20 = all.voids.find(v => Math.abs(centroid(v.polygon).y - 20) < 1)!
    const r = resolveDecoration(segs, squareOutline, deco({
      voidFills: [
        { scope: 'congruent', key: strip20.signature, colour: '#aaa' },
        { scope: 'cell', key: strip20.cellKey, colour: '#bbb' },
        { scope: 'patch', key: strip20.patchKey, colour: '#ccc' },
      ],
    }), [], frames)
    const byY = new Map(r.fills.map(f => [Math.round(centroid(f.polygon).y / 10) * 10, f.colour]))
    expect(byY.get(20)).toBe('#ccc')
    expect(byY.get(80)).toBe('#bbb')
  })
})
