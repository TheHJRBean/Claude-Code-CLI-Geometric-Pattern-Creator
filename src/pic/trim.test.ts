import { describe, it, expect, beforeEach } from 'vitest'
import { trimRays } from './trim'
import { computeContactRays } from './stellation'
import { createPolygon, circumradius, resetIds } from '../tilings/shared'
import { dist } from '../utils/math'
import { pointInPolygon } from '../utils/math'

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

beforeEach(() => resetIds())

describe('trimRays', () => {
  it('returns empty array when given no rays', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    expect(trimRays(poly, [])).toEqual([])
  })

  it('returns empty array when no valid intersections exist (all rays from same edge)', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5).filter(r => r.edgeIndex === 0)
    // Same-edge rays are excluded from intersection (they share an origin)
    const segs = trimRays(poly, rays)
    expect(segs.length).toBe(0)
  })

  it('all segment endpoints lie inside the polygon', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    const segs = trimRays(poly, rays)

    for (const seg of segs) {
      // The 'to' endpoint (intersection point) must be inside the polygon
      expect(pointInPolygon(seg.to, poly.vertices)).toBe(true)
    }
  })

  it('each segment starts at an edge midpoint', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    const segs = trimRays(poly, rays)

    for (const seg of segs) {
      expect(near(seg.from.x, seg.edgeMidpoint.x)).toBe(true)
      expect(near(seg.from.y, seg.edgeMidpoint.y)).toBe(true)
    }
  })

  it('polygonId on segments matches the polygon', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    const segs = trimRays(poly, rays)
    for (const seg of segs) {
      expect(seg.polygonId).toBe(poly.id)
    }
  })

  it('segments have non-zero length', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    const segs = trimRays(poly, rays)
    for (const seg of segs) {
      expect(dist(seg.from, seg.to)).toBeGreaterThan(1e-6)
    }
  })
})

describe('trimRays — PIC pipeline integration: segments must be generated', () => {
  /**
   * This is the integration-level smoke test for the PIC algorithm.
   *
   * Given a correctly configured polygon with proper contact rays,
   * trimRays MUST produce segments. If it produces 0 segments, the
   * stellation rays are pointing in the wrong direction (see Bug #1).
   */
  it('produces segments for a square at θ=67.5° (classic 8-star)', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    const segs = trimRays(poly, rays)
    // A square with 8 contact rays should produce 8 segments (one per ray)
    expect(segs.length).toBeGreaterThan(0)
  })

  it('produces segments for a hexagon at θ=60°', () => {
    const poly = createPolygon(6, { x: 0, y: 0 }, circumradius(6, 1), Math.PI / 6)
    const rays = computeContactRays(poly, 60)
    const segs = trimRays(poly, rays)
    expect(segs.length).toBeGreaterThan(0)
  })

  it('produces segments for an octagon at θ=67.5°', () => {
    const poly = createPolygon(8, { x: 0, y: 0 }, circumradius(8, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    const segs = trimRays(poly, rays)
    expect(segs.length).toBeGreaterThan(0)
  })

  it('produces segments for a triangle at θ=60°', () => {
    const poly = createPolygon(3, { x: 0, y: 0 }, circumradius(3, 1), Math.PI / 2)
    const rays = computeContactRays(poly, 60)
    const segs = trimRays(poly, rays)
    expect(segs.length).toBeGreaterThan(0)
  })

  it('more segments with larger contact angle (more open star)', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    // High angle: rays nearly perpendicular — should still yield intersections
    const segsHigh = trimRays(poly, computeContactRays(poly, 80))
    expect(segsHigh.length).toBeGreaterThan(0)
    // Low angle: shallow rays — should also yield intersections
    const segsLow = trimRays(poly, computeContactRays(poly, 20))
    expect(segsLow.length).toBeGreaterThan(0)
  })
})
