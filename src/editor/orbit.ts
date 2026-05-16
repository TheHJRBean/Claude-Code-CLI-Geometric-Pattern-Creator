import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorCell, EditorTile } from '../types/editor'
import { EDITOR_EPS, computeExposedEdges, tileVertices, type ExposedEdge } from './exposedEdges'
import { applySym, boundarySymmetries } from './symmetry'
import { isPlacementViable, placeRegularNGonOnEdge, PICKER_SIDES, viableSidesForEdge as viableSidesSingle } from './placement'
import { computeAllCycles, computeBoundaryCycle } from './boundary'
import { neighbourCycleVertices } from './lattice'
import { completeNGap } from './completeN'

/**
 * Step 17.4 (re-enabled) — orbit-symmetric edge resolution and placement
 * under a user-selectable subgroup of the Cell-Boundary's dihedral group.
 *
 * Subgroup is read from `cell.symmetryMode` (default `'none'` =
 * single-edge behaviour). When the subgroup is identity-only these helpers
 * collapse to the 17.3 behaviour: one edge clicked → one tile placed; one
 * tile deleted → that tile only.
 */

/**
 * Given a clicked edge, return the set of distinct exposed edges it maps to
 * under the subgroup picked by `cell.symmetryMode`. An orbit element is
 * included only if the transformed endpoints match an existing exposed edge
 * (within `EDITOR_EPS`). Asymmetric setups (e.g. triangle Seed Tile in a
 * square Boundary) silently drop orbit images that don't land on a real edge.
 *
 * Distinct: dedup by `(tileId, edgeIndex)` so the picked edge itself counts
 * once even when multiple group elements map to it.
 */
export function orbitEdges(cell: EditorCell, edgeLength: number, picked: ExposedEdge): ExposedEdge[] {
  const all = computeExposedEdges(cell, edgeLength)
  const syms = boundarySymmetries(cell.shape, cell.symmetryMode ?? 'none')
  const seen = new Map<string, ExposedEdge>()

  for (const s of syms) {
    const q1 = applySym(s, picked.p1)
    const q2 = applySym(s, picked.p2)
    for (const cand of all) {
      if (
        (pointsEqual(cand.p1, q1, EDITOR_EPS) && pointsEqual(cand.p2, q2, EDITOR_EPS)) ||
        (pointsEqual(cand.p1, q2, EDITOR_EPS) && pointsEqual(cand.p2, q1, EDITOR_EPS))
      ) {
        const key = `${cand.tileId}|${cand.edgeIndex}`
        if (!seen.has(key)) seen.set(key, cand)
        break
      }
    }
  }

  return Array.from(seen.values())
}

/**
 * All-or-nothing orbit placement. Resolves orbit edges, validates each one
 * against `isPlacementViable`, and either appends every resulting tile or
 * returns `null` (if any orbit image fails — symmetry must never partially
 * break).
 */
export function placeTilesOnOrbit(
  cell: EditorCell,
  edgeLength: number,
  picked: ExposedEdge,
  sides: number,
  idPrefix: string,
): EditorTile[] | null {
  const edges = orbitEdges(cell, edgeLength, picked)
  if (edges.length === 0) return null

  // Build placements one at a time against a *cumulative* state so that two
  // orbit-equivalent placements which would touch the same future vertex
  // don't both individually pass viability and then overlap each other.
  let working: EditorCell = cell
  const placements: EditorTile[] = []
  for (let i = 0; i < edges.length; i++) {
    // Re-fetch the edge from `working` — endpoint coords are stable but the
    // edge's identity moves as new tiles appear; refresh by endpoint match.
    const fresh = computeExposedEdges(working, edgeLength).find(
      e => (pointsEqual(e.p1, edges[i].p1, EDITOR_EPS) && pointsEqual(e.p2, edges[i].p2, EDITOR_EPS))
        || (pointsEqual(e.p1, edges[i].p2, EDITOR_EPS) && pointsEqual(e.p2, edges[i].p1, EDITOR_EPS)),
    )
    if (!fresh) return null
    if (!isPlacementViable(fresh, sides, working, edgeLength)) return null
    const tile = placeRegularNGonOnEdge(
      sides,
      edgeLength,
      fresh.p1,
      fresh.p2,
      fresh.sourceCenter,
      `${idPrefix}-${i}`,
    )
    placements.push(tile)
    working = { ...working, tiles: [...working.tiles, tile] }
  }
  return placements
}

/**
 * Identify all tile ids that are orbit-equivalent to `tile` under the
 * Cell-Boundary's chosen subgroup. Used by orbit-aware delete: removing one
 * propagated tile should remove every sibling that came in with it.
 *
 * Equivalence is geometric (centre matches under some subgroup element),
 * not provenance-based — so this also catches manually-placed tiles that
 * happen to sit at orbit-equivalent positions.
 */
export function orbitTileIds(cell: EditorCell, tile: EditorTile): string[] {
  const center = tile.kind === 'regular' ? tile.center : centroidOf(tileVertices(tile))
  const syms = boundarySymmetries(cell.shape, cell.symmetryMode ?? 'none')
  const ids = new Set<string>([tile.id])

  for (const s of syms) {
    const q = applySym(s, center)
    for (const other of cell.tiles) {
      const oc = other.kind === 'regular' ? other.center : centroidOf(tileVertices(other))
      if (pointsEqual(q, oc, EDITOR_EPS)) ids.add(other.id)
    }
  }
  return Array.from(ids)
}

function centroidOf(verts: Vec2[]): Vec2 {
  let x = 0, y = 0
  for (const v of verts) { x += v.x; y += v.y }
  return { x: x / verts.length, y: y / verts.length }
}

/**
 * Step 17.11b — orbit propagation for multi-vertex Complete.
 *
 * Apply each subgroup element to the user's pick list, building one tile
 * per surviving orbit image. Mirrors `placeTilesOnOrbit` conventions:
 *
 *   (a) All-or-nothing on validation. If any orbit image's polygon fails
 *       `completeNGap` against the cumulative working state, return `null`
 *       — symmetry must never partially break.
 *   (b) Vertex-coincidence gate. Each transformed pick must coincide with
 *       a real selectable vertex from the *initial* Cell (Cell outer /
 *       Boundary corners / pocket cycles / neighbour cycles). Orbit
 *       images that fail this are silently dropped (asymmetric-Cell case
 *       — the gap doesn't exist on that orbit branch).
 *   (c) Centroid dedup. Symmetry transforms whose orbit image coincides
 *       with an earlier one (picks on a fixed axis, etc.) collapse to one
 *       tile.
 *   (d) `symmetryMode='none'` returns the identity-only group, so this
 *       function trivially produces the 17.11 single-instance result.
 */
export function placePolygonsOnOrbit(
  cell: EditorCell,
  picks: Vec2[],
  idPrefix: string,
): EditorTile[] | null {
  // Snapshot the selectable vertex set against the *initial* Cell. Vertex
  // positions don't move when sibling tiles get added later in the loop, so
  // this set stays valid across the cumulative build.
  const cycles = computeAllCycles(cell)
  const selectable: Vec2[] = [
    ...cycles.outer.map(v => v.p),
    ...cycles.pockets.flat().map(v => v.p),
    ...computeBoundaryCycle(cell).map(v => v.p),
    ...neighbourCycleVertices(cell, cycles.outer).flat().map(v => v.p),
  ]
  const inSelectable = (p: Vec2) =>
    selectable.some(q => pointsEqual(p, q, EDITOR_EPS))

  const syms = boundarySymmetries(cell.shape, cell.symmetryMode ?? 'none')
  const seenCentroids: Vec2[] = []
  const placements: EditorTile[] = []
  let working: EditorCell = cell

  for (let i = 0; i < syms.length; i++) {
    const transformed = picks.map(p => applySym(syms[i], p))
    if (!transformed.every(inSelectable)) continue
    const c = centroidOf(transformed)
    if (seenCentroids.some(q => pointsEqual(c, q, EDITOR_EPS))) continue
    seenCentroids.push(c)
    const tile = completeNGap(working, transformed, `${idPrefix}-${i}`)
    if (!tile) return null
    placements.push(tile)
    working = { ...working, tiles: [...working.tiles, tile] }
  }

  return placements.length > 0 ? placements : null
}

/**
 * Mode-aware picker filter: returns only those candidate side counts whose
 * full orbit placement would succeed (not just the single clicked edge).
 *
 * Without this gate the picker offers sizes that pass single-edge viability
 * but fail orbit-wide viability — the user clicks, the reducer's
 * `placeTilesOnOrbit` returns `null`, and the placement silently fails. The
 * orbit probe here matches the reducer's call exactly.
 */
export function viableSidesForEdge(edge: ExposedEdge, cell: EditorCell, edgeLength: number): number[] {
  const mode = cell.symmetryMode ?? 'none'
  if (mode === 'none') return viableSidesSingle(edge, cell, edgeLength)
  // Orbit-aware: a side is offered only if the full orbit placement succeeds.
  // Single-edge viability is a necessary condition, so prefilter to keep the
  // probe count small.
  return PICKER_SIDES.filter(n =>
    isPlacementViable(edge, n, cell, edgeLength)
    && placeTilesOnOrbit(cell, edgeLength, edge, n, '__probe__') !== null,
  )
}
