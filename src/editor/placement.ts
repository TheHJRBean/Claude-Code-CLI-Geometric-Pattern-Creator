import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorConfig, EditorRegularTile, EditorTile } from '../types/editor'
import { EDITOR_EPS, tileVertices, type ExposedEdge } from './exposedEdges'

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
    origin: 'placed',
  }
}

/**
 * Decision 7 viability check: at every vertex shared with existing tiles, the
 * sum of interior angles across all incident tiles (existing + the candidate)
 * must be ≤ 2π. Equivalent to "the new polygon doesn't overlap any existing
 * tile around shared vertices".
 *
 * For 17.3 only the two endpoints of the source edge are shared by
 * construction. Future steps may extend to all candidate vertices.
 */
export function isPlacementViable(
  edge: ExposedEdge,
  sides: number,
  editor: EditorConfig,
): boolean {
  // Decision 14a: non-conforming edges (length ≠ origin's) are inert.
  if (!edge.conforming) return false
  if (sides < 3) return false

  const newAngle = ((sides - 2) * Math.PI) / sides
  return checkAngleSum(edge.p1, newAngle, editor.tiles) && checkAngleSum(edge.p2, newAngle, editor.tiles)
}

function checkAngleSum(p: Vec2, newAngle: number, existing: EditorTile[]): boolean {
  let sum = newAngle
  for (const tile of existing) {
    const verts = tileVertices(tile)
    for (let i = 0; i < verts.length; i++) {
      if (pointsEqual(verts[i], p, EDITOR_EPS)) {
        sum += interiorAngle(tile, verts, i)
      }
    }
  }
  return sum <= 2 * Math.PI + EDITOR_EPS
}

function interiorAngle(tile: EditorTile, verts: Vec2[], i: number): number {
  if (tile.kind === 'regular') return ((tile.sides - 2) * Math.PI) / tile.sides
  // Irregular: signed angle between edge to previous and edge to next vertex.
  const n = verts.length
  const prev = verts[(i - 1 + n) % n]
  const next = verts[(i + 1) % n]
  const v1x = prev.x - verts[i].x
  const v1y = prev.y - verts[i].y
  const v2x = next.x - verts[i].x
  const v2y = next.y - verts[i].y
  const cosA = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))
  return Math.acos(Math.max(-1, Math.min(1, cosA)))
}

/** Subset of `PICKER_SIDES` that pass `isPlacementViable` for the given edge. */
export function viableSidesForEdge(edge: ExposedEdge, editor: EditorConfig): number[] {
  return PICKER_SIDES.filter(n => isPlacementViable(edge, n, editor))
}
