import type { Vec2 } from '../utils/math'
import { centroid, pointInPolygon, pointsEqual } from '../utils/math'
import type { EditorTile } from '../types/editor'
import { EDITOR_EPS, edgesShareEndpoints, tileVertices } from './exposedEdges'

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

/** True if any of the 4 endpoint pairs is point-equal within `EDITOR_EPS`. */
function shareEndpoint(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  return pointsEqual(a1, b1, EDITOR_EPS)
    || pointsEqual(a1, b2, EDITOR_EPS)
    || pointsEqual(a2, b1, EDITOR_EPS)
    || pointsEqual(a2, b2, EDITOR_EPS)
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
  return overlapsExistingDetail(polygon, existingTiles) !== null
}

/**
 * Like `overlapsExisting` but returns a diagnostic record of which rule
 * fired and which tile triggered it, or `null` if no overlap. Used by the
 * preview UI to show a specific rejection reason to the user.
 */
export type OverlapDetail =
  | { rule: 'polygon-vertex-inside-tile'; polygonVertex: Vec2; tileIndex: number }
  | { rule: 'tile-vertex-inside-polygon'; tileVertex: Vec2; tileIndex: number }
  | { rule: 'edge-crossing'; polygonEdge: [Vec2, Vec2]; tileEdge: [Vec2, Vec2]; tileIndex: number }

export function overlapsExistingDetail(polygon: Vec2[], existingTiles: Vec2[][]): OverlapDetail | null {
  const onVerts = (p: Vec2, verts: Vec2[]) =>
    verts.some(v => pointsEqual(p, v, EDITOR_EPS))

  for (let ti = 0; ti < existingTiles.length; ti++) {
    const tile = existingTiles[ti]
    for (const p of polygon) {
      if (onVerts(p, tile)) continue
      if (pointInPolygon(p, tile)) return { rule: 'polygon-vertex-inside-tile', polygonVertex: p, tileIndex: ti }
    }
    for (const v of tile) {
      if (onVerts(v, polygon)) continue
      if (pointInPolygon(v, polygon)) return { rule: 'tile-vertex-inside-polygon', tileVertex: v, tileIndex: ti }
    }
    for (let i = 0; i < polygon.length; i++) {
      const a1 = polygon[i]
      const a2 = polygon[(i + 1) % polygon.length]
      for (let j = 0; j < tile.length; j++) {
        const b1 = tile[j]
        const b2 = tile[(j + 1) % tile.length]
        // Two segments that share an endpoint can never have a strict
        // interior crossing (line segments intersect in at most one point
        // or a sub-segment — a shared endpoint exhausts that). Skipping
        // them sidesteps a float-precision false positive where `orient`
        // accidentally returns tiny opposite signs for picks that lie on
        // a tile vertex.
        if (shareEndpoint(a1, a2, b1, b2)) continue
        if (segmentsStrictlyCross(a1, a2, b1, b2)) {
          return { rule: 'edge-crossing', polygonEdge: [a1, a2], tileEdge: [b1, b2], tileIndex: ti }
        }
      }
    }
  }
  return null
}

/**
 * Body-overlap probe shared by all three placement validators (edge /
 * boundary-section / vertex). True if a candidate placement — given its
 * vertices + centre — overlaps any existing Tile, by either:
 *   - centre containment (an existing Tile's centre inside the candidate, or
 *     the candidate's centre inside an existing Tile), or
 *   - the strict edge-cross / vertex-intrusion test (`overlapsExisting`).
 *
 * Each Tile's "centre" is its stored centre (regular) or its vertex centroid
 * (irregular). This was copy-pasted into `isPlacementViable`,
 * `isVertexPlacementViable`, and `isBoundarySectionPlacementViable`; it's the
 * one genuinely-shared primitive under those three names (the *placers*
 * themselves are legitimately distinct — they anchor differently).
 */
export function placedTileOverlaps(
  candidateVerts: Vec2[],
  candidateCenter: Vec2,
  tiles: EditorTile[],
): boolean {
  const bodies = tiles.map(t => {
    const verts = tileVertices(t)
    return { verts, center: t.kind === 'regular' ? t.center : centroid(verts) }
  })
  for (const b of bodies) {
    if (pointInPolygon(b.center, candidateVerts)) return true
    if (pointInPolygon(candidateCenter, b.verts)) return true
  }
  return overlapsExisting(candidateVerts, bodies.map(b => b.verts))
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
