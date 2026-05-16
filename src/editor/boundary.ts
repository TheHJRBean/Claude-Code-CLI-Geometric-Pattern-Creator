import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorCell } from '../types/editor'
import { EDITOR_EPS, computeExposedEdges } from './exposedEdges'
import { editorBoundaryVertices } from './buildEditorPolygons'

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

  const remaining = [...edges]
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
