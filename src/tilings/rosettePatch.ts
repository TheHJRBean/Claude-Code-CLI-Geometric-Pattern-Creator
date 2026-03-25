import type { Polygon } from '../types/geometry'
import type { TilingDefinition } from '../types/tiling'
import type { Viewport } from './archimedean'
import { circumradius, createPolygon, neighborPolygon, nextId, resetIds } from './shared'
import type { Vec2 } from '../utils/math'

/**
 * Build a single rosette patch: central n-gon + ring of n neighbor n-gons + gap fill polygons.
 * Returns the polygons and two translation vectors for periodic tiling.
 */
function buildPatch(
  n: number,
  center: Vec2,
  edgeLen: number,
): { polygons: Polygon[]; t1: Vec2; t2: Vec2 } {
  const R = circumradius(n, edgeLen)
  const phi = n % 4 === 0 ? Math.PI / n : 0
  const central = createPolygon(n, center, R, phi)

  const polygons: Polygon[] = [central]
  const ringPolygons: Polygon[] = []

  // Generate the ring of n neighbor n-gons, one per edge of the central polygon
  for (let i = 0; i < n; i++) {
    const A = central.vertices[i]
    const B = central.vertices[(i + 1) % n]
    const neighbor = neighborPolygon(A, B, n, edgeLen)
    polygons.push(neighbor)
    ringPolygons.push(neighbor)
  }

  // Fill gaps between adjacent ring polygons with triangular gap polygons.
  // Each gap is formed by vertices of two adjacent ring polygons that
  // are not shared with the central polygon or each other.
  for (let i = 0; i < n; i++) {
    const curr = ringPolygons[i]
    const next = ringPolygons[(i + 1) % n]

    // Find the gap vertices: the outer vertex of curr nearest to next,
    // the shared vertex (central.vertices[(i+1)%n]), and the outer vertex of next nearest to curr.
    const sharedVertex = central.vertices[(i + 1) % n]

    // Find the vertex of curr that is farthest from center and closest to next
    const currOuter = findGapVertex(curr, sharedVertex, central.center, next.center)
    // Find the vertex of next that is farthest from center and closest to curr
    const nextOuter = findGapVertex(next, sharedVertex, central.center, curr.center)

    if (currOuter && nextOuter) {
      // Create a triangular gap polygon
      const gapCenter: Vec2 = {
        x: (sharedVertex.x + currOuter.x + nextOuter.x) / 3,
        y: (sharedVertex.y + currOuter.y + nextOuter.y) / 3,
      }
      const gapPoly: Polygon = {
        id: nextId(),
        sides: 3,
        vertices: [sharedVertex, currOuter, nextOuter],
        center: gapCenter,
      }
      polygons.push(gapPoly)
    }
  }

  // Compute periodic translation vectors from the patch geometry.
  // The patch has approximate extent based on the circumradius of the ring.
  const apothem = edgeLen / (2 * Math.tan(Math.PI / n))
  const ringDist = 2 * apothem // center-to-center distance between central and ring polygons
  const patchRadius = ringDist + R // approximate extent

  // Use a rectangular lattice that tiles the patches
  // Offset every other row by half for better coverage
  const t1: Vec2 = { x: patchRadius * 2, y: 0 }
  const t2: Vec2 = { x: patchRadius, y: patchRadius * Math.sqrt(3) }

  return { polygons, t1, t2 }
}

/**
 * Find the vertex of `poly` that is adjacent to `sharedVtx` on the polygon,
 * on the side facing toward `towardCenter`, and that is farthest from `awayCenter`.
 */
function findGapVertex(
  poly: Polygon,
  sharedVtx: Vec2,
  awayCenter: Vec2,
  _towardCenter: Vec2,
): Vec2 | null {
  // Find the index of sharedVtx in the polygon
  const EPS = 0.5
  let sharedIdx = -1
  for (let i = 0; i < poly.vertices.length; i++) {
    const v = poly.vertices[i]
    if (Math.abs(v.x - sharedVtx.x) < EPS && Math.abs(v.y - sharedVtx.y) < EPS) {
      sharedIdx = i
      break
    }
  }
  if (sharedIdx === -1) return null

  // The two adjacent vertices to sharedVtx on this polygon
  const n = poly.vertices.length
  const prev = poly.vertices[(sharedIdx - 1 + n) % n]
  const next = poly.vertices[(sharedIdx + 1) % n]

  // Pick the one that is farther from the central polygon's center
  const distPrev = (prev.x - awayCenter.x) ** 2 + (prev.y - awayCenter.y) ** 2
  const distNext = (next.x - awayCenter.x) ** 2 + (next.y - awayCenter.y) ** 2

  return distPrev > distNext ? prev : next
}

/**
 * Generate rosette patch tiling for non-Archimedean n-fold symmetries.
 *
 * Places a central n-gon surrounded by n copies sharing edges, fills gaps
 * with triangles, then tiles the patch periodically across the viewport.
 */
export function generateRosettePatch(
  definition: TilingDefinition,
  viewport: Viewport,
  edgeLen: number,
): Polygon[] {
  resetIds()
  const n = definition.seedSides
  const cx = viewport.x + viewport.width / 2
  const cy = viewport.y + viewport.height / 2

  // Build the prototype patch at origin to compute translation vectors
  const proto = buildPatch(n, { x: 0, y: 0 }, edgeLen)
  const { t1, t2 } = proto

  // Determine how many patch copies we need to cover the viewport
  const diag = Math.sqrt(viewport.width ** 2 + viewport.height ** 2) / 2
  const t1Len = Math.sqrt(t1.x ** 2 + t1.y ** 2)
  const t2Len = Math.sqrt(t2.x ** 2 + t2.y ** 2)
  const maxI = Math.ceil(diag / t1Len) + 1
  const maxJ = Math.ceil(diag / t2Len) + 1

  const allPolygons: Polygon[] = []
  const padded = {
    x: viewport.x - edgeLen * 3,
    y: viewport.y - edgeLen * 3,
    width: viewport.width + edgeLen * 6,
    height: viewport.height + edgeLen * 6,
  }

  for (let i = -maxI; i <= maxI; i++) {
    for (let j = -maxJ; j <= maxJ; j++) {
      const px = cx + i * t1.x + j * t2.x
      const py = cy + i * t1.y + j * t2.y

      // Quick bounds check: skip patches too far from viewport
      if (
        px < padded.x - t1Len ||
        px > padded.x + padded.width + t1Len ||
        py < padded.y - t2Len ||
        py > padded.y + padded.height + t2Len
      ) continue

      const patch = buildPatch(n, { x: px, y: py }, edgeLen)
      for (const poly of patch.polygons) {
        // Check if any vertex is within viewport
        let visible = false
        for (const v of poly.vertices) {
          if (v.x >= padded.x && v.x <= padded.x + padded.width &&
              v.y >= padded.y && v.y <= padded.y + padded.height) {
            visible = true
            break
          }
        }
        if (visible) allPolygons.push(poly)
      }

      if (allPolygons.length > 2000) break
    }
    if (allPolygons.length > 2000) break
  }

  return allPolygons
}
