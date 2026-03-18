import type { Polygon } from '../types/geometry'
import type { TilingDefinition } from '../types/tiling'
import { circumradius, createPolygon, neighborPolygon, polygonKey, resetIds, roundKey } from './shared'
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
  const xs = poly.vertices.map(v => v.x)
  const ys = poly.vertices.map(v => v.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return maxX >= vp.x && minX <= vp.x + vp.width && maxY >= vp.y && minY <= vp.y + vp.height
}

/** Maximum polygons to generate (safety limit against runaway BFS) */
const MAX_POLYGONS = 2_000

/** Round a vertex position for use as a registry key */
const vtxKey = (v: Vec2): string => roundKey(v, 1)

/**
 * Vertex registry: tracks which polygon side-counts are already placed
 * at each vertex position. Used to determine the correct neighbor type.
 */
class VertexRegistry {
  private map = new Map<string, number[]>()

  add(v: Vec2, sides: number): void {
    const key = vtxKey(v)
    const list = this.map.get(key)
    if (list) list.push(sides)
    else this.map.set(key, [sides])
  }

  addPolygon(poly: Polygon): void {
    for (const v of poly.vertices) this.add(v, poly.sides)
  }

  countOf(v: Vec2, sides: number): number {
    const list = this.map.get(vtxKey(v))
    if (!list) return 0
    let c = 0
    for (const s of list) if (s === sides) c++
    return c
  }
}

/**
 * Spatial hash for fast overlap detection.
 * Cells are sized so that overlapping polygons must share a cell.
 */
class SpatialHash {
  private cells = new Map<string, Polygon[]>()
  private cellSize: number

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`
  }

  add(poly: Polygon): void {
    const key = this.cellKey(poly.center.x, poly.center.y)
    const list = this.cells.get(key)
    if (list) list.push(poly)
    else this.cells.set(key, [poly])
  }

  /** Check if a polygon would overlap with any placed polygon */
  overlaps(poly: Polygon, edgeLen: number): boolean {
    const cx = Math.floor(poly.center.x / this.cellSize)
    const cy = Math.floor(poly.center.y / this.cellSize)
    const inradius = edgeLen / (2 * Math.tan(Math.PI / poly.sides))

    // Check neighboring cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cx + dx},${cy + dy}`
        const cell = this.cells.get(key)
        if (!cell) continue
        for (const other of cell) {
          const ox = poly.center.x - other.center.x
          const oy = poly.center.y - other.center.y
          const dist = Math.sqrt(ox * ox + oy * oy)
          const otherInradius = edgeLen / (2 * Math.tan(Math.PI / other.sides))
          // Two non-overlapping adjacent polygons have centers at least
          // inradius1 + inradius2 apart. Use 80% threshold for safety.
          if (dist < (inradius + otherInradius) * 0.8) return true
        }
      }
    }
    return false
  }
}

/**
 * Determine the neighbor polygon type across an edge using the vertex registry.
 */
function inferNeighborSides(
  vertexConfig: number[],
  registry: VertexRegistry,
  A: Vec2,
  B: Vec2,
  parentSides: number,
): number | null {
  const required = new Map<number, number>()
  for (const s of vertexConfig) required.set(s, (required.get(s) ?? 0) + 1)

  // Adjacency constraint: which polygon types appear next to parentSides in the config?
  const L = vertexConfig.length
  const adjacentTypes = new Set<number>()
  for (let i = 0; i < L; i++) {
    if (vertexConfig[i] === parentSides) {
      adjacentTypes.add(vertexConfig[(i + 1) % L])
      adjacentTypes.add(vertexConfig[(i - 1 + L) % L])
    }
  }

  const candidates: number[] = []
  for (const [sides, maxCount] of required) {
    if (!adjacentTypes.has(sides)) continue
    const countA = registry.countOf(A, sides)
    const countB = registry.countOf(B, sides)
    if (countA < maxCount && countB < maxCount) {
      candidates.push(sides)
    }
  }

  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) return null

  // Prefer the most constrained candidate (fewest remaining slots)
  candidates.sort((a, b) => {
    const slotsA = (required.get(a)! - registry.countOf(A, a)) + (required.get(a)! - registry.countOf(B, a))
    const slotsB = (required.get(b)! - registry.countOf(A, b)) + (required.get(b)! - registry.countOf(B, b))
    return slotsA - slotsB
  })

  return candidates[0]
}

/**
 * Generate all polygons visible in the given viewport for a tiling.
 *
 * Uses a vertex registry to determine neighbor polygon types and a spatial
 * hash to prevent overlapping polygon placement.
 */
export function generateTiling(
  definition: TilingDefinition,
  viewport: Viewport,
  edgeLen: number,
): Polygon[] {
  resetIds()
  const { vertexConfig, seedSides } = definition
  const paddedVP = padViewport(viewport, edgeLen * 3)

  const cx = viewport.x + viewport.width / 2
  const cy = viewport.y + viewport.height / 2
  const R = circumradius(seedSides, edgeLen)
  const seedPhi = seedSides === 6 ? Math.PI / 6 : 0
  const seed = createPolygon(seedSides, { x: cx, y: cy }, R, seedPhi)

  const registry = new VertexRegistry()
  const spatial = new SpatialHash(edgeLen * 2)
  const placed = new Map<string, Polygon>()
  const queue: Array<{ poly: Polygon; key: string }> = []
  const seedKey = polygonKey(seed)
  queue.push({ poly: seed, key: seedKey })

  while (queue.length > 0 && placed.size < MAX_POLYGONS) {
    const { poly, key } = queue.shift()!
    if (placed.has(key)) continue
    placed.set(key, poly)
    registry.addPolygon(poly)
    spatial.add(poly)

    for (let edgeIdx = 0; edgeIdx < poly.sides; edgeIdx++) {
      const A = poly.vertices[edgeIdx]
      const B = poly.vertices[(edgeIdx + 1) % poly.sides]

      const nSides = inferNeighborSides(vertexConfig, registry, A, B, poly.sides)
      if (nSides === null) continue

      const neighbor = neighborPolygon(A, B, nSides, edgeLen)
      const nKey = polygonKey(neighbor)
      if (placed.has(nKey)) continue
      if (!intersectsViewport(neighbor, paddedVP)) continue
      if (spatial.overlaps(neighbor, edgeLen)) continue

      queue.push({ poly: neighbor, key: nKey })
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
