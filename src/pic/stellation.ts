import { Vec2, normalize, rotate, perp, midpoint, degToRad, signedArea, sub, add } from '../utils/math'
import type { Polygon } from '../types/geometry'

export interface ContactRay {
  origin: Vec2     // edge midpoint
  dir: Vec2        // direction into the polygon
  polygonId: string
  edgeIndex: number
  side: 'plus' | 'minus'
}

/**
 * For a given polygon and contact angle θ (degrees),
 * compute the two contact rays for each edge.
 *
 * The contact angle θ is measured from the edge itself.
 * At θ=90° rays are perpendicular (fully open).
 * At θ=0° rays run parallel to the edge (closed).
 * The useful Islamic range is roughly 30°–80°.
 */
export function computeContactRays(poly: Polygon, contactAngleDeg: number): ContactRay[] {
  return computeContactRaysPerEdge(poly, () => contactAngleDeg)
}

/**
 * Per-edge-θ variant for the Morph engine (ADR-0009 §2): `angleDegForEdge`
 * is called once per edge with the edge index and midpoint, so a spatial
 * field can assign each edge its own contact angle. Because a shared edge
 * has one midpoint, both adjacent polygons derive the same θ there and
 * Strands stay straight through the contact point by construction.
 */
export function computeContactRaysPerEdge(
  poly: Polygon,
  angleDegForEdge: (edgeIndex: number, edgeMidpoint: Vec2) => number,
): ContactRay[] {
  const rays: ContactRay[] = []

  for (let i = 0; i < poly.sides; i++) {
    const A = poly.vertices[i]
    const B = poly.vertices[(i + 1) % poly.sides]
    const origin = midpoint(A, B)
    const edgeDir = normalize({ x: B.x - A.x, y: B.y - A.y })
    const theta = degToRad(angleDegForEdge(i, origin))

    // Two rays symmetrically about the inward normal at angle (π/2 - θ) from it.
    // For a CW polygon in SVG (y-down), the inward normal is perp(edgeDir)
    // (the left-hand / CCW perpendicular). We rotate the inward normal by
    // ±(π/2 - θ) to get two rays that both point into the polygon interior.
    const alpha = Math.PI / 2 - theta
    const inwardNormal = perp(edgeDir)

    rays.push({
      origin,
      dir: rotate(inwardNormal, alpha),
      polygonId: poly.id,
      edgeIndex: i,
      side: 'plus',
    })
    rays.push({
      origin,
      dir: rotate(inwardNormal, -alpha),
      polygonId: poly.id,
      edgeIndex: i,
      side: 'minus',
    })
  }

  return rays
}

export interface VertexRay {
  origin: Vec2       // vertex position
  dir: Vec2          // direction into the polygon
  polygonId: string
  vertexIndex: number
  side: 'plus' | 'minus'
}

/**
 * For a given polygon and contact angle θ (degrees),
 * compute two rays at each vertex, symmetric about the
 * interior angle bisector.
 *
 * The bisector points inward (toward polygon center).
 * Rays are rotated by ±(π/2 − θ) from the bisector,
 * mirroring the edge-midpoint convention.
 */
export function computeVertexRays(poly: Polygon, contactAngleDeg: number): VertexRay[] {
  return computeVertexRaysPerVertex(poly, () => contactAngleDeg)
}

/**
 * Per-vertex-θ variant for the Morph engine: `angleDegForVertex` is called
 * once per vertex, so a spatial field can assign each vertex its own contact
 * angle. A shared vertex is one world point, so every polygon meeting there
 * derives the same θ (the vertex-line analogue of the per-edge-midpoint rule).
 */
export function computeVertexRaysPerVertex(
  poly: Polygon,
  angleDegForVertex: (vertexIndex: number, vertex: Vec2) => number,
): VertexRay[] {
  const rays: VertexRay[] = []
  const windingSign = signedArea(poly.vertices) > 0 ? 1 : -1

  for (let k = 0; k < poly.sides; k++) {
    const V = poly.vertices[k]
    const alpha = Math.PI / 2 - degToRad(angleDegForVertex(k, V))
    const prev = poly.vertices[(k - 1 + poly.sides) % poly.sides]
    const next = poly.vertices[(k + 1) % poly.sides]

    // Two edge directions emanating from vertex k
    const toPrev = normalize(sub(prev, V))
    const toNext = normalize(sub(next, V))

    // Interior angle bisector (points inward for convex polygons).
    //
    // At a STRAIGHT (180°) vertex `toPrev` and `toNext` are exact opposites, so
    // their sum is the zero vector and `normalize` returns whatever direction
    // the rounding error happens to point in. Both rays at that vertex are then
    // junk, and — because `pairVertexAtEdge` pairs adjacent vertices — every
    // edge touching it inherits the noise: on archimedes-star's C6 12-gon
    // (angles 120,180,120,180,…) that decided which edges emitted vertex lines
    // at all, so six edges silently produced nothing and the surviving six were
    // not a symmetry orbit (#53).
    //
    // Straight vertices are real here: they are the half-edge joints that keep
    // that tiling edge-to-edge. The interior direction is simply the inward edge
    // normal, which is what `rosettePatch.ts::vertexFrame` already uses for the
    // same degeneracy.
    const sum = add(toPrev, toNext)
    const bisector = Math.hypot(sum.x, sum.y) < 1e-6
      ? (() => {
          const nrm = perp(normalize(sub(next, V)))
          return windingSign > 0 ? nrm : { x: -nrm.x, y: -nrm.y }
        })()
      : normalize(sum)

    rays.push({
      origin: V,
      dir: rotate(bisector, alpha),
      polygonId: poly.id,
      vertexIndex: k,
      side: 'plus',
    })
    rays.push({
      origin: V,
      dir: rotate(bisector, -alpha),
      polygonId: poly.id,
      vertexIndex: k,
      side: 'minus',
    })
  }

  return rays
}
