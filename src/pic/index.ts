import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig, FigureConfig } from '../types/pattern'
import { computeContactRays, type ContactRay } from './stellation'
import { rayRayIntersect } from './intersect'
import { EPSILON, dist } from '../utils/math'

/**
 * Build a vertex-based adjacency map: polygons sharing at least one vertex
 * are considered neighbors. Returns polygonId → Set of neighbor polygonIds.
 */
function buildVertexAdjacency(polygons: Polygon[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  const vertexToPolygons = new Map<string, string[]>()
  const f = 1000

  for (const poly of polygons) {
    adj.set(poly.id, new Set())
  }

  for (const poly of polygons) {
    for (const v of poly.vertices) {
      const key = `${Math.round(v.x * f)},${Math.round(v.y * f)}`
      const list = vertexToPolygons.get(key)
      if (list) {
        list.push(poly.id)
      } else {
        vertexToPolygons.set(key, [poly.id])
      }
    }
  }

  for (const polyIds of vertexToPolygons.values()) {
    for (let i = 0; i < polyIds.length; i++) {
      for (let j = i + 1; j < polyIds.length; j++) {
        adj.get(polyIds[i])!.add(polyIds[j])
        adj.get(polyIds[j])!.add(polyIds[i])
      }
    }
  }

  return adj
}

/**
 * Run the full PIC pipeline for all polygons.
 *
 * Uses neighbor-scoped ray intersection: each ray finds its nearest
 * intersection with rays from the same polygon or vertex-adjacent polygons.
 * This ensures lines connect across polygon boundaries while avoiding
 * O(N²) all-pairs checks.
 *
 * When autoLineLength is false, line length is an absolute value based
 * on the polygon's inradius, independent of the contact angle.
 */
export function runPIC(polygons: Polygon[], config: PatternConfig): Segment[] {
  // Step 1: Compute all rays, grouped by polygon
  const tagged: { ray: ContactRay; fig: FigureConfig; inradius: number }[] = []
  const raysByPolygon = new Map<string, number[]>()

  for (const poly of polygons) {
    const fig = config.figures[poly.sides]
    if (!fig) continue
    const rays = computeContactRays(poly, fig.contactAngle)
    // Inradius = distance from center to edge midpoint (ray origin)
    const inradius = rays.length > 0 ? dist(poly.center, rays[0].origin) : 0
    const indices: number[] = []
    for (const ray of rays) {
      indices.push(tagged.length)
      tagged.push({ ray, fig, inradius })
    }
    raysByPolygon.set(poly.id, indices)
  }

  // Step 2: Build vertex-based adjacency (polygons sharing a vertex)
  const adj = buildVertexAdjacency(polygons)

  // Step 3: For each ray, find nearest intersection with rays from
  // the same polygon and vertex-adjacent polygons only
  const segments: Segment[] = []

  for (let i = 0; i < tagged.length; i++) {
    const { ray: r1, fig, inradius } = tagged[i]
    let nearestT = Infinity

    const neighbors = adj.get(r1.polygonId)
    const candidatePolyIds = neighbors
      ? [r1.polygonId, ...neighbors]
      : [r1.polygonId]

    for (const polyId of candidatePolyIds) {
      const indices = raysByPolygon.get(polyId)
      if (!indices) continue
      for (const j of indices) {
        if (i === j) continue
        const { ray: r2 } = tagged[j]

        // Skip rays from the same edge (they share an origin)
        if (r1.polygonId === r2.polygonId && r1.edgeIndex === r2.edgeIndex) continue

        const result = rayRayIntersect(r1.origin, r1.dir, r2.origin, r2.dir)
        if (!result) continue
        if (result.t1 < EPSILON || result.t2 < EPSILON) continue

        if (result.t1 < nearestT) {
          nearestT = result.t1
        }
      }
    }

    if (fig.autoLineLength) {
      if (nearestT < Infinity) {
        segments.push({
          from: r1.origin,
          to: {
            x: r1.origin.x + r1.dir.x * nearestT,
            y: r1.origin.y + r1.dir.y * nearestT,
          },
          edgeMidpoint: r1.origin,
          polygonId: r1.polygonId,
        })
      }
    } else {
      // Absolute line length based on inradius, independent of contact angle
      const t = fig.lineLength * inradius
      segments.push({
        from: r1.origin,
        to: {
          x: r1.origin.x + r1.dir.x * t,
          y: r1.origin.y + r1.dir.y * t,
        },
        edgeMidpoint: r1.origin,
        polygonId: r1.polygonId,
      })
    }
  }

  return segments
}
