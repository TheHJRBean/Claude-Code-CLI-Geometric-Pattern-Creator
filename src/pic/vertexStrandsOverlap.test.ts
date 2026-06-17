import { describe, it, expect } from 'vitest'
import { runPIC } from './index'
import type { Polygon } from '../types/geometry'
import type { FigureConfig, PatternConfig } from '../types/pattern'

// Vertex lines emit only on *internal* edges = edges SHARED by two tiles (their
// midpoints coincide exactly). Overlapping tiles are deliberately NOT treated as
// sharing an edge: a force-placed / lattice-packed overlap keeps each tile's
// Figure self-contained and the two just cross visually (locked decision, see
// project_overlap_tiles_strand_bug). The earlier overlap pass that flagged
// covered edges internal was removed 2026-06-17 — it produced stray vertex
// strands that popped in/out as tiles slid through each other.

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
  it('does NOT emit on an edge merely covered by an overlapping tile (self-contained figures)', () => {
    // A at origin (x,y ∈ [-1,1]); B offset to overlap A's upper-right quadrant.
    // No edge midpoints coincide, so no edge is shared — the overlap must not
    // synthesise internal edges, and each tile keeps its own (here empty, since
    // no edge is shared) vertex-line set. Overlaps just cross visually.
    const A = square('A', 0, 0)
    const B = square('B', 1.1, 0.3)
    expect(vertexEdges([A, B], 'A')).toBe(0)
    expect(vertexEdges([A, B], 'B')).toBe(0)
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
