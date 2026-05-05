import type { Vec2 } from '../utils/math'
import { centroid, pointInPolygon } from '../utils/math'
import type { EditorConfig, EditorTile } from '../types/editor'
import { tileVertices, EDITOR_EPS } from './exposedEdges'
import { computeOuterBoundary, type BoundaryVertex } from './boundary'

/**
 * The polygon used to "complete" a gap, returned by `computeGapPolygon`.
 *
 * `vertices` are in CCW order. The last edge (`vertices[n-1] → vertices[0]`)
 * is the closing chord between the two user-selected vertices; the rest are
 * existing outer-boundary edges that the new tile will share with the patch.
 */
export interface GapPolygon {
  vertices: Vec2[]
}

/** Walk the cycle from `indexA` to `indexB` in the chosen direction. */
function arcPath(cycle: BoundaryVertex[], indexA: number, indexB: number, dir: 1 | -1): Vec2[] {
  const n = cycle.length
  const out: Vec2[] = []
  for (let i = indexA; ; i = (i + dir + n) % n) {
    out.push(cycle[i].p)
    if (i === indexB) break
  }
  return out
}

function isPointInPatch(p: Vec2, editor: EditorConfig): boolean {
  for (const tile of editor.tiles) {
    if (pointInPolygon(p, tileVertices(tile))) return true
  }
  return false
}

function ensureCCW(verts: Vec2[]): Vec2[] {
  let area2 = 0
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length
    area2 += verts[i].x * verts[j].y - verts[j].x * verts[i].y
  }
  return area2 < 0 ? verts.slice().reverse() : verts
}

/**
 * Pick the arc between A and B (CCW or CW around the patch) whose
 * chord-and-arc polygon encloses an *exterior* region — that's the gap to
 * fill. The chord splits the plane: one side is patch-interior, the other
 * is the gap. We disambiguate by testing the candidate polygon's centroid
 * against every existing tile.
 *
 * Returns `null` if either arc is degenerate (A and B are adjacent on the
 * cycle so no fillable region exists), or if the chord doesn't enclose an
 * exterior region (e.g. a chord across a convex patch).
 */
export function computeGapPolygon(
  cycle: BoundaryVertex[],
  indexA: number,
  indexB: number,
  editor: EditorConfig,
): GapPolygon | null {
  const n = cycle.length
  if (n < 3 || indexA === indexB) return null

  const fwd = arcPath(cycle, indexA, indexB, 1)
  const bwd = arcPath(cycle, indexA, indexB, -1)
  const cands: Vec2[][] = []
  if (fwd.length >= 3) cands.push(fwd)
  if (bwd.length >= 3) cands.push(bwd)

  for (const cand of cands) {
    const c = centroid(cand)
    if (!isPointInPatch(c, editor)) return { vertices: ensureCCW(cand) }
  }
  return null
}

/**
 * Decision 10: prefer a regular polygon that fits the gap exactly. Returns
 * the regular-tile parameters if the gap polygon is a regular n-gon (within
 * `EDITOR_EPS`), otherwise `null`.
 *
 * "Regular" means all sides equal AND all interior angles equal — both
 * checks are necessary (e.g. a rhombus has equal sides but unequal angles).
 */
export function tryRegularFit(
  gap: GapPolygon,
): { sides: number; center: Vec2; edgeLength: number; rotation: number } | null {
  const verts = gap.vertices
  const n = verts.length
  if (n < 3) return null

  const sides: number[] = []
  for (let i = 0; i < n; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % n]
    sides.push(Math.hypot(b.x - a.x, b.y - a.y))
  }
  const s0 = sides[0]
  const sideTol = Math.max(EDITOR_EPS * 100, s0 * 1e-4)
  for (let i = 1; i < n; i++) if (Math.abs(sides[i] - s0) > sideTol) return null

  const targetAngle = ((n - 2) * Math.PI) / n
  const angleTol = 1e-4
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n]
    const curr = verts[i]
    const next = verts[(i + 1) % n]
    const v1x = prev.x - curr.x, v1y = prev.y - curr.y
    const v2x = next.x - curr.x, v2y = next.y - curr.y
    const cosA = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))
    const ang = Math.acos(Math.max(-1, Math.min(1, cosA)))
    if (Math.abs(ang - targetAngle) > angleTol) return null
  }

  const c = centroid(verts)
  const rotation = Math.atan2(verts[0].y - c.y, verts[0].x - c.x)
  return { sides: n, center: c, edgeLength: s0, rotation }
}

/**
 * Locate a picked vertex (by position) in the boundary cycle, comparing with
 * `EDITOR_EPS`. Returns `-1` if no match.
 */
export function findCycleIndexByPoint(cycle: BoundaryVertex[], p: Vec2): number {
  for (let i = 0; i < cycle.length; i++) {
    const q = cycle[i].p
    if (Math.abs(q.x - p.x) < EDITOR_EPS && Math.abs(q.y - p.y) < EDITOR_EPS) return i
  }
  return -1
}

/**
 * Compute the tile that completes the gap defined by the two picked vertex
 * positions, preferring a regular fit (Decision 10) and falling back to an
 * irregular tile (Decision 12 — first-class polygon, same data model).
 *
 * Returns `null` if no gap can be computed (degenerate pick, vertex not on
 * outer boundary, chord lies entirely inside patch, etc.).
 */
export function completeGap(
  editor: EditorConfig,
  pA: Vec2,
  pB: Vec2,
  newId: string,
): EditorTile | null {
  const cycle = computeOuterBoundary(editor)
  if (cycle.length < 3) return null
  const ia = findCycleIndexByPoint(cycle, pA)
  const ib = findCycleIndexByPoint(cycle, pB)
  if (ia < 0 || ib < 0) return null
  const gap = computeGapPolygon(cycle, ia, ib, editor)
  if (!gap) return null

  const reg = tryRegularFit(gap)
  if (reg) {
    return {
      id: newId,
      kind: 'regular',
      sides: reg.sides,
      center: reg.center,
      edgeLength: reg.edgeLength,
      rotation: reg.rotation,
      origin: 'completed',
    }
  }
  return {
    id: newId,
    kind: 'irregular',
    vertices: gap.vertices,
    origin: 'completed',
  }
}
