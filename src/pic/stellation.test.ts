import { describe, it, expect, beforeEach } from 'vitest'
import { computeContactRays } from './stellation'
import { createPolygon, circumradius, resetIds } from '../tilings/shared'
import { normalize, perp, dot, len } from '../utils/math'

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

beforeEach(() => resetIds())

/**
 * For a polygon, computes the inward normal for edge i.
 * For a CW polygon in SVG coords, the inward normal is
 * the left-hand (CCW) perpendicular of the edge direction.
 */
function inwardNormal(poly: ReturnType<typeof createPolygon>, edgeIndex: number) {
  const A = poly.vertices[edgeIndex]
  const B = poly.vertices[(edgeIndex + 1) % poly.sides]
  const edgeDir = normalize({ x: B.x - A.x, y: B.y - A.y })
  return perp(edgeDir) // left-hand perp = inward normal for CW polygon
}

describe('computeContactRays — geometry contracts', () => {
  it('produces 2 × sides rays for a square', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    expect(rays.length).toBe(8) // 2 per edge × 4 edges
  })

  it('produces 2 × sides rays for a hexagon', () => {
    const poly = createPolygon(6, { x: 0, y: 0 }, circumradius(6, 1), Math.PI / 6)
    const rays = computeContactRays(poly, 60)
    expect(rays.length).toBe(12)
  })

  it('each ray origin is the midpoint of its edge', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    for (const ray of rays) {
      const A = poly.vertices[ray.edgeIndex]
      const B = poly.vertices[(ray.edgeIndex + 1) % poly.sides]
      const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
      expect(near(ray.origin.x, mid.x, 1e-9)).toBe(true)
      expect(near(ray.origin.y, mid.y, 1e-9)).toBe(true)
    }
  })

  it('each ray direction is a unit vector', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    for (const ray of rays) {
      expect(near(len(ray.dir), 1, 1e-9)).toBe(true)
    }
  })

  it('polygonId is set to the polygon id', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    for (const ray of rays) {
      expect(ray.polygonId).toBe(poly.id)
    }
  })

  it('each edge produces one plus and one minus ray', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)
    for (let edge = 0; edge < poly.sides; edge++) {
      const edgeRays = rays.filter(r => r.edgeIndex === edge)
      expect(edgeRays.length).toBe(2)
      const sides = new Set(edgeRays.map(r => r.side))
      expect(sides.has('plus')).toBe(true)
      expect(sides.has('minus')).toBe(true)
    }
  })
})

describe('computeContactRays — CRITICAL: both rays must point INTO the polygon', () => {
  /**
   * This is the key correctness requirement for the PIC algorithm.
   *
   * For a CW polygon in SVG (y-down), the inward normal from edge A→B
   * is the left-hand perpendicular of the edge direction (= perp(edgeDir)).
   *
   * Both contact rays must have a positive dot product with this inward normal,
   * i.e., they must be pointing into the polygon interior.
   *
   * BUG: The current implementation rotates edgeDir by ±(π/2 - θ) instead of
   * rotating the inwardNormal by ±(π/2 - θ). This causes one ray per edge
   * to point outward, and trimRays() never finds valid intersections.
   */
  it('both rays from each edge of a square point into the polygon (θ=67.5°)', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)

    let allInward = true
    for (let edge = 0; edge < poly.sides; edge++) {
      const inward = inwardNormal(poly, edge)
      const edgeRays = rays.filter(r => r.edgeIndex === edge)
      for (const ray of edgeRays) {
        const d = dot(ray.dir, inward)
        if (d <= 0) allInward = false
      }
    }
    expect(allInward).toBe(true)
  })

  it('both rays from each edge of a hexagon point into the polygon (θ=60°)', () => {
    const poly = createPolygon(6, { x: 0, y: 0 }, circumradius(6, 1), Math.PI / 6)
    const rays = computeContactRays(poly, 60)

    let allInward = true
    for (let edge = 0; edge < poly.sides; edge++) {
      const inward = inwardNormal(poly, edge)
      const edgeRays = rays.filter(r => r.edgeIndex === edge)
      for (const ray of edgeRays) {
        const d = dot(ray.dir, inward)
        if (d <= 0) allInward = false
      }
    }
    expect(allInward).toBe(true)
  })

  it('both rays from each edge of an octagon point into the polygon (θ=67.5°)', () => {
    const poly = createPolygon(8, { x: 0, y: 0 }, circumradius(8, 1), 0)
    const rays = computeContactRays(poly, 67.5)

    let allInward = true
    for (let edge = 0; edge < poly.sides; edge++) {
      const inward = inwardNormal(poly, edge)
      const edgeRays = rays.filter(r => r.edgeIndex === edge)
      for (const ray of edgeRays) {
        const d = dot(ray.dir, inward)
        if (d <= 0) allInward = false
      }
    }
    expect(allInward).toBe(true)
  })

  it('both rays from each edge point into polygon across full angle range (θ=10°–85°)', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    for (const theta of [10, 20, 30, 45, 60, 67.5, 80, 85]) {
      const rays = computeContactRays(poly, theta)
      for (let edge = 0; edge < poly.sides; edge++) {
        const inward = inwardNormal(poly, edge)
        const edgeRays = rays.filter(r => r.edgeIndex === edge)
        for (const ray of edgeRays) {
          const d = dot(ray.dir, inward)
          expect(d).toBeGreaterThan(0)
        }
      }
    }
  })

  it('plus and minus rays are symmetric about the inward normal', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const rays = computeContactRays(poly, 67.5)

    for (let edge = 0; edge < poly.sides; edge++) {
      const inward = inwardNormal(poly, edge)
      const plus = rays.find(r => r.edgeIndex === edge && r.side === 'plus')!
      const minus = rays.find(r => r.edgeIndex === edge && r.side === 'minus')!

      // Both should have equal dot products with the inward normal (symmetric)
      const dotPlus = dot(plus.dir, inward)
      const dotMinus = dot(minus.dir, inward)
      expect(near(dotPlus, dotMinus, 1e-9)).toBe(true)
    }
  })

  it('rays make angle θ with the edge (measured as complement of angle from inward normal)', () => {
    const poly = createPolygon(4, { x: 0, y: 0 }, circumradius(4, 1), 0)
    const theta = 67.5
    const rays = computeContactRays(poly, theta)

    for (let edge = 0; edge < poly.sides; edge++) {
      const inward = inwardNormal(poly, edge)
      const edgeRays = rays.filter(r => r.edgeIndex === edge)
      for (const ray of edgeRays) {
        // Angle between ray and inward normal should be (90° - θ)
        const angleDeg = Math.acos(Math.min(1, Math.max(-1, dot(ray.dir, inward)))) * 180 / Math.PI
        const expectedAngle = 90 - theta
        expect(near(angleDeg, expectedAngle, 1e-6)).toBe(true)
      }
    }
  })
})
