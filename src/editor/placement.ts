import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorCell, EditorRegularTile, EditorTile } from '../types/editor'
import { regularPolygonVertices } from './regularPolygon'
import { EDITOR_EPS, tileInteriorAngleAt, tileVertices, type ExposedEdge } from './exposedEdges'
import { placedTileOverlaps } from './tileOverlap'

/**
 * The candidate set for the viable-polygon picker (Q10).
 *
 * Skips n=11 (irrational vertex angles, produces awkward gaps with most
 * neighbours) and stops at 12 — the standard Islamic-geometry palette.
 */
export const PICKER_SIDES = [3, 4, 5, 6, 7, 8, 9, 10, 12] as const

/**
 * Place a regular n-gon on `edge` with one of its edges coincident with the
 * source edge `(p1, p2)` and its centre on the side opposite the source tile.
 *
 * The new tile's CCW vertex 0 is `p2` and vertex 1 is `p1`, so the shared
 * edge is the new tile's edge 0→1 traversed in the new tile's CCW order
 * (i.e., the reverse of the source's CCW traversal — as it must be, since
 * the two tiles sit on opposite sides of the same edge).
 */
export function placeRegularNGonOnEdge(
  sides: number,
  edgeLength: number,
  p1: Vec2,
  p2: Vec2,
  sourceCenter: Vec2,
  id: string,
): EditorRegularTile {
  const midX = (p1.x + p2.x) / 2
  const midY = (p1.y + p2.y) / 2
  const dx = midX - sourceCenter.x
  const dy = midY - sourceCenter.y
  const len = Math.hypot(dx, dy) || 1
  const outX = dx / len
  const outY = dy / len
  const apothem = edgeLength / (2 * Math.tan(Math.PI / sides))
  const center: Vec2 = { x: midX + outX * apothem, y: midY + outY * apothem }
  const rotation = Math.atan2(p2.y - center.y, p2.x - center.x)
  return {
    id,
    kind: 'regular',
    sides,
    center,
    edgeLength,
    rotation,
    source: 'placed',
  }
}

/**
 * Decision 7 viability check: at every vertex shared with existing Tiles, the
 * sum of interior angles across all incident Tiles (existing + the candidate)
 * must be ≤ 2π. Equivalent to "the new polygon doesn't overlap any existing
 * Tile around shared vertices".
 *
 * For 17.3 only the two endpoints of the source edge are shared by
 * construction. Future steps may extend to all candidate vertices.
 *
 * `edgeLength` is the Patch's shared edge length (Decision 14) — used to size
 * the candidate polygon for the stronger overlap probe.
 */
export function isPlacementViable(
  edge: ExposedEdge,
  sides: number,
  cell: EditorCell,
  _edgeLength: number,
): boolean {
  if (sides < 3) return false
  // Decision 14a (relaxed 2026-05-17): instead of rejecting non-conforming
  // edges, the placement sizes itself to the source edge's actual length so
  // the new tile lands flush against it. This unblocks the multi-cell
  // slider workflow: scaling `patch.edgeLength` past the seed tile's edge
  // length used to mark every existing edge non-conforming and freeze the
  // picker on "no polygon fits here". Mixed-size Patches are now accepted.
  void _edgeLength

  const newAngle = ((sides - 2) * Math.PI) / sides
  if (!checkAngleSum(edge.p1, newAngle, cell.tiles)) return false
  if (!checkAngleSum(edge.p2, newAngle, cell.tiles)) return false

  // Stronger overlap guard for cases the angle-sum test misses (large
  // candidate n-gons that wrap past non-adjacent existing tiles, where no
  // vertex coincides with the new tile). The shared body-overlap probe
  // (centre-containment + edge-cross/vertex-intrusion) is identical across the
  // edge / boundary-section / vertex validators.
  const candidate = placeRegularNGonOnEdge(sides, edge.length, edge.p1, edge.p2, edge.sourceCenter, '__probe__')
  const candidateVerts = regularPolygonVertices(candidate.sides, candidate.center, candidate.edgeLength, candidate.rotation)
  if (placedTileOverlaps(candidateVerts, candidate.center, cell.tiles)) return false
  return true
}

function checkAngleSum(p: Vec2, newAngle: number, existing: EditorTile[]): boolean {
  let sum = newAngle
  for (const tile of existing) {
    const verts = tileVertices(tile)
    for (let i = 0; i < verts.length; i++) {
      if (pointsEqual(verts[i], p, EDITOR_EPS)) {
        sum += tileInteriorAngleAt(tile, verts, i)
      }
    }
  }
  return sum <= 2 * Math.PI + EDITOR_EPS
}

/** Subset of `PICKER_SIDES` that pass `isPlacementViable` for the given edge. */
export function viableSidesForEdge(edge: ExposedEdge, cell: EditorCell, edgeLength: number): number[] {
  return PICKER_SIDES.filter(n => isPlacementViable(edge, n, cell, edgeLength))
}
