import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../utils/math'
import { cellFramesFromOutlines, cellScopedKey } from './cellScope'
import { resolveDecoration } from './resolve'
import { centroid } from '../utils/math'
import type { DecorationConfig } from '../types/editor'

// A 100×100 square cell outline, vertex 0 at the bottom-left corner.
const squareOutline: Vec2[] = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
]

describe('cellFramesFromOutlines', () => {
  it('derives centre, side count, and vertex angle per outline', () => {
    const [f] = cellFramesFromOutlines([squareOutline])
    expect(f.tag).toBe('c0')
    expect(f.centre).toEqual({ x: 50, y: 50 })
    expect(f.n).toBe(4)
    expect(f.theta0).toBeCloseTo(Math.atan2(-50, -50))
  })

  it('skips degenerate outlines but keeps index-derived tags', () => {
    const frames = cellFramesFromOutlines([[{ x: 0, y: 0 }], squareOutline])
    expect(frames).toHaveLength(1)
    expect(frames[0].tag).toBe('c1')
  })
})

describe('cellScopedKey', () => {
  const frames = cellFramesFromOutlines([squareOutline])

  it('gives D4 orbit twins one key', () => {
    // (20, 35) relative to centre (50,50) is (−30, −15). Its D4 images about
    // the centre include the 90°-rotated (65, 20) and the mirror (35, 20)
    // (reflection across the vertical axis is in D4 for this outline).
    const base = cellScopedKey('sig', { x: 20, y: 35 }, frames)
    const rotated = cellScopedKey('sig', { x: 65, y: 20 }, frames)
    const mirrored = cellScopedKey('sig', { x: 80, y: 35 }, frames)
    expect(rotated).toBe(base)
    expect(mirrored).toBe(base)
  })

  it('distinguishes positions in different orbits', () => {
    const a = cellScopedKey('sig', { x: 20, y: 35 }, frames)
    const b = cellScopedKey('sig', { x: 20, y: 40 }, frames)
    expect(b).not.toBe(a)
  })

  it('distinguishes signatures and host cells', () => {
    const twoCells = cellFramesFromOutlines([
      squareOutline,
      squareOutline.map(v => ({ x: v.x + 200, y: v.y })),
    ])
    const a = cellScopedKey('sig', { x: 20, y: 35 }, twoCells)
    const b = cellScopedKey('sig', { x: 220, y: 35 }, twoCells)
    expect(a).toContain('#c0@')
    expect(b).toContain('#c1@')
    expect(cellScopedKey('other', { x: 20, y: 35 }, twoCells)).not.toBe(a)
  })

  it('is stable under small float noise', () => {
    const a = cellScopedKey('sig', { x: 20, y: 35 }, frames)
    const b = cellScopedKey('sig', { x: 20 + 1e-9, y: 35 - 1e-9 }, frames)
    expect(b).toBe(a)
  })
})

describe('resolveDecoration — cell rung', () => {
  const deco = (over: Partial<DecorationConfig> = {}): DecorationConfig => ({
    version: 1, strandColours: [], voidFills: [], ...over,
  })
  const frames = cellFramesFromOutlines([squareOutline])
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
    // Congruent reach: both 20-strips fill.
    const cong = resolveDecoration(segs, squareOutline, deco({
      voidFills: [{ scope: 'congruent', key: strip20.signature, colour: '#aaa' }],
    }), [], frames)
    expect(cong.fills).toHaveLength(2)
    // Cell reach: only the clicked strip (its twins don't exist).
    const cell = resolveDecoration(segs, squareOutline, deco({
      voidFills: [{ scope: 'cell', key: strip20.cellKey, colour: '#bbb' }],
    }), [], frames)
    expect(cell.fills).toHaveLength(1)
    expect(Math.abs(centroid(cell.fills[0].polygon).y - 20)).toBeLessThan(1)
  })

  it('fills the whole symmetry orbit with one key', () => {
    // Strips symmetric about y=50: 0–10, 10–30, 30–70, 70–90, 90–100. The two
    // 20-strips ARE mirror twins → one cell key fills both.
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
    // Both twins fill; the clicked one resolves at patch, its mirror at cell.
    const byY = new Map(r.fills.map(f => [Math.round(centroid(f.polygon).y / 10) * 10, f.colour]))
    expect(byY.get(20)).toBe('#ccc')
    expect(byY.get(80)).toBe('#bbb')
  })
})
