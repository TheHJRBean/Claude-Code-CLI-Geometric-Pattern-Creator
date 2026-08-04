import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../utils/math'
import { keyVoids, type KeyedVoid } from './resolve'
import { signedArea, voidSignature, type VoidRegion } from './voids'
import { applyVoidMerges, buildVoidMergeRecord, removeMergeAt } from './voidMerge'

const LENGTH_SNAP = 0.5
const ANGLE_SNAP = (0.5 * Math.PI) / 180

const region = (polygon: Vec2[]): VoidRegion => ({
  polygon,
  area: Math.abs(signedArea(polygon)),
  signature: voidSignature(polygon, LENGTH_SNAP, ANGLE_SNAP),
})

const field = (polys: Vec2[][]): KeyedVoid[] => keyVoids(polys.map(region), [], [])

/** Unit squares are congruent AND self-symmetric — the hard case for the
 * canonical-pose matcher, which has to try every tied pose. Sized well above
 * the 0.5 length snap so the signature is a real class, not noise. */
const sq = (x: number, y: number, s = 4): Vec2[] => [
  { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
]

const rot = (p: Vec2, a: number, o: Vec2 = { x: 0, y: 0 }): Vec2 => ({
  x: o.x + Math.cos(a) * (p.x - o.x) - Math.sin(a) * (p.y - o.y),
  y: o.y + Math.sin(a) * (p.x - o.x) + Math.cos(a) * (p.y - o.y),
})

/** A scalene right triangle — no self-symmetry, so its canonical pose is
 * unique and a combine anchored on it is unambiguous. */
const tri = (x: number, y: number): Vec2[] => [
  { x, y }, { x: x + 4, y }, { x, y: y + 7 },
]
/** The square sharing that triangle's vertical leg. */
const legSquare = (x: number, y: number): Vec2[] => [
  { x: x - 7, y }, { x, y }, { x, y: y + 7 }, { x: x - 7, y: y + 7 },
]

describe('applyVoidMerges', () => {
  it('fuses an adjacent pair into one Void carrying the union outline', () => {
    const f = field([sq(0, 0), sq(4, 0), sq(20, 20)])
    const rec = buildVoidMergeRecord([f[0], f[1]], 'instance')!
    const out = applyVoidMerges(f, [rec], [])
    expect(out).toHaveLength(2)
    const merged = out.find(v => v.mergedCount)!
    expect(merged.mergedCount).toBe(2)
    expect(merged.area).toBeCloseTo(32, 6)
    expect(Math.abs(signedArea(merged.polygon))).toBeCloseTo(32, 6)
    expect(merged.seams).toHaveLength(1)
    // The lone far square is untouched.
    expect(out.filter(v => !v.mergedCount)).toHaveLength(1)
  })

  it('gives the composite a signature of its own shape, not its members', () => {
    const f = field([sq(0, 0), sq(4, 0)])
    const merged = applyVoidMerges(f, [buildVoidMergeRecord([f[0], f[1]], 'instance')!], [])[0]
    expect(merged.signature).not.toBe(f[0].signature)
    // …and congruent to a domino built anywhere else in the field.
    const domino = region([{ x: 50, y: 50 }, { x: 58, y: 50 }, { x: 58, y: 54 }, { x: 50, y: 54 }])
    expect(merged.signature).toBe(domino.signature)
  })

  it('at the instance rung combines only the pair that was clicked', () => {
    const f = field([sq(0, 0), sq(4, 0), sq(0, 4), sq(4, 4)])
    const out = applyVoidMerges(f, [buildVoidMergeRecord([f[0], f[1]], 'instance')!], [])
    expect(out.filter(v => v.mergedCount)).toHaveLength(1)
    expect(out.filter(v => !v.mergedCount)).toHaveLength(2)
  })

  it('at the congruent rung repeats the combine across the field', () => {
    // Four separated pairs of the same two shapes. One combine, four composites.
    const polys: Vec2[][] = []
    for (const [ox, oy] of [[0, 0], [40, 0], [0, 40], [40, 40]]) {
      polys.push(tri(ox, oy), legSquare(ox, oy))
    }
    const f = field(polys)
    const rec = buildVoidMergeRecord([f[0], f[1]], 'congruent')!
    const out = applyVoidMerges(f, [rec], [])
    expect(out.filter(v => v.mergedCount === 2)).toHaveLength(4)
    expect(out.filter(v => !v.mergedCount)).toHaveLength(0)
  })

  it('carries a congruent combine onto a rotated instance', () => {
    const a = 0.6435 // arbitrary, not a lattice angle
    const o = { x: 40, y: 40 }
    const f = field([
      tri(0, 0), legSquare(0, 0),
      tri(40, 40).map(p => rot(p, a, o)), legSquare(40, 40).map(p => rot(p, a, o)),
    ])
    const out = applyVoidMerges(f, [buildVoidMergeRecord([f[0], f[1]], 'congruent')!], [])
    expect(out.filter(v => v.mergedCount === 2)).toHaveLength(2)
  })

  it('carries a congruent combine onto a mirrored instance', () => {
    const mirror = (p: Vec2): Vec2 => ({ x: 80 - p.x, y: p.y })
    const f = field([
      tri(0, 0), legSquare(0, 0),
      tri(40, 40).map(mirror), legSquare(40, 40).map(mirror),
    ])
    const out = applyVoidMerges(f, [buildVoidMergeRecord([f[0], f[1]], 'congruent')!], [])
    expect(out.filter(v => v.mergedCount === 2)).toHaveLength(2)
  })

  it('leaves the field alone when a record finds no members', () => {
    const f = field([sq(0, 0), sq(4, 0)])
    const stale = buildVoidMergeRecord([f[0], f[1]], 'instance')!
    const moved = field([sq(100, 100), sq(300, 300)])
    expect(applyVoidMerges(moved, [stale], [])).toBe(moved)
  })

  it('refuses to fuse members that are not edge-adjacent', () => {
    const f = field([sq(0, 0), sq(20, 0)])
    const rec = buildVoidMergeRecord([f[0], f[1]], 'instance')!
    // Both members resolve, but they union to two loops — not one shape.
    expect(applyVoidMerges(f, [rec], [])).toBe(f)
  })

  it('gives a Void to at most one group when records overlap', () => {
    const f = field([sq(0, 0), sq(4, 0), sq(8, 0)])
    const first = buildVoidMergeRecord([f[0], f[1]], 'instance')!
    const second = buildVoidMergeRecord([f[1], f[2]], 'instance')!
    const out = applyVoidMerges(f, [first, second], [])
    expect(out.filter(v => v.mergedCount)).toHaveLength(1)
    expect(out.filter(v => !v.mergedCount)).toHaveLength(1)
  })

  it('rings an unselected Void as a hole', () => {
    const polys: Vec2[][] = []
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) polys.push(sq(i * 4, j * 4))
    }
    const f = field(polys)
    const centre = f.findIndex(v => Math.abs(v.centre.x - 6) < 0.01 && Math.abs(v.centre.y - 6) < 0.01)
    const ring = f.filter((_, i) => i !== centre)
    const out = applyVoidMerges(f, [buildVoidMergeRecord(ring, 'instance')!], [])
    const merged = out.find(v => v.mergedCount)!
    expect(merged.mergedCount).toBe(8)
    expect(merged.holes).toHaveLength(1)
  })

  it('is a no-op without records', () => {
    const f = field([sq(0, 0), sq(4, 0)])
    expect(applyVoidMerges(f, undefined, [])).toBe(f)
    expect(applyVoidMerges(f, [], [])).toBe(f)
  })
})

describe('buildVoidMergeRecord', () => {
  it('refuses a selection of fewer than two Voids', () => {
    const f = field([sq(0, 0)])
    expect(buildVoidMergeRecord(f, 'instance')).toBeNull()
  })

  it('picks the same anchor however the selection is ordered', () => {
    const f = field([tri(0, 0), legSquare(0, 0)])
    const a = buildVoidMergeRecord([f[0], f[1]], 'congruent')!
    const b = buildVoidMergeRecord([f[1], f[0]], 'congruent')!
    expect(b).toEqual(a)
  })
})

describe('removeMergeAt', () => {
  it('drops the record that made the clicked composite', () => {
    const f = field([sq(0, 0), sq(4, 0), sq(0, 4), sq(4, 4)])
    const merges = [
      buildVoidMergeRecord([f[0], f[1]], 'instance')!,
      buildVoidMergeRecord([f[2], f[3]], 'instance')!,
    ]
    const out = applyVoidMerges(f, merges, [])
    const clicked = out.filter(v => v.mergedCount)[1]
    const kept = removeMergeAt(merges, clicked)
    expect(kept).toHaveLength(1)
    expect(applyVoidMerges(f, kept, []).filter(v => v.mergedCount)).toHaveLength(1)
  })

  it('is a no-op on a Void that was never combined', () => {
    const f = field([sq(0, 0), sq(4, 0)])
    const merges = [buildVoidMergeRecord([f[0], f[1]], 'instance')!]
    expect(removeMergeAt(merges, f[0])).toBe(merges)
  })
})
