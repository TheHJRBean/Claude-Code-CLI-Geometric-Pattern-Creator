import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../utils/math'
import { unionOutlines } from './polyUnion'
import { signedArea } from './voids'

const sq = (x: number, y: number, w = 1, h = w): Vec2[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
]

const area = (poly: Vec2[]): number => Math.abs(signedArea(poly))

describe('unionOutlines', () => {
  it('fuses two squares sharing an edge into one loop', () => {
    const u = unionOutlines([sq(0, 0), sq(1, 0)])
    expect(u.outers).toHaveLength(1)
    expect(u.holes).toHaveLength(0)
    expect(area(u.outers[0])).toBeCloseTo(2, 9)
    expect(signedArea(u.outers[0])).toBeGreaterThan(0) // CCW
    expect(u.seams).toHaveLength(1)
  })

  it('reports the shared edge as the seam', () => {
    const [[a, b]] = unionOutlines([sq(0, 0), sq(1, 0)]).seams
    const xs = [a.x, b.x]
    const ys = [a.y, b.y].sort((p, q) => p - q)
    expect(xs).toEqual([1, 1])
    expect(ys).toEqual([0, 1])
  })

  it('survives a T-junction vertex kept on one side only', () => {
    // The real hazard: `extractVoids` simplifies each face independently, so a
    // strand touching one face's straight edge from outside leaves a vertex on
    // that face and not on its neighbour. Naive pair cancellation then leaves
    // both half-edges and stitches the seam into the outline.
    const left: Vec2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const right: Vec2[] = [
      { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0.5 },
    ]
    const u = unionOutlines([left, right])
    expect(u.outers).toHaveLength(1)
    expect(area(u.outers[0])).toBeCloseTo(2, 9)
    // Both halves of the split shared edge cancel.
    expect(u.seams).toHaveLength(2)
  })

  it('leaves an unselected middle Void as a hole', () => {
    const ring = [
      sq(0, 0), sq(1, 0), sq(2, 0),
      sq(0, 1), /* (1,1) omitted */ sq(2, 1),
      sq(0, 2), sq(1, 2), sq(2, 2),
    ]
    const u = unionOutlines(ring)
    expect(u.outers).toHaveLength(1)
    expect(area(u.outers[0])).toBeCloseTo(9, 9)
    expect(u.holes).toHaveLength(1)
    expect(area(u.holes[0])).toBeCloseTo(1, 9)
    expect(signedArea(u.holes[0])).toBeLessThan(0) // CW
  })

  it('reports disconnected members as separate outers', () => {
    const u = unionOutlines([sq(0, 0), sq(5, 5)])
    expect(u.outers).toHaveLength(2)
    expect(u.seams).toHaveLength(0)
  })

  it('costs the same on a large pattern as on a small one', () => {
    // The vertex grid must be sized off the geometry, not off the snap
    // tolerance. Sized off `tol` it was quadratic in the pattern's WORLD SCALE
    // — identical work, 500× the time on a full-size tiling (5.5 s to resolve
    // 78 two-triangle groups on 3.6.3.6). A ratio guard rather than a wall
    // clock: it catches that class of regression without depending on how fast
    // the machine is.
    const time = (s: number): number => {
      const a = sq(0, 0, s)
      const b = sq(s, 0, s)
      const t = performance.now()
      for (let i = 0; i < 200; i++) unionOutlines([a, b])
      return performance.now() - t
    }
    const small = time(1)
    const large = time(10_000)
    expect(large).toBeLessThan(small * 20 + 50)
  })

  it('passes a single outline through, CCW-normalised', () => {
    const cw = sq(0, 0).slice().reverse()
    const u = unionOutlines([cw])
    expect(u.outers).toHaveLength(1)
    expect(signedArea(u.outers[0])).toBeGreaterThan(0)
    expect(u.seams).toHaveLength(0)
  })
})
