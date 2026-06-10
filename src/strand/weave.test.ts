import { describe, expect, it } from 'vitest'
import type { Segment } from '../types/geometry'
import { buildStrands } from './buildStrands'
import { computeWeave } from './weave'
import { wovenPathD } from './wovenPathD'

const seg = (fx: number, fy: number, tx: number, ty: number): Segment => ({
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
  edgeMidpoint: { x: 0, y: 0 },
  polygonCenter: { x: 0, y: 0 },
  polygonId: 'p',
  polygonSides: 4,
  tileTypeId: '4',
  kind: 'star-arm',
})

describe('computeWeave', () => {
  it('assigns opposite roles to two strands crossing at a degree-4 vertex', () => {
    // X through the origin: horizontal + vertical thread, each of 2 segments.
    const strands = buildStrands([
      seg(-1, 0, 0, 0), seg(0, 0, 1, 0),
      seg(0, -1, 0, 0), seg(0, 0, 0, 1),
    ])
    expect(strands).toHaveLength(2)

    const weaves = computeWeave(strands)
    const underCounts = weaves.map(w => w.under.size)
    // Exactly one thread goes under at the single crossing.
    expect(underCounts.sort()).toEqual([0, 1])
    const under = weaves.find(w => w.under.size === 1)!
    // Perpendicular crossing ⇒ no angle widening.
    expect([...under.under.values()][0]).toBeCloseTo(1)
    // The crossing is the strand's interior point.
    expect([...under.under.keys()][0]).toBe(1)
  })

  it('alternates over/under along a thread with two crossings', () => {
    // One horizontal thread crossed by two vertical threads at x=0 and x=2.
    const strands = buildStrands([
      seg(-1, 0, 0, 0), seg(0, 0, 2, 0), seg(2, 0, 3, 0),
      seg(0, -1, 0, 0), seg(0, 0, 0, 1),
      seg(2, -1, 2, 0), seg(2, 0, 2, 1),
    ])
    expect(strands).toHaveLength(3)
    const weaves = computeWeave(strands)
    const horizontal = strands.findIndex(s => s.points.length === 4)
    // The long thread passes 2 crossings: over at one, under at the other.
    expect(weaves[horizontal].under.size).toBe(1)
    // Each vertical thread takes the opposite role to the horizontal one,
    // so across all three threads exactly 2 of the 4 visits are under.
    const total = weaves.reduce((n, w) => n + w.under.size, 0)
    expect(total).toBe(2)
  })

  it('ignores plain continuations (degree-2 vertices)', () => {
    const strands = buildStrands([seg(-1, 0, 0, 0), seg(0, 0, 1, 1)])
    expect(strands).toHaveLength(1)
    expect(computeWeave(strands)[0].under.size).toBe(0)
  })
})

describe('wovenPathD', () => {
  it('cuts a straight strand around an under crossing', () => {
    const d = wovenPathD(
      { points: [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], curves: [null, null] },
      idx => (idx === 1 ? 0.25 : 0),
    )
    expect(d).toBe('M-1 0 L-0.25 0 M0.25 0 L1 0')
  })

  it('skips edges fully swallowed by their cuts', () => {
    const d = wovenPathD(
      { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], curves: [null, null, null] },
      idx => (idx === 1 || idx === 2 ? 0.6 : 0),
    )
    // Middle edge (length 1) is consumed by 0.6 + 0.6.
    const nums = d.match(/-?[\d.]+/g)!.map(Number)
    expect(d.replace(/-?[\d.]+/g, '#')).toBe('M# # L# # M# # L# #')
    expect(nums[2]).toBeCloseTo(0.4)
    expect(nums[4]).toBeCloseTo(2.6)
  })

  it('keeps an uncut strand identical to a single continuous path', () => {
    const d = wovenPathD(
      { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }], curves: [null, null] },
      () => 0,
    )
    expect(d).toBe('M0 0 L1 0 L2 1')
  })
})
