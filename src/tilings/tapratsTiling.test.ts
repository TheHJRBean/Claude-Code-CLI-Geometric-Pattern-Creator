import { describe, it, expect, beforeEach } from 'vitest'
import { generateTapratsTiling } from './tapratsTiling'
import { resetIds } from './shared'
import { buildEdgeMap } from './archimedean'

beforeEach(() => resetIds())

const viewport = { x: -200, y: -200, width: 400, height: 400 }
const edgeLen = 50

describe('generateTapratsTiling — pentagonal rosette', () => {
  it('produces polygons', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
  })

  it('produces pentagons and quads', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(5)).toBe(true)
    expect(sides.has(4)).toBe(true)
  })

  it('has shared edges (tiling is connected)', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })

  it('all polygons have unique IDs', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', viewport, edgeLen)
    const ids = new Set(polys.map(p => p.id))
    expect(ids.size).toBe(polys.length)
  })
})

describe('generateTapratsTiling — heptagonal rosette', () => {
  it('produces heptagons and pentagons', () => {
    const polys = generateTapratsTiling('heptagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(7)).toBe(true)
    expect(sides.has(5)).toBe(true)
  })

  it('has shared edges', () => {
    const polys = generateTapratsTiling('heptagonal-rosette', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — nonagonal rosette', () => {
  it('produces nonagons, hexagons, and pentagons', () => {
    const polys = generateTapratsTiling('nonagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(9)).toBe(true)
    expect(sides.has(6)).toBe(true)
    expect(sides.has(5)).toBe(true)
  })
})

describe('generateTapratsTiling — decagonal rosette', () => {
  it('produces decagons', () => {
    const polys = generateTapratsTiling('decagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(10)).toBe(true)
  })
})

describe('generateTapratsTiling — hendecagonal rosette', () => {
  it('produces hendecagons', () => {
    const polys = generateTapratsTiling('hendecagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(11)).toBe(true)
  })
})

describe('generateTapratsTiling — unknown key', () => {
  it('returns empty array', () => {
    const polys = generateTapratsTiling('nonexistent', viewport, edgeLen)
    expect(polys).toEqual([])
  })
})
