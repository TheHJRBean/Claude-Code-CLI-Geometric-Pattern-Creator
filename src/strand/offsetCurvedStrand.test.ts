import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../utils/math'
import { dist } from '../utils/math'
import { offsetCurvedStrand } from './offsetCurvedStrand'
import type { CurvedStrand } from './computeCurves'

const straight = (pts: Vec2[]): CurvedStrand => ({ points: pts, curves: pts.slice(1).map(() => null) })

/** Perpendicular distance from `p` to the infinite line through a→b. */
const lineDist = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x, dy = b.y - a.y
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / Math.hypot(dx, dy)
}

describe('offsetCurvedStrand', () => {
  it('a straight run offsets by exactly d, on the left of travel', () => {
    const s = straight([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    // Left-hand normal of +x is (0, 1) under `perp` — assert the geometry,
    // not a screen direction: which side of the drawn Strand this is depends
    // on how its Rays chained.
    const out = offsetCurvedStrand(s, 3)
    expect(out.points[0]).toEqual({ x: 0, y: 3 })
    expect(out.points[1]).toEqual({ x: 10, y: 3 })
    expect(offsetCurvedStrand(s, -3).points[0].y).toBeCloseTo(-3, 12)
  })

  it('every point of a bent chain sits exactly d off its own edge', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 16, y: 8 }, { x: 16, y: 20 }]
    const out = offsetCurvedStrand(straight(pts), 2.5)
    for (let i = 0; i < pts.length - 1; i++) {
      // The offset edge must be parallel to its source at distance d — that
      // is what keeps the coloured band inside the line the mask cut.
      expect(lineDist(out.points[i], pts[i], pts[i + 1])).toBeCloseTo(2.5, 9)
      expect(lineDist(out.points[i + 1], pts[i], pts[i + 1])).toBeCloseTo(2.5, 9)
    }
  })

  it('mitres the corner rather than rounding or crossing it', () => {
    // A right angle: the mitred corner sits d·√2 from the source vertex.
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const out = offsetCurvedStrand(straight(pts), 2)
    expect(dist(out.points[1], pts[1])).toBeCloseTo(2 * Math.SQRT2, 9)
  })

  it('clamps a hairpin instead of firing the corner off the canvas', () => {
    // Strand chains really do double back (a star tip). Un-clamped, the two
    // offset lines are near-parallel and their crossing runs to infinity.
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0.05 }]
    const out = offsetCurvedStrand(straight(pts), 2)
    expect(dist(out.points[1], pts[1])).toBeLessThanOrEqual(4 * 2 + 1e-9)
    expect(Number.isFinite(out.points[1].x)).toBe(true)
  })

  it('carries control points along the same normal, so a curve stays a curve', () => {
    const s: CurvedStrand = {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      curves: [[{ x: 5, y: 4 }]],
    }
    const out = offsetCurvedStrand(s, 3)
    expect(out.curves[0]).toEqual([{ x: 5, y: 7 }])
    // The source is untouched — the renderer offsets the same Strand several
    // times over, once per coloured band.
    expect(s.curves[0]).toEqual([{ x: 5, y: 4 }])
  })

  it('returns the input untouched at zero offset or on a degenerate chain', () => {
    const s = straight([{ x: 0, y: 0 }, { x: 1, y: 0 }])
    expect(offsetCurvedStrand(s, 0)).toBe(s)
    const single: CurvedStrand = { points: [{ x: 0, y: 0 }], curves: [] }
    expect(offsetCurvedStrand(single, 5)).toBe(single)
  })

  it('opposite offsets straddle the source symmetrically', () => {
    // What the `individual` grain relies on: band k and its mirror are the
    // same path shifted the same distance either way.
    const pts = [{ x: 0, y: 0 }, { x: 12, y: 5 }, { x: 20, y: 1 }]
    const left = offsetCurvedStrand(straight(pts), 4)
    const right = offsetCurvedStrand(straight(pts), -4)
    for (let i = 0; i < pts.length; i++) {
      expect((left.points[i].x + right.points[i].x) / 2).toBeCloseTo(pts[i].x, 9)
      expect((left.points[i].y + right.points[i].y) / 2).toBeCloseTo(pts[i].y, 9)
    }
  })
})
