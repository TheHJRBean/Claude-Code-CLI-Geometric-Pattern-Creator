import type { Polygon } from '../types/geometry'
import type { TilingDefinition } from '../types/tiling'
import { circumradius, createPolygon, neighborPolygon, polygonKey, resetIds, roundKey } from './shared'
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
 * at each vertex position. Used to validate neighbor placement.
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
 * Generate all polygons visible in the given viewport for a tiling.
 *
 * Uses computeNeighborSides (with configPos tracking) for chirality-correct
 * neighbor inference, plus a vertex registry and spatial hash to validate
 * placement and prevent overlaps.
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
  // Flat-top orientation: when n is divisible by 4, phi=0 puts a vertex at 90° (pointy-top).
  // Rotate by π/n to shift it to flat-top (horizontal edge at top/bottom).
  const seedPhi = seedSides % 4 === 0 ? Math.PI / seedSides : 0
  const seed = createPolygon(seedSides, { x: cx, y: cy }, R, seedPhi)

  // Pre-compute max count per polygon type in vertex config
  const maxCountPerType = new Map<number, number>()
  for (const s of vertexConfig) maxCountPerType.set(s, (maxCountPerType.get(s) ?? 0) + 1)

  const registry = new VertexRegistry()
  const spatial = new SpatialHash(edgeLen * 2)
  const placed = new Map<string, Polygon>()
  const configPosMap = new Map<string, number>()
  const queued = new Set<string>()
  const queue: Array<{ poly: Polygon; key: string }> = []

  const seedKey = polygonKey(seed)
  const seedConfigPos = vertexConfig.indexOf(seedSides)
  registry.addPolygon(seed)
  queued.add(seedKey)
  queue.push({ poly: seed, key: seedKey })
  configPosMap.set(seedKey, seedConfigPos)

  while (queue.length > 0 && placed.size < MAX_POLYGONS) {
    const { poly, key } = queue.shift()!
    if (placed.has(key)) continue
    placed.set(key, poly)
    spatial.add(poly)

    const cp0 = configPosMap.get(key) ?? vertexConfig.indexOf(poly.sides)

    for (let edgeIdx = 0; edgeIdx < poly.sides; edgeIdx++) {
      const A = poly.vertices[edgeIdx]
      const B = poly.vertices[(edgeIdx + 1) % poly.sides]

      const { sides: nSides, configPos: nConfigPos } = computeNeighborSides(cp0, edgeIdx, poly.sides, vertexConfig)

      // Validate: check vertex registry hasn't exceeded max count for this polygon type
      const maxCount = maxCountPerType.get(nSides) ?? 0
      if (registry.countOf(A, nSides) >= maxCount || registry.countOf(B, nSides) >= maxCount) continue

      const neighbor = neighborPolygon(A, B, nSides, edgeLen)
      const nKey = polygonKey(neighbor)
      if (placed.has(nKey) || queued.has(nKey)) continue
      if (!intersectsViewport(neighbor, paddedVP)) continue
      if (spatial.overlaps(neighbor, edgeLen)) continue

      registry.addPolygon(neighbor)
      queued.add(nKey)
      queue.push({ poly: neighbor, key: nKey })
      configPosMap.set(nKey, nConfigPos)
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
