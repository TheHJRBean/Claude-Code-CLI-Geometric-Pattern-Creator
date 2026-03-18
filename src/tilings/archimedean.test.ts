import { describe, it, expect, beforeEach } from 'vitest'
import { generateTiling, buildEdgeMap, Viewport } from './archimedean'
import { TILINGS } from './index'
import { resetIds } from './shared'

beforeEach(() => resetIds())

const viewport: Viewport = { x: -200, y: -200, width: 400, height: 400 }
const edgeLen = 50

describe('generateTiling — square {4,4}', () => {
  it('produces polygons', () => {
    const polys = generateTiling(TILINGS['square'], viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
  })

  it('all polygons are squares (4 sides)', () => {
    const polys = generateTiling(TILINGS['square'], viewport, edgeLen)
    for (const p of polys) expect(p.sides).toBe(4)
  })

  it('all polygons have unique IDs', () => {
    const polys = generateTiling(TILINGS['square'], viewport, edgeLen)
    const ids = new Set(polys.map(p => p.id))
    expect(ids.size).toBe(polys.length)
  })

  it('no two polygons have the same center', () => {
    const polys = generateTiling(TILINGS['square'], viewport, edgeLen)
    const keys = new Set(polys.map(p => `${Math.round(p.center.x * 100)},${Math.round(p.center.y * 100)}`))
    expect(keys.size).toBe(polys.length)
  })
})

describe('generateTiling — hexagonal {6,3}', () => {
  it('produces polygons', () => {
    const polys = generateTiling(TILINGS['hexagonal'], viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
  })

  it('all polygons are hexagons (6 sides)', () => {
    const polys = generateTiling(TILINGS['hexagonal'], viewport, edgeLen)
    for (const p of polys) expect(p.sides).toBe(6)
  })
})

describe('generateTiling — triangular {3,6}', () => {
  it('produces polygons', () => {
    const polys = generateTiling(TILINGS['triangular'], viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
  })

  it('all polygons are triangles', () => {
    const polys = generateTiling(TILINGS['triangular'], viewport, edgeLen)
    for (const p of polys) expect(p.sides).toBe(3)
  })
})

describe('generateTiling — mixed 4.8.8', () => {
  it('produces polygons', () => {
    const polys = generateTiling(TILINGS['4.8.8'], viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
  })

  it('produces both squares and octagons', () => {
    const polys = generateTiling(TILINGS['4.8.8'], viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    // Both 4-gons and 8-gons must appear
    expect(sides.has(4)).toBe(true)
    expect(sides.has(8)).toBe(true)
  })
})

describe('buildEdgeMap', () => {
  it('interior edges shared by exactly 2 polygons', () => {
    const polys = generateTiling(TILINGS['square'], viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys, edgeLen)
    let sharedCount = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) sharedCount++
    }
    expect(sharedCount).toBeGreaterThan(0)
  })

  it('boundary edges belong to only 1 polygon', () => {
    const polys = generateTiling(TILINGS['square'], viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys, edgeLen)
    let boundaryCount = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 1) boundaryCount++
    }
    expect(boundaryCount).toBeGreaterThan(0)
  })
})
