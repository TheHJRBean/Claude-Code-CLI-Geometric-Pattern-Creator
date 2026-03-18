import type { Polygon } from '../types/geometry'
import type { TilingDefinition } from '../types/tiling'
import { circumradius, createPolygon, neighborPolygon, polygonKey, resetIds } from './shared'
import { computeNeighborSides } from './neighborSides'
import { midpoint, Vec2 } from '../utils/math'

export interface Viewport {
  x: number
  y: number
  width: number
  height: number
}

/** Pad viewport by one tile so edge tiles are always complete */
const padViewport = (vp: Viewport, pad: number): Viewport => ({
  x: vp.x - pad,
  y: vp.y - pad,
  width: vp.width + 2 * pad,
  height: vp.height + 2 * pad,
})

function intersectsViewport(poly: Polygon, vp: Viewport): boolean {
  for (const v of poly.vertices) {
    if (v.x >= vp.x && v.x <= vp.x + vp.width && v.y >= vp.y && v.y <= vp.y + vp.height)
      return true
  }
  // Check if any viewport corner is inside the polygon (coarse check via bounding box)
  const xs = poly.vertices.map(v => v.x)
  const ys = poly.vertices.map(v => v.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return maxX >= vp.x && minX <= vp.x + vp.width && maxY >= vp.y && minY <= vp.y + vp.height
}

/** Maximum polygons to generate (safety limit against runaway BFS) */
const MAX_POLYGONS = 10_000

/**
 * Generate all polygons visible in the given viewport for a tiling.
 */
export function generateTiling(
  definition: TilingDefinition,
  viewport: Viewport,
  edgeLen: number,
): Polygon[] {
  resetIds()
  const { vertexConfig, seedSides } = definition
  const paddedVP = padViewport(viewport, edgeLen * 3)

  // Seed: place one polygon at the viewport center
  const cx = viewport.x + viewport.width / 2
  const cy = viewport.y + viewport.height / 2
  const R = circumradius(seedSides, edgeLen)
  const seedPhi = seedSides === 6 ? Math.PI / 6 : 0
  const seed = createPolygon(seedSides, { x: cx, y: cy }, R, seedPhi)

  // Track each polygon's vertex-config position at vertex 0
  const configPosMap = new Map<string, number>()
  const seedConfigPos = vertexConfig.indexOf(seedSides)

  const placed = new Map<string, Polygon>()
  const queue: Array<{ poly: Polygon; key: string }> = []
  const seedKey = polygonKey(seed)
  configPosMap.set(seedKey, seedConfigPos)
  queue.push({ poly: seed, key: seedKey })

  while (queue.length > 0 && placed.size < MAX_POLYGONS) {
    const { poly, key } = queue.shift()!
    if (placed.has(key)) continue
    placed.set(key, poly)

    const configPos = configPosMap.get(key)!

    // Expand to all neighbors
    for (let edgeIdx = 0; edgeIdx < poly.sides; edgeIdx++) {
      const A = poly.vertices[edgeIdx]
      const B = poly.vertices[(edgeIdx + 1) % poly.sides]
      const { sides: nSides, configPos: nConfigPos } = computeNeighborSides(
        configPos, edgeIdx, poly.sides, vertexConfig,
      )
      const neighbor = neighborPolygon(A, B, nSides, edgeLen)
      const nKey = polygonKey(neighbor)
      if (!placed.has(nKey) && intersectsViewport(neighbor, paddedVP)) {
        if (!configPosMap.has(nKey)) {
          configPosMap.set(nKey, nConfigPos)
        }
        queue.push({ poly: neighbor, key: nKey })
      }
    }
  }

  return [...placed.values()]
}

/**
 * Deduplicate edges: polygons share edges, so each edge appears in 2 polygons.
 * Returns a map from edge-midpoint key to the set of polygon IDs that share it.
 */
export function buildEdgeMap(polygons: Polygon[], _edgeLen: number): Map<string, { a: Vec2; b: Vec2; polygonIds: string[] }> {
  const edgeMap = new Map<string, { a: Vec2; b: Vec2; polygonIds: string[] }>()
  const f = 10 ** 3

  for (const poly of polygons) {
    for (let i = 0; i < poly.sides; i++) {
      const A = poly.vertices[i]
      const B = poly.vertices[(i + 1) % poly.sides]
      const mid = midpoint(A, B)
      // Key by midpoint (shared edges have the same midpoint)
      const key = `${Math.round(mid.x * f)},${Math.round(mid.y * f)}`
      const existing = edgeMap.get(key)
      if (existing) {
        if (!existing.polygonIds.includes(poly.id)) {
          existing.polygonIds.push(poly.id)
        }
      } else {
        edgeMap.set(key, { a: A, b: B, polygonIds: [poly.id] })
      }
    }
  }

  return edgeMap
}
