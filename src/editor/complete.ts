import type { Vec2 } from '../utils/math'
import { centroid, pointInPolygon } from '../utils/math'
import type { EditorPatch, EditorTile } from '../types/editor'
import { tileVertices, EDITOR_EPS } from './exposedEdges'
import { computeBoundaryCycle, computeOuterBoundary, type BoundaryVertex } from './boundary'
import { editorBoundaryVertices } from './buildEditorPolygons'

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

function isPointInPatch(p: Vec2, editor: EditorPatch): boolean {
  for (const tile of editor.tiles) {
    if (pointInPolygon(p, tileVertices(tile))) return true
  }
  return false
}

export function ensureCCW(verts: Vec2[]): Vec2[] {
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
  editor: EditorPatch,
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
 * Like `computeGapPolygon` but disambiguates by excluding the arc whose
 * polygon contains the patch centre. Used when both picks land on the
 * boundary outline rather than the patch's outer cycle — there both arcs are
 * outside any tile, so the existing `isPointInPatch` test can't tell them
 * apart. A patch is always centred on the boundary's origin, so the arc
 * whose polygon does NOT contain `(0, 0)` is the gap to fill.
 */
function computeBoundaryGapPolygon(
  cycle: BoundaryVertex[],
  indexA: number,
  indexB: number,
): GapPolygon | null {
  const n = cycle.length
  if (n < 3 || indexA === indexB) return null
  const fwd = arcPath(cycle, indexA, indexB, 1)
  const bwd = arcPath(cycle, indexA, indexB, -1)
  const cands: Vec2[][] = []
  if (fwd.length >= 3) cands.push(fwd)
  if (bwd.length >= 3) cands.push(bwd)
  // Patch is centred on origin by construction; the arc whose polygon does
  // not enclose origin is the exterior-to-patch side.
  for (const cand of cands) {
    if (!pointInPolygon({ x: 0, y: 0 }, cand)) return { vertices: ensureCCW(cand) }
  }
  return null
}

function isDegenerateTriangle(verts: Vec2[]): boolean {
  if (verts.length !== 3) return false
  const [a, b, c] = verts
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return Math.abs(cross) < EDITOR_EPS
}

/**
 * Mixed-pick gap: one endpoint is on the patch's outer cycle, the other on
 * the boundary polygon's corners. A single chord across the patch+boundary
 * annulus is topologically under-specified (it doesn't split the annulus),
 * so we close the gap with a one-step neighbour from one of the cycles —
 * yielding a triangle with the chord as one edge.
 *
 * Try the four candidates (prev/next on patch, prev/next on boundary) and
 * return the first triangle that's non-degenerate, lies inside the boundary
 * polygon, and has a centroid exterior to every existing tile.
 */
function computeMixedGapPolygon(
  editor: EditorPatch,
  patchCycle: BoundaryVertex[],
  boundaryCycle: BoundaryVertex[],
  patchIdx: number,
  boundaryIdx: number,
): GapPolygon | null {
  const np = patchCycle.length
  const nb = boundaryCycle.length
  if (np < 2 || nb < 2) return null
  const pP = patchCycle[patchIdx].p
  const pB = boundaryCycle[boundaryIdx].p
  const patchNext = patchCycle[(patchIdx + 1) % np].p
  const patchPrev = patchCycle[(patchIdx - 1 + np) % np].p
  const boundNext = boundaryCycle[(boundaryIdx + 1) % nb].p
  const boundPrev = boundaryCycle[(boundaryIdx - 1 + nb) % nb].p

  const boundaryPoly = editorBoundaryVertices(editor)
  const candidates: Vec2[][] = [
    [pP, patchNext, pB],
    [pP, patchPrev, pB],
    [pP, pB, boundNext],
    [pP, pB, boundPrev],
  ]

  for (const cand of candidates) {
    if (isDegenerateTriangle(cand)) continue
    const c = centroid(cand)
    if (isPointInPatch(c, editor)) continue
    if (!pointInPolygon(c, boundaryPoly)) continue
    return { vertices: ensureCCW(cand) }
  }
  return null
}

/**
 * Compute the tile that completes the gap defined by the two picked vertex
 * positions, preferring a regular fit (Decision 10) and falling back to an
 * irregular tile (Decision 12 — first-class polygon, same data model).
 *
 * Picks may be on either cycle:
 *   - both on the patch's outer cycle (17.5 behaviour),
 *   - both on the boundary polygon's corners (boundary-arc fill),
 *   - one of each (mixed: triangle from chord + one neighbour edge).
 *
 * Returns `null` if no gap can be computed (degenerate pick, vertex not on
 * either cycle, chord lies entirely inside patch, etc.).
 */
export function completeGap(
  editor: EditorPatch,
  pA: Vec2,
  pB: Vec2,
  newId: string,
): EditorTile | null {
  let gap: GapPolygon | null = null

  const patchCycle = computeOuterBoundary(editor)
  const boundaryCycle = computeBoundaryCycle(editor)

  // 1) Both picks on the patch outer cycle (the common 17.5 case).
  if (patchCycle.length >= 3) {
    const ia = findCycleIndexByPoint(patchCycle, pA)
    const ib = findCycleIndexByPoint(patchCycle, pB)
    if (ia >= 0 && ib >= 0) gap = computeGapPolygon(patchCycle, ia, ib, editor)
  }

  // 2) Both picks on the boundary polygon's corners.
  if (!gap) {
    const ia = findCycleIndexByPoint(boundaryCycle, pA)
    const ib = findCycleIndexByPoint(boundaryCycle, pB)
    if (ia >= 0 && ib >= 0) gap = computeBoundaryGapPolygon(boundaryCycle, ia, ib)
  }

  // 3) Mixed: one patch vertex + one boundary corner.
  if (!gap) {
    const patchIdxA = findCycleIndexByPoint(patchCycle, pA)
    const patchIdxB = findCycleIndexByPoint(patchCycle, pB)
    const boundIdxA = findCycleIndexByPoint(boundaryCycle, pA)
    const boundIdxB = findCycleIndexByPoint(boundaryCycle, pB)
    if (patchIdxA >= 0 && boundIdxB >= 0) {
      gap = computeMixedGapPolygon(editor, patchCycle, boundaryCycle, patchIdxA, boundIdxB)
    } else if (patchIdxB >= 0 && boundIdxA >= 0) {
      gap = computeMixedGapPolygon(editor, patchCycle, boundaryCycle, patchIdxB, boundIdxA)
    }
  }

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
