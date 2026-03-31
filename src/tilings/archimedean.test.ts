import { describe, it, expect, beforeEach } from 'vitest'
import { generateTiling, buildEdgeMap, Viewport } from './archimedean'
import { TILINGS } from './index'
import { resetIds } from './shared'
import { midpoint, Vec2 } from '../utils/math'

beforeEach(() => resetIds())

const edgeLen = 40

/**
 * Compute a viewport large enough that:
 * 1. Big-polygon tilings (12-gons) have enough interior area after margins
 * 2. Small-polygon tilings (triangles/squares) expand far enough for BFS
 *    edge-registration bugs to surface — these only appear at larger scales
 *
 * Half-size: max(400, circumR * 8) ensures ~800+ unit viewports for small
 * polygons, which is where 3.3.3.4.4 and 3.3.4.3.4 gaps manifest.
 */
function tilingViewport(tilingKey: string): Viewport {
  const def = TILINGS[tilingKey]
  const maxSides = Math.max(...def.vertexConfig)
  const circumR = edgeLen / (2 * Math.sin(Math.PI / maxSides))
  const halfSize = Math.max(400, circumR * 8)
  return { x: -halfSize, y: -halfSize, width: halfSize * 2, height: halfSize * 2 }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Returns the number of deep-interior edges that are only shared by 1 polygon
 * (i.e. gaps). A "deep interior" edge is one whose midpoint is at least
 * `margin` away from all viewport sides.
 */
function countInteriorGaps(tilingKey: string) {
  const def = TILINGS[tilingKey]
  const vp = tilingViewport(tilingKey)
  const polys = generateTiling(def, vp, edgeLen)
  const edgeMap = buildEdgeMap(polys)

  // Margin: edges this far from viewport boundary are definitely interior.
  // Use the circumradius of the largest polygon × 3 for safety.
  const maxSides = Math.max(...def.vertexConfig)
  const circumR = edgeLen / (2 * Math.sin(Math.PI / maxSides))
  const margin = circumR * 3
  const innerBox = {
    xMin: vp.x + margin,
    xMax: vp.x + vp.width - margin,
    yMin: vp.y + margin,
    yMax: vp.y + vp.height - margin,
  }

  let gaps = 0
  let interiorEdges = 0
  for (const [, edge] of edgeMap) {
    const mid = midpoint(edge.a, edge.b)
    if (mid.x < innerBox.xMin || mid.x > innerBox.xMax ||
        mid.y < innerBox.yMin || mid.y > innerBox.yMax) continue
    interiorEdges++
    if (edge.polygonIds.length < 2) gaps++
  }
  return { gaps, interiorEdges, totalPolygons: polys.length }
}

/**
 * For each vertex deep in the interior, collect the sorted list of polygon
 * side-counts meeting there and check it matches the tiling's vertex config.
 * Returns the number of vertices that don't match.
 */
function countVertexConfigViolations(tilingKey: string) {
  const def = TILINGS[tilingKey]
  const vp = tilingViewport(tilingKey)
  const polys = generateTiling(def, vp, edgeLen)
  const expectedConfig = [...def.vertexConfig].sort((a, b) => a - b)

  // Build vertex → polygon sides mapping
  const f = 10 ** 1
  const vtxMap = new Map<string, number[]>()
  for (const poly of polys) {
    for (const v of poly.vertices) {
      const key = `${Math.round(v.x * f)},${Math.round(v.y * f)}`
      const list = vtxMap.get(key)
      if (list) list.push(poly.sides)
      else vtxMap.set(key, [poly.sides])
    }
  }

  const maxSides = Math.max(...def.vertexConfig)
  const circumR = edgeLen / (2 * Math.sin(Math.PI / maxSides))
  const margin = circumR * 3.5
  const innerBox = {
    xMin: vp.x + margin,
    xMax: vp.x + vp.width - margin,
    yMin: vp.y + margin,
    yMax: vp.y + vp.height - margin,
  }

  let violations = 0
  let interiorVertices = 0
  for (const [key, sides] of vtxMap) {
    const [xs, ys] = key.split(',').map(Number)
    const x = xs / f, y = ys / f
    if (x < innerBox.xMin || x > innerBox.xMax ||
        y < innerBox.yMin || y > innerBox.yMax) continue

    const sorted = [...sides].sort((a, b) => a - b)
    // Only check fully-surrounded vertices (matching expected polygon count)
    if (sorted.length !== expectedConfig.length) continue
    interiorVertices++

    const matches = sorted.every((s, i) => s === expectedConfig[i])
    if (!matches) violations++
  }
  return { violations, interiorVertices }
}

// ── Archimedean tilings that use the BFS generator ──────────────────

const archimedeanTilings = [
  'triangular',
  'square',
  'hexagonal',
  '3.3.3.4.4',
  '3.3.4.3.4',
  '3.3.3.3.6',
  '3.4.6.4',
  '3.6.3.6',
  '4.8.8',
  '3.12.12',
  '4.6.12',
]

describe('gap detection — no unshared interior edges', () => {
  for (const key of archimedeanTilings) {
    it(`${key} has zero interior gaps`, () => {
      const { gaps, interiorEdges, totalPolygons } = countInteriorGaps(key)
      // Sanity: must have enough interior edges to be meaningful
      expect(interiorEdges).toBeGreaterThan(5)
      expect(gaps).toBe(0)
    })
  }
})

describe('vertex config — interior vertices match expected polygon arrangement', () => {
  for (const key of archimedeanTilings) {
    it(`${key} has zero vertex config violations`, () => {
      const { violations, interiorVertices } = countVertexConfigViolations(key)
      // Sanity: must have enough interior vertices to be meaningful
      expect(interiorVertices).toBeGreaterThan(3)
      expect(violations).toBe(0)
    })
  }
})

// ── Original tests (kept for basic coverage) ────────────────────────

const smallVp: Viewport = { x: -200, y: -200, width: 400, height: 400 }

describe('generateTiling — basic properties', () => {
  it('square: all polygons have 4 sides', () => {
    const polys = generateTiling(TILINGS['square'], smallVp, edgeLen)
    for (const p of polys) expect(p.sides).toBe(4)
  })

  it('all polygons have unique IDs', () => {
    const polys = generateTiling(TILINGS['square'], smallVp, edgeLen)
    const ids = new Set(polys.map(p => p.id))
    expect(ids.size).toBe(polys.length)
  })

  it('4.8.8 produces both squares and octagons', () => {
    const polys = generateTiling(TILINGS['4.8.8'], smallVp, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(4)).toBe(true)
    expect(sides.has(8)).toBe(true)
  })
})

describe('buildEdgeMap', () => {
  it('interior edges shared by exactly 2 polygons', () => {
    const polys = generateTiling(TILINGS['square'], smallVp, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let sharedCount = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) sharedCount++
    }
    expect(sharedCount).toBeGreaterThan(0)
  })
})
