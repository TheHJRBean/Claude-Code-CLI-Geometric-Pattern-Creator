import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorConfig, EditorTile } from '../types/editor'
import { EDITOR_EPS, computeExposedEdges, tileVertices, type ExposedEdge } from './exposedEdges'
import { applySym, boundarySymmetries } from './symmetry'
import { isPlacementViable, placeRegularNGonOnEdge } from './placement'

/**
 * Step 17.4 — orbit-symmetric edge resolution.
 *
 * Given a clicked edge, return the set of distinct exposed edges it maps to
 * under the boundary's dihedral group. An orbit element is included only if
 * the transformed endpoints match an existing exposed edge (within
 * `EDITOR_EPS`). Asymmetric setups (e.g. triangle origin in a square
 * boundary) silently drop orbit images that don't land on a real edge.
 *
 * Distinct: dedup by `(tileId, edgeIndex)` so the picked edge itself counts
 * once even when multiple group elements map to it (e.g. axis-aligned edges
 * fixed by a reflection).
 */
export function orbitEdges(editor: EditorConfig, picked: ExposedEdge): ExposedEdge[] {
  const all = computeExposedEdges(editor)
  const syms = boundarySymmetries(editor.boundaryShape)
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
  editor: EditorConfig,
  picked: ExposedEdge,
  sides: number,
  idPrefix: string,
): EditorTile[] | null {
  const edges = orbitEdges(editor, picked)
  if (edges.length === 0) return null

  // Build placements one at a time against a *cumulative* state so that two
  // orbit-equivalent placements which would touch the same future vertex
  // don't both individually pass viability and then overlap each other.
  let working: EditorConfig = editor
  const placements: EditorTile[] = []
  for (let i = 0; i < edges.length; i++) {
    // Re-fetch the edge from `working` — endpoint coords are stable but the
    // edge's identity moves as new tiles appear; refresh by endpoint match.
    const fresh = computeExposedEdges(working).find(
      e => (pointsEqual(e.p1, edges[i].p1, EDITOR_EPS) && pointsEqual(e.p2, edges[i].p2, EDITOR_EPS))
        || (pointsEqual(e.p1, edges[i].p2, EDITOR_EPS) && pointsEqual(e.p2, edges[i].p1, EDITOR_EPS)),
    )
    if (!fresh) return null
    if (!isPlacementViable(fresh, sides, working)) return null
    const tile = placeRegularNGonOnEdge(
      sides,
      working.edgeLength,
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
 * boundary's symmetry. Used by orbit-aware delete: removing one propagated
 * tile should remove every sibling that came in with it.
 *
 * Equivalence is geometric (centre matches under some boundary symmetry),
 * not provenance-based — so this also catches manually-placed tiles that
 * happen to sit at orbit-equivalent positions.
 */
export function orbitTileIds(editor: EditorConfig, tile: EditorTile): string[] {
  const center = tile.kind === 'regular' ? tile.center : centroidOf(tileVertices(tile))
  const syms = boundarySymmetries(editor.boundaryShape)
  const ids = new Set<string>([tile.id])

  for (const s of syms) {
    const q = applySym(s, center)
    for (const other of editor.tiles) {
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
