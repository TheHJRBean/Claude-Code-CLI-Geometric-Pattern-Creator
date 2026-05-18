import type { Vec2 } from '../utils/math'
import { centroid, pointInPolygon } from '../utils/math'
import type { EditorCell, EditorTile } from '../types/editor'
import { tileVertices, EDITOR_EPS } from './exposedEdges'
import { ensureCCW, tryRegularFit } from './complete'

/**
 * Step 17.11.5 — multi-vertex Complete (N ≥ 3).
 *
 * Click order = polygon order: the user takes responsibility for picking
 * vertices in a sequence that forms a simple closed polygon. We defensively
 * reject self-intersections and picks whose centroid lands inside an
 * existing Tile.
 *
 * The output is a regular `EditorTile` if the picks happen to form a regular
 * n-gon (Decision 10), otherwise an irregular `EditorTile` (Decision 12).
 * Both inherit `source: 'completed'` so they remain editable / deletable.
 *
 * Cross-boundary case: when the user picks neighbour-stamp vertices, the
 * resulting Tile has vertices that straddle the Boundary edge. Decision 5
 * (Tiles can poke outside, neighbour stamps overlap) covers this — no new
 * tile kind needed.
 */

export type NGapValidation =
  | { kind: 'valid' }
  | { kind: 'too-few' }
  | { kind: 'duplicate-vertex' }
  | { kind: 'self-intersecting' }
  | { kind: 'inside-tile' }

function pointsCoincide(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < EDITOR_EPS && Math.abs(a.y - b.y) < EDITOR_EPS
}

/** Strict crossing of two open line segments (shared endpoints don't count). */
function segmentsCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
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

function isSimplePolygon(verts: Vec2[]): boolean {
  const n = verts.length
  if (n < 3) return false
  for (let i = 0; i < n; i++) {
    const a1 = verts[i]
    const a2 = verts[(i + 1) % n]
    for (let j = i + 2; j < n; j++) {
      // Edge i and edge n-1 share vertex 0 when i = 0 — skip that pair too.
      if (i === 0 && j === n - 1) continue
      const b1 = verts[j]
      const b2 = verts[(j + 1) % n]
      if (segmentsCross(a1, a2, b1, b2)) return false
    }
  }
  return true
}

export function validateNGapPolygon(picks: Vec2[], cell: EditorCell): NGapValidation {
  if (picks.length < 3) return { kind: 'too-few' }
  // Reject any duplicate vertex (consecutive or not — coincident vertices
  // produce zero-length edges that confuse downstream PIC).
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      if (pointsCoincide(picks[i], picks[j])) return { kind: 'duplicate-vertex' }
    }
  }
  if (!isSimplePolygon(picks)) return { kind: 'self-intersecting' }
  const c = centroid(picks)
  for (const tile of cell.tiles) {
    if (pointInPolygon(c, tileVertices(tile))) return { kind: 'inside-tile' }
  }
  return { kind: 'valid' }
}

export function completeNGap(
  cell: EditorCell,
  picks: Vec2[],
  newId: string,
  force = false,
): EditorTile | null {
  const v = validateNGapPolygon(picks, cell)
  // Hard geometric failures stay blocked even with force; only the soft
  // `inside-tile` rule is overridable (centroid happens to land in an
  // existing Tile — the user is asserting they meant it).
  if (v.kind !== 'valid' && !(force && v.kind === 'inside-tile')) return null
  const verts = ensureCCW([...picks])
  const reg = tryRegularFit({ vertices: verts })
  if (reg) {
    return {
      id: newId,
      kind: 'regular',
      sides: reg.sides,
      center: reg.center,
      edgeLength: reg.edgeLength,
      rotation: reg.rotation,
      source: 'completed',
    }
  }
  return {
    id: newId,
    kind: 'irregular',
    vertices: verts,
    source: 'completed',
  }
}
