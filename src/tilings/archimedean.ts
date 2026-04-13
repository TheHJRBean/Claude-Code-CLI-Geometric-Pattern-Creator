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
 * Vertex registry: tracks which polygon side-counts are present at each
 * vertex position. Keyed by (vertexPosition, polygonKey) so that
 * edge-vertex pre-registration at queue time and full registration at
 * placement time don't double-count.
 */
class VertexRegistry {
  private map = new Map<string, Map<string, number>>()

  add(v: Vec2, sides: number, polyKey: string): void {
    const key = vtxKey(v)
    let m = this.map.get(key)
    if (!m) { m = new Map(); this.map.set(key, m) }
    m.set(polyKey, sides)
  }

  addPolygon(poly: Polygon, polyKey: string): void {
    for (const v of poly.vertices) this.add(v, poly.sides, polyKey)
  }

  countOf(v: Vec2, sides: number): number {
    const m = this.map.get(vtxKey(v))
    if (!m) return 0
    let c = 0
    for (const s of m.values()) if (s === sides) c++
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
 * For each edge, tries both chirality directions (d0 = +1 and -1) in
 * computeNeighborSides and accepts the first candidate that passes
 * vertex-registry and spatial-hash validation. This avoids the need
 * for d0 propagation, which is unreliable for vertex configs with many
 * repeated polygon types (e.g. [3,3,3,3,6]).
 */
/** Core BFS — takes an explicit seed center (private). */
function generateTilingCore(
  definition: TilingDefinition,
  viewport: Viewport,
  edgeLen: number,
  seedCenter: Vec2,
): Polygon[] {
  resetIds()
  const { vertexConfig, seedSides } = definition
  const paddedVP = padViewport(viewport, edgeLen * 3)

  const { x: cx, y: cy } = seedCenter
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
  const chiralityMap = new Map<string, 1 | -1>()
  const queued = new Set<string>()
  const queue: Array<{ poly: Polygon; key: string }> = []

  const seedKey = polygonKey(seed)
  const seedConfigPos = vertexConfig.indexOf(seedSides)
  queued.add(seedKey)
  queue.push({ poly: seed, key: seedKey })
  configPosMap.set(seedKey, seedConfigPos)
  chiralityMap.set(seedKey, 1)

  while (queue.length > 0 && placed.size < MAX_POLYGONS) {
    const { poly, key } = queue.shift()!
    if (placed.has(key)) continue
    placed.set(key, poly)
    spatial.add(poly)
    registry.addPolygon(poly, key)

    const cp0 = configPosMap.get(key) ?? vertexConfig.indexOf(poly.sides)
    const d0 = chiralityMap.get(key) ?? 1 as 1 | -1

    for (let edgeIdx = 0; edgeIdx < poly.sides; edgeIdx++) {
      const A = poly.vertices[edgeIdx]
      const B = poly.vertices[(edgeIdx + 1) % poly.sides]

      const { sides: nSides, configPos: nConfigPos, direction: parentDirAtVertex } =
        computeNeighborSides(cp0, edgeIdx, poly.sides, vertexConfig, d0)

      const maxCount = maxCountPerType.get(nSides) ?? 0
      if (registry.countOf(A, nSides) >= maxCount || registry.countOf(B, nSides) >= maxCount) continue

      const neighbor = neighborPolygon(A, B, nSides, edgeLen)
      const nKey = polygonKey(neighbor)
      if (placed.has(nKey) || queued.has(nKey)) continue
      if (!intersectsViewport(neighbor, paddedVP)) continue
      if (spatial.overlaps(neighbor, edgeLen)) continue

      // The neighbor's d0 at vertex 0 (= shared vertex A) matches the
      // parent's direction at that vertex — both polygons read the vertex
      // config in the same rotational sense at the shared vertex.
      const neighborD0 = parentDirAtVertex

      // Register only the shared edge vertices now; remaining vertices
      // are registered when the polygon is dequeued and placed.
      registry.add(A, nSides, nKey)
      registry.add(B, nSides, nKey)
      queued.add(nKey)
      queue.push({ poly: neighbor, key: nKey })
      configPosMap.set(nKey, nConfigPos)
      chiralityMap.set(nKey, neighborD0)
    }
  }

  return [...placed.values()]
}

/* ── Lattice snapping ─────────────────────────────────────────────────
 * The BFS is seeded from a single polygon. When the generation viewport
 * shifts (during panning), the seed must land on an equivalent lattice
 * point so that tile positions stay deterministic across regenerations.
 * ──────────────────────────────────────────────────────────────────── */

/** Check if `candidate` is an exact translate of `seed` (same orientation). */
function isSameOrientation(seed: Polygon, candidate: Polygon, tol: number): boolean {
  const dx = candidate.center.x - seed.center.x
  const dy = candidate.center.y - seed.center.y
  for (const sv of seed.vertices) {
    if (!candidate.vertices.some(cv =>
      Math.abs(cv.x - sv.x - dx) < tol && Math.abs(cv.y - sv.y - dy) < tol))
      return false
  }
  return true
}

/** Snap `target` to the nearest point on the lattice spanned by t1, t2. */
function snapToLattice(target: Vec2, t1: Vec2, t2: Vec2): Vec2 {
  const det = t1.x * t2.y - t1.y * t2.x
  if (Math.abs(det) < 1e-10) return { x: 0, y: 0 }
  const n = Math.round((target.x * t2.y - target.y * t2.x) / det)
  const m = Math.round((t1.x * target.y - t1.y * target.x) / det)
  return { x: n * t1.x + m * t2.x, y: n * t1.y + m * t2.y }
}

const latticeCache = new Map<string, [Vec2, Vec2]>()

/** Compute two linearly-independent translation vectors for the tiling. */
function getTilingLattice(def: TilingDefinition, edgeLen: number): [Vec2, Vec2] {
  const key = `${def.name}:${edgeLen}`
  const cached = latticeCache.get(key)
  if (cached) return cached

  const size = edgeLen * 30
  const miniVP: Viewport = { x: -size / 2, y: -size / 2, width: size, height: size }
  const polys = generateTilingCore(def, miniVP, edgeLen, { x: 0, y: 0 })

  const seedPoly = polys
    .filter(p => p.sides === def.seedSides)
    .sort((a, b) => (a.center.x ** 2 + a.center.y ** 2)
                   - (b.center.x ** 2 + b.center.y ** 2))[0]

  const fallback: [Vec2, Vec2] = [{ x: edgeLen, y: 0 }, { x: 0, y: edgeLen }]
  if (!seedPoly) { latticeCache.set(key, fallback); return fallback }

  const tol = edgeLen * 0.01
  const sameOrient = polys
    .filter(p => p !== seedPoly && p.sides === def.seedSides && isSameOrientation(seedPoly, p, tol))
    .sort((a, b) => (a.center.x ** 2 + a.center.y ** 2)
                   - (b.center.x ** 2 + b.center.y ** 2))

  const pool = sameOrient.length > 0
    ? sameOrient
    : polys.filter(p => p !== seedPoly && p.sides === def.seedSides)
        .sort((a, b) => (a.center.x ** 2 + a.center.y ** 2)
                       - (b.center.x ** 2 + b.center.y ** 2))

  if (pool.length === 0) { latticeCache.set(key, fallback); return fallback }

  const t1 = pool[0].center
  let t2: Vec2 = { x: -t1.y, y: t1.x }
  for (let i = 1; i < pool.length; i++) {
    const c = pool[i].center
    if (Math.abs(t1.x * c.y - t1.y * c.x) > tol) { t2 = c; break }
  }

  const result: [Vec2, Vec2] = [t1, t2]
  latticeCache.set(key, result)
  return result
}

/**
 * Generate all polygons visible in the given viewport for a tiling.
 *
 * The seed centre is snapped to the tiling's translation lattice so that
 * tile positions are stable across viewport shifts (panning).
 */
export function generateTiling(
  definition: TilingDefinition,
  viewport: Viewport,
  edgeLen: number,
): Polygon[] {
  const desired: Vec2 = {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  }
  const [t1, t2] = getTilingLattice(definition, edgeLen)
  const snapped = snapToLattice(desired, t1, t2)
  return generateTilingCore(definition, viewport, edgeLen, snapped)
}

/**
 * Deduplicate edges: polygons share edges, so each edge appears in 2 polygons.
 * Returns a map from edge-midpoint key to the set of polygon IDs that share it.
 */
export function buildEdgeMap(polygons: Polygon[]): Map<string, { a: Vec2; b: Vec2; polygonIds: string[] }> {
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
