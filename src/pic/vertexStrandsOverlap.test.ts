import { describe, it, expect } from 'vitest'
import { runPIC } from './index'
import type { Polygon } from '../types/geometry'
import type { FigureConfig, PatternConfig } from '../types/pattern'

// Vertex lines emit only on *internal* edges (a tile on the other side). When a
// Builder tile is force-placed overlapping another, the overlapped edge runs
// through the other tile's interior — no edge midpoints coincide, so the
// exact-midpoint match alone misses it and the vertex strands silently drop.
// buildInternalEdgeSet's overlap pass (point-in-polygon) restores them while
// leaving the clean edge-to-edge baseline untouched.

const vertexFigure: FigureConfig = {
  type: 'star',
  contactAngle: 30,
  lineLength: 1,
  autoLineLength: true,
  edgeLinesEnabled: false,
  vertexLinesEnabled: true,
}

const config = { figures: { '4': vertexFigure }, figureRouting: 'auto' } as unknown as PatternConfig

function square(id: string, cx: number, cy: number, h = 1): Polygon {
  return {
    id,
    sides: 4,
    tileTypeId: '4',
    center: { x: cx, y: cy },
    vertices: [
      { x: cx - h, y: cy - h },
      { x: cx + h, y: cy - h },
      { x: cx + h, y: cy + h },
      { x: cx - h, y: cy + h },
    ],
  }
}

/** Distinct edge midpoints that emitted vertex strands for the given polygon. */
function vertexEdges(polys: Polygon[], id: string): number {
  const segs = runPIC(polys, config)
  const f = 1e3
  const edges = new Set<string>()
  for (const s of segs) {
    if (s.kind !== 'vertex-line' || s.polygonId !== id) continue
    edges.add(`${Math.round(s.edgeMidpoint.x * f)},${Math.round(s.edgeMidpoint.y * f)}`)
  }
  return edges.size
}

describe('vertex strands on overlapping tiles', () => {
  it('emits on the edge that runs through an overlapping tile', () => {
    // A at origin (x,y ∈ [-1,1]); B offset to overlap A's upper-right quadrant.
    // Only A's right edge midpoint (1,0) is strictly inside B, and only B's
    // left edge midpoint (0.1,0.3) is strictly inside A — one internal edge each.
    const A = square('A', 0, 0)
    const B = square('B', 1.1, 0.3)
    expect(vertexEdges([A, B], 'A')).toBe(1)
    expect(vertexEdges([A, B], 'B')).toBe(1)
  })

  it('still emits on a clean shared edge (baseline preserved)', () => {
    // A and B share edge x=1 exactly — caught by the exact-midpoint match.
    const A = square('A', 0, 0)
    const B = square('B', 2, 0)
    expect(vertexEdges([A, B], 'A')).toBe(1)
    expect(vertexEdges([A, B], 'B')).toBe(1)
  })

  it('does not emit on disjoint tiles with no shared or covered edge', () => {
    // Far apart: every edge is on the outer boundary of the union.
    const A = square('A', 0, 0)
    const B = square('B', 5, 0)
    expect(vertexEdges([A, B], 'A')).toBe(0)
    expect(vertexEdges([A, B], 'B')).toBe(0)
  })
})
