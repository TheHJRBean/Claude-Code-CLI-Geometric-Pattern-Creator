import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorCell } from '../types/editor'
import { EDITOR_EPS, computeExposedEdges } from './exposedEdges'
import { editorBoundaryVertices } from './buildEditorPolygons'

/** Directed perimeter piece fed to the cycle walk — an exposed edge or a
 * subdivision of one (tags inherited from the parent edge). */
interface CycleEdge {
  tileId: string
  edgeIndex: number
  p1: Vec2
  p2: Vec2
}

/**
 * Subdivide exposed edges at coincident vertices and cancel covered pieces.
 *
 * `computeExposedEdges` only cancels *exact full-edge* matches, so an edge
 * that abuts several shorter neighbour edges (multi-vertex Complete routinely
 * creates these — the picked polygon's side runs along two or more existing
 * tile edges) survives as "exposed" on BOTH sides. The raw edge set then
 * contains T-junctions and overlapping collinear runs, and the cycle walk
 * either cuts through the patch interior or discards whole perimeter
 * fragments — Complete-mode vertex dots vanish or appear in wrong places
 * (replicated on every neighbour ghost, which reuses these cycles).
 *
 * Fix: split every exposed edge at any other exposed edge's endpoint lying
 * strictly inside it, then drop opposite-direction coincident sub-edge pairs
 * (two tile interiors meet there — not perimeter) and dedupe same-direction
 * copies. What remains chains into clean cycles.
 */
function subdivideAndCancel(edges: { tileId: string; edgeIndex: number; p1: Vec2; p2: Vec2 }[]): CycleEdge[] {
  // Distinct endpoint pool — the only places a T-junction can occur.
  const pts: Vec2[] = []
  for (const e of edges) {
    for (const p of [e.p1, e.p2]) {
      if (!pts.some(q => pointsEqual(p, q, EDITOR_EPS))) pts.push(p)
    }
  }

  const subs: CycleEdge[] = []
  for (const e of edges) {
    const dx = e.p2.x - e.p1.x
    const dy = e.p2.y - e.p1.y
    const len2 = dx * dx + dy * dy
    if (len2 < EDITOR_EPS * EDITOR_EPS) continue
    const cuts: { t: number; p: Vec2 }[] = []
    for (const p of pts) {
      const t = ((p.x - e.p1.x) * dx + (p.y - e.p1.y) * dy) / len2
      if (t <= 0 || t >= 1) continue
      const proj = { x: e.p1.x + t * dx, y: e.p1.y + t * dy }
      if (
        pointsEqual(proj, p, EDITOR_EPS)
        && !pointsEqual(p, e.p1, EDITOR_EPS)
        && !pointsEqual(p, e.p2, EDITOR_EPS)
      ) {
        cuts.push({ t, p })
      }
    }
    cuts.sort((a, b) => a.t - b.t)
    let prev = e.p1
    for (const c of cuts) {
      if (!pointsEqual(prev, c.p, EDITOR_EPS)) {
        subs.push({ tileId: e.tileId, edgeIndex: e.edgeIndex, p1: prev, p2: c.p })
        prev = c.p
      }
    }
    if (!pointsEqual(prev, e.p2, EDITOR_EPS)) {
      subs.push({ tileId: e.tileId, edgeIndex: e.edgeIndex, p1: prev, p2: e.p2 })
    }
  }

  // Opposite-direction coincident pairs cancel (covered edge ↔ covering run);
  // same-direction coincident copies collapse to one.
  const removed = new Array<boolean>(subs.length).fill(false)
  for (let i = 0; i < subs.length; i++) {
    if (removed[i]) continue
    for (let j = i + 1; j < subs.length; j++) {
      if (removed[j]) continue
      const a = subs[i]
      const b = subs[j]
      if (pointsEqual(a.p1, b.p2, EDITOR_EPS) && pointsEqual(a.p2, b.p1, EDITOR_EPS)) {
        removed[i] = true
        removed[j] = true
        break
      }
      if (pointsEqual(a.p1, b.p1, EDITOR_EPS) && pointsEqual(a.p2, b.p2, EDITOR_EPS)) {
        removed[j] = true
      }
    }
  }
  return subs.filter((_, i) => !removed[i])
}

/**
 * One vertex on the patch's outer boundary, tagged with the tile and vertex
 * index it came from so a click maps unambiguously back to a tile + index
 * pair (the persistence-friendly identifier we ship through the reducer).
 */
export interface BoundaryVertex {
  p: Vec2
  /** Owning tile id of the exposed edge whose `p1` is this vertex. */
  tileId: string
  /**
   * Vertex index within the owning tile. The exposed edge runs
   * `tile.vertices[vertexIndex] → tile.vertices[(vertexIndex + 1) % n]`.
   */
  vertexIndex: number
}

/** Signed area of a closed vertex cycle (positive = CCW, negative = CW). */
function cycleSignedArea(cycle: BoundaryVertex[]): number {
  let a = 0
  const n = cycle.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += cycle[i].p.x * cycle[j].p.y - cycle[j].p.x * cycle[i].p.y
  }
  return a / 2
}

/**
 * Walk every closed cycle in the patch's exposed edges. Returns the **outer**
 * cycle (the largest CCW cycle — patch interior on its left) plus zero-or-more
 * **pocket** cycles (interior holes; CW around the pocket interior since the
 * tiles bordering them have their interior facing outward).
 *
 * Disconnected sub-cycles (mid-construction inconsistency) are discarded.
 *
 * 17.11.0: this is the foundation for multi-vertex Complete — pocket cycles'
 * vertices become click targets so the user can fill an interior hole as a
 * single tile rather than as N chord-pair tiles.
 */
export function computeAllCycles(cell: EditorCell): {
  outer: BoundaryVertex[]
  pockets: BoundaryVertex[][]
} {
  const edges = computeExposedEdges(cell)
  if (edges.length === 0) return { outer: [], pockets: [] }

  const remaining = subdivideAndCancel(edges)
  const cycles: BoundaryVertex[][] = []

  // Each iteration consumes one closed cycle. The patch may contain multiple
  // (outer + pockets) — keep going until every edge is accounted for.
  while (remaining.length > 0) {
    let current = remaining.shift()!
    const start = current.p1
    const cycle: BoundaryVertex[] = [
      { p: current.p1, tileId: current.tileId, vertexIndex: current.edgeIndex },
    ]
    let safety = remaining.length + 1
    let closed = false
    while (safety-- > 0) {
      const idx = remaining.findIndex(e => pointsEqual(e.p1, current.p2, EDITOR_EPS))
      if (idx < 0) {
        // Either the cycle closes (current.p2 ≈ start, the seed vertex
        // already in the cycle list) or this fragment is disconnected.
        if (pointsEqual(current.p2, start, EDITOR_EPS)) closed = true
        break
      }
      const next = remaining.splice(idx, 1)[0]
      if (pointsEqual(next.p1, start, EDITOR_EPS)) {
        // Closing edge — its p1 is the start, already in the cycle.
        closed = true
        break
      }
      cycle.push({ p: next.p1, tileId: next.tileId, vertexIndex: next.edgeIndex })
      current = next
    }
    if (closed && cycle.length >= 3) cycles.push(cycle)
  }

  if (cycles.length === 0) return { outer: [], pockets: [] }

  // Outer = the positive-area (CCW) cycle with the largest magnitude. Tiles
  // are CCW by construction, so their unshared edges trace CCW around the
  // patch interior (positive area) and CW around any interior pocket
  // (negative area). Disjoint patches would produce multiple positive cycles
  // — pick the largest as outer; treat the rest as pockets so their vertices
  // remain selectable.
  let outerIdx = -1
  let outerArea = 0
  for (let i = 0; i < cycles.length; i++) {
    const a = cycleSignedArea(cycles[i])
    if (a > outerArea) {
      outerArea = a
      outerIdx = i
    }
  }
  if (outerIdx < 0) return { outer: [], pockets: [] }
  const outer = cycles[outerIdx]
  const pockets = cycles.filter((_, i) => i !== outerIdx)
  return { outer, pockets }
}

/**
 * Walk the patch's exposed edges to produce the ordered CCW cycle of outer
 * vertices. Returns an empty array if the patch is empty or the edges don't
 * form a single closed loop (e.g. mid-construction inconsistency — the
 * editor's tile reducer prevents disconnected tiles by construction, so this
 * is mostly a defensive guard).
 *
 * Thin wrapper over `computeAllCycles().outer`; preserved as a stable export
 * so 17.5 / 17.7 / 17.10 callers don't need to know about pockets.
 */
export function computeOuterBoundary(cell: EditorCell): BoundaryVertex[] {
  return computeAllCycles(cell).outer
}

/**
 * Boundary-polygon corners as a `BoundaryVertex[]` cycle, in CCW order.
 * Used by the Complete-mode vertex picker so the user can pick boundary
 * corners as gap endpoints — and by `completeGap` when both picks land on
 * the boundary outline rather than the patch's outer cycle.
 *
 * Boundary-corner entries get a synthetic `tileId === 'boundary'` and a
 * sequential `vertexIndex` so they round-trip through the same pipeline as
 * patch-outer vertices.
 */
export function computeBoundaryCycle(cell: EditorCell): BoundaryVertex[] {
  return editorBoundaryVertices(cell).map((p, i) => ({ p, tileId: 'boundary', vertexIndex: i }))
}

export function findCycleVertexIndex(cycle: BoundaryVertex[], p: Vec2): number {
  for (let i = 0; i < cycle.length; i++) {
    if (pointsEqual(cycle[i].p, p, EDITOR_EPS)) return i
  }
  return -1
}
