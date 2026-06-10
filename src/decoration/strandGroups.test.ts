import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../utils/math'
import type { Segment } from '../types/geometry'
import { strandIdentities, strandIdentity } from './strandGroups'

const rot = (p: Vec2, a: number): Vec2 => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
})
const tr = (p: Vec2, t: Vec2): Vec2 => ({ x: p.x + t.x, y: p.y + t.y })
const mirror = (p: Vec2): Vec2 => ({ x: -p.x, y: p.y })

describe('strandIdentity', () => {
  // An asymmetric open chain: two unequal edges with a left turn.
  const chain: Vec2[] = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 4, y: 12 },
  ]

  it('is invariant under translation and rotation', () => {
    const base = strandIdentity(chain)
    const moved = strandIdentity(chain.map(p => tr(p, { x: 31, y: -7 })))
    const turned = strandIdentity(chain.map(p => rot(p, Math.PI / 3)))
    expect(moved.signature).toBe(base.signature)
    expect(turned.signature).toBe(base.signature)
    expect(moved.centroid.x).toBeCloseTo(base.centroid.x + 31)
    expect(moved.centroid.y).toBeCloseTo(base.centroid.y - 7)
  })

  it('is invariant under reflection and reversal', () => {
    const base = strandIdentity(chain)
    const reflected = strandIdentity(chain.map(mirror))
    const reversed = strandIdentity(chain.slice().reverse())
    expect(reflected.signature).toBe(base.signature)
    expect(reversed.signature).toBe(base.signature)
  })

  it('distinguishes turn-sign patterns that are not mirror images', () => {
    // Same edge lengths and |turn| magnitudes; left-left vs left-right.
    const ll: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const lr: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }]
    expect(strandIdentity(ll).signature).not.toBe(strandIdentity(lr).signature)
  })

  it('closed loops: invariant under start vertex, winding, reflection; size-sensitive', () => {
    const sq: Vec2[] = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 },
    ]
    const base = strandIdentity(sq)
    expect(base.closed).toBe(true)
    const shifted: Vec2[] = [
      { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 },
    ]
    const cw = sq.slice().reverse()
    const refl = sq.map(mirror)
    expect(strandIdentity(shifted).signature).toBe(base.signature)
    expect(strandIdentity(cw).signature).toBe(base.signature)
    expect(strandIdentity(refl).signature).toBe(base.signature)
    const big = sq.map(p => ({ x: p.x * 2, y: p.y * 2 }))
    expect(strandIdentity(big).signature).not.toBe(base.signature)
  })
})

describe('strandIdentities', () => {
  const seg = (from: Vec2, to: Vec2): Segment => ({
    from,
    to,
    edgeMidpoint: { x: 0, y: 0 },
    polygonCenter: { x: 0, y: 0 },
    polygonId: 'p',
    polygonSides: 4,
    tileTypeId: '4',
    kind: 'star-arm',
  })

  it('maps every segment to its strand and assigns congruent copies one signature', () => {
    // Two congruent V chains, the second translated by (100, 0).
    const segments = [
      seg({ x: 0, y: 0 }, { x: 10, y: 0 }),
      seg({ x: 10, y: 0 }, { x: 10, y: 8 }),
      seg({ x: 100, y: 0 }, { x: 110, y: 0 }),
      seg({ x: 110, y: 0 }, { x: 110, y: 8 }),
    ]
    const ids = strandIdentities(segments)
    expect(ids.strands).toHaveLength(2)
    expect(ids.strandOfSegment).toHaveLength(4)
    const s0 = ids.strandOfSegment[0]
    const s2 = ids.strandOfSegment[2]
    expect(ids.strandOfSegment[1]).toBe(s0)
    expect(ids.strandOfSegment[3]).toBe(s2)
    expect(s0).not.toBe(s2)
    expect(ids.strands[s0].signature).toBe(ids.strands[s2].signature)
    expect(ids.strands[s2].centroid.x).toBeCloseTo(ids.strands[s0].centroid.x + 100)
  })
})
