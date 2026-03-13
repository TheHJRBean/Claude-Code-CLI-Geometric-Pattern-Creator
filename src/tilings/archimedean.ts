import type { Polygon } from '../types/geometry'
import type { TilingDefinition } from '../types/tiling'
import { circumradius, createPolygon, neighborPolygon, polygonKey, resetIds } from './shared'
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

/**
 * For a given polygon and edge index, return which polygon side count
 * the neighbor on that edge should have, according to the vertex configuration.
 *
 * This is the core of the Archimedean tiling generator.
 * The vertex configuration defines the sequence of polygon types around each vertex.
 * For a polygon with `sides` sides, the neighbor on edge k is determined by
 * reading the vertex config cyclically.
 */
function neighborSides(
  currentSides: number,
  _edgeIndex: number,
  vertexConfig: number[],
): number {
  // Find position of currentSides in the vertex config
  const idx = vertexConfig.indexOf(currentSides)
  if (idx === -1) {
    // Polygon type not in config — use the first type as fallback
    return vertexConfig[0]
  }
  // The neighbor across edge k is the polygon type that comes after currentSides
  // in the vertex config at the shared vertex. For a regular tiling, we cycle
  // through the vertex config as we walk around the polygon's edges.
  // Each edge k connects vertex k to vertex k+1.
  // At vertex k+1, the polygons around it are in cyclic order of vertexConfig.
  // The neighbor across edge k shares vertices k and k+1 of our polygon.
  // We pick the next type in the config after the current one.
  const nextIdx = (idx + 1) % vertexConfig.length
  return vertexConfig[nextIdx]
}

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
  // Orient so flat edge is at top (phi = -π/seedSides + π/2 for flat-top, 0 for point-top)
  const seedPhi = seedSides === 6 ? Math.PI / 6 : 0
  const seed = createPolygon(seedSides, { x: cx, y: cy }, R, seedPhi)

  const placed = new Map<string, Polygon>()
  const queue: Polygon[] = [seed]

  while (queue.length > 0) {
    const poly = queue.shift()!
    const key = polygonKey(poly)
    if (placed.has(key)) continue
    placed.set(key, poly)

    // Expand to all neighbors
    for (let edgeIdx = 0; edgeIdx < poly.sides; edgeIdx++) {
      const A = poly.vertices[edgeIdx]
      const B = poly.vertices[(edgeIdx + 1) % poly.sides]
      const nSides = neighborSides(poly.sides, edgeIdx, vertexConfig)
      const neighbor = neighborPolygon(A, B, nSides, edgeLen)
      const nKey = polygonKey(neighbor)
      if (!placed.has(nKey) && intersectsViewport(neighbor, paddedVP)) {
        queue.push(neighbor)
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
