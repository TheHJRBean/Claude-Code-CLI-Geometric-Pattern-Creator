import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorConfig } from '../types/editor'
import { EDITOR_EPS, computeExposedEdges } from './exposedEdges'

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

/**
 * Walk the patch's exposed edges to produce the ordered CCW cycle of outer
 * vertices. Returns an empty array if the patch is empty or the edges don't
 * form a single closed loop (e.g. mid-construction inconsistency — the
 * editor's tile reducer prevents disconnected tiles by construction, so this
 * is mostly a defensive guard).
 */
export function computeOuterBoundary(editor: EditorConfig): BoundaryVertex[] {
  const edges = computeExposedEdges(editor)
  if (edges.length === 0) return []

  // Build an adjacency: keyed by p1's coords, value is the edge whose p1 is here.
  // Since the patch is simply connected, each vertex has exactly one outgoing
  // exposed edge in CCW order.
  const remaining = [...edges]
  const cycle: BoundaryVertex[] = []
  let current = remaining.shift()!
  cycle.push({ p: current.p1, tileId: current.tileId, vertexIndex: current.edgeIndex })

  // Step until we return to the starting vertex.
  const start = current.p1
  let safety = edges.length + 1
  while (safety-- > 0) {
    // Find the edge whose p1 ≈ current.p2.
    const idx = remaining.findIndex(e => pointsEqual(e.p1, current.p2, EDITOR_EPS))
    if (idx < 0) {
      // Either we closed the loop (next is the starting edge) or the patch is
      // disconnected. Test for closure via current.p2 ≈ start.
      if (pointsEqual(current.p2, start, EDITOR_EPS)) return cycle
      return [] // disconnected — bail
    }
    const next = remaining.splice(idx, 1)[0]
    if (pointsEqual(next.p1, start, EDITOR_EPS)) return cycle
    cycle.push({ p: next.p1, tileId: next.tileId, vertexIndex: next.edgeIndex })
    current = next
  }
  return cycle
}
