import type { Vec2 } from '../utils/math'
import { pointInPolygon, pointsEqual } from '../utils/math'
import { EDITOR_EPS, edgesShareEndpoints } from './exposedEdges'

/**
 * Geometric validators for Complete-mode candidates.
 *
 * The reducer uses these to reject completions that would overlap existing
 * Tiles, and to enforce "first-layer adjacency" — multi-pick completions
 * must touch an existing Tile via at least one shared edge so the user can't
 * drop a Tile floating in empty space.
 *
 * All inputs are expected in the same coordinate frame. The reducer prepares
 * sibling-Cell tile vertex arrays by transforming through cellTransform +
 * inverse activeCellTransform before calling these.
 */

/**
 * Strict segment crossing (shared endpoints don't count as a crossing).
 * Mirrors the in-module `segmentsCross` in `completeN.ts` so callers don't
 * pull in that module's heavier validation surface.
 */
function segmentsStrictlyCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const orient = (p: Vec2, q: Vec2, r: Vec2) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = orient(b1, b2, a1)
  const d2 = orient(b1, b2, a2)
  const d3 = orient(a1, a2, b1)
  const d4 = orient(a1, a2, b2)
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
}

/**
 * True if `polygon` strictly overlaps any tile in `existingTiles` — i.e.,
 * they share interior area. Touching at a vertex or sharing an edge is NOT
 * an overlap (those are the "first-layer" placements we want to allow).
 *
 * Three-part test:
 *   1. Any polygon vertex strictly inside an existing tile (not on its boundary).
 *   2. Any existing-tile vertex strictly inside the polygon (not on its boundary).
 *   3. Any polygon edge strictly crosses an existing-tile edge.
 *
 * The "not on boundary" guard uses `pointsEqual` against the other polygon's
 * vertices with `EDITOR_EPS` — shared endpoints are accepted, true interior
 * intrusions are rejected.
 */
export function overlapsExisting(polygon: Vec2[], existingTiles: Vec2[][]): boolean {
  const onVerts = (p: Vec2, verts: Vec2[]) =>
    verts.some(v => pointsEqual(p, v, EDITOR_EPS))

  for (const tile of existingTiles) {
    // (1) polygon vertices strictly inside an existing tile
    for (const p of polygon) {
      if (onVerts(p, tile)) continue
      if (pointInPolygon(p, tile)) return true
    }
    // (2) existing-tile vertices strictly inside the polygon
    for (const v of tile) {
      if (onVerts(v, polygon)) continue
      if (pointInPolygon(v, polygon)) return true
    }
    // (3) edge-edge strict crossings
    for (let i = 0; i < polygon.length; i++) {
      const a1 = polygon[i]
      const a2 = polygon[(i + 1) % polygon.length]
      for (let j = 0; j < tile.length; j++) {
        const b1 = tile[j]
        const b2 = tile[(j + 1) % tile.length]
        if (segmentsStrictlyCross(a1, a2, b1, b2)) return true
      }
    }
  }
  return false
}

/**
 * True if `polygon` shares at least one full edge (endpoint-coincident) with
 * any tile in `existingTiles`. Used to enforce the first-layer adjacency
 * rule: a multi-pick completion floating in empty space is rejected.
 *
 * Chord-mode completions don't need this check — `completeGap`'s arc-walking
 * always borrows edges from the existing cycle by construction.
 */
export function sharesEdgeWithExisting(polygon: Vec2[], existingTiles: Vec2[][]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a1 = polygon[i]
    const a2 = polygon[(i + 1) % polygon.length]
    for (const tile of existingTiles) {
      for (let j = 0; j < tile.length; j++) {
        const b1 = tile[j]
        const b2 = tile[(j + 1) % tile.length]
        if (edgesShareEndpoints(a1, a2, b1, b2)) return true
      }
    }
  }
  return false
}
