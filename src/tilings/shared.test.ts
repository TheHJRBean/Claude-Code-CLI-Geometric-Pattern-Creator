import { describe, it, expect, beforeEach } from 'vitest'
import { createPolygon, circumradius, neighborPolygon, polygonKey, resetIds } from './shared'
import { len, sub, dist, midpoint } from '../utils/math'

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

beforeEach(() => resetIds())

describe('circumradius', () => {
  it('square with edge length 1', () => {
    // R = 1 / (2 * sin(PI/4)) = 1/sqrt(2) ≈ 0.707
    expect(near(circumradius(4, 1), 1 / Math.sqrt(2))).toBe(true)
  })

  it('equilateral triangle with edge length 2', () => {
    // R = 2 / (2 * sin(PI/3)) = 2/sqrt(3) ≈ 1.155
    expect(near(circumradius(3, 2), 2 / Math.sqrt(3))).toBe(true)
  })

  it('regular hexagon: R equals edge length', () => {
    expect(near(circumradius(6, 5), 5)).toBe(true)
  })
})

describe('createPolygon', () => {
  it('produces correct number of vertices', () => {
    const p = createPolygon(6, { x: 0, y: 0 }, 1, 0)
    expect(p.vertices.length).toBe(6)
    expect(p.sides).toBe(6)
  })

  it('all vertices lie on the circumradius', () => {
    const R = 3
    const p = createPolygon(5, { x: 0, y: 0 }, R, 0)
    for (const v of p.vertices) {
      expect(near(len(v), R)).toBe(true)
    }
  })

  it('consecutive vertices have equal edge lengths', () => {
    const p = createPolygon(8, { x: 10, y: 10 }, 2, 0)
    const edgeLengths: number[] = []
    for (let i = 0; i < p.sides; i++) {
      const a = p.vertices[i]
      const b = p.vertices[(i + 1) % p.sides]
      edgeLengths.push(dist(a, b))
    }
    const first = edgeLengths[0]
    for (const l of edgeLengths) {
      expect(near(l, first)).toBe(true)
    }
  })

  it('center is stored correctly', () => {
    const cx = 7, cy = -3
    const p = createPolygon(4, { x: cx, y: cy }, 1, 0)
    expect(near(p.center.x, cx)).toBe(true)
    expect(near(p.center.y, cy)).toBe(true)
  })
})

describe('neighborPolygon', () => {
  const edgeLen = 1

  it('neighbor shares the given edge exactly', () => {
    const R = circumradius(4, edgeLen)
    const parent = createPolygon(4, { x: 0, y: 0 }, R, 0)
    const A = parent.vertices[0]
    const B = parent.vertices[1]
    const neighbor = neighborPolygon(A, B, 4, edgeLen)

    // The neighbor must contain vertices A and B
    const hasA = neighbor.vertices.some(v => near(dist(v, A), 0, 1e-6))
    const hasB = neighbor.vertices.some(v => near(dist(v, B), 0, 1e-6))
    expect(hasA).toBe(true)
    expect(hasB).toBe(true)
  })

  it('neighbor center is on the outward perpendicular bisector', () => {
    const R = circumradius(4, edgeLen)
    const parent = createPolygon(4, { x: 0, y: 0 }, R, 0)
    const A = parent.vertices[0]
    const B = parent.vertices[1]
    const neighbor = neighborPolygon(A, B, 4, edgeLen)
    const mid = midpoint(A, B)

    // Neighbor center should be collinear with midpoint along the normal
    const toNeighbor = sub(neighbor.center, mid)
    const edgeDir = { x: B.x - A.x, y: B.y - A.y }

    // toNeighbor should be perpendicular to edgeDir (dot product ≈ 0)
    const dotProduct = toNeighbor.x * edgeDir.x + toNeighbor.y * edgeDir.y
    expect(near(dotProduct, 0, 1e-9)).toBe(true)
  })

  it('neighbor has correct edge length', () => {
    const R = circumradius(6, edgeLen)
    const parent = createPolygon(6, { x: 0, y: 0 }, R, Math.PI / 6)
    const A = parent.vertices[0]
    const B = parent.vertices[1]
    // Create a triangle neighbor
    const neighbor = neighborPolygon(A, B, 3, edgeLen)

    for (let i = 0; i < neighbor.sides; i++) {
      const va = neighbor.vertices[i]
      const vb = neighbor.vertices[(i + 1) % neighbor.sides]
      expect(near(dist(va, vb), edgeLen, 1e-6)).toBe(true)
    }
  })

  it('neighbor center is not the same as parent center', () => {
    const R = circumradius(4, edgeLen)
    const parent = createPolygon(4, { x: 0, y: 0 }, R, 0)
    const A = parent.vertices[0]
    const B = parent.vertices[1]
    const neighbor = neighborPolygon(A, B, 4, edgeLen)
    expect(dist(parent.center, neighbor.center)).toBeGreaterThan(0.1)
  })
})

describe('polygonKey', () => {
  it('same center → same key', () => {
    const p1 = createPolygon(4, { x: 1.234, y: 5.678 }, 1, 0)
    const p2 = createPolygon(4, { x: 1.234, y: 5.678 }, 1, 0)
    expect(polygonKey(p1)).toBe(polygonKey(p2))
  })

  it('different centers → different keys', () => {
    const p1 = createPolygon(4, { x: 0, y: 0 }, 1, 0)
    const p2 = createPolygon(4, { x: 1, y: 0 }, 1, 0)
    expect(polygonKey(p1)).not.toBe(polygonKey(p2))
  })

  it('floating point within rounding tolerance → same key', () => {
    // Two centers that differ by less than 0.0005 should map to same key
    const p1 = createPolygon(4, { x: 10.0001, y: 20.0001 }, 1, 0)
    const p2 = createPolygon(4, { x: 10.0002, y: 20.0002 }, 1, 0)
    expect(polygonKey(p1)).toBe(polygonKey(p2))
  })
})
