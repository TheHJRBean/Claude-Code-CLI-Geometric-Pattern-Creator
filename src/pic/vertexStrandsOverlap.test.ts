import { describe, it, expect } from 'vitest'
import { runPIC } from './index'
import type { Polygon } from '../types/geometry'
import type { FigureConfig, PatternConfig } from '../types/pattern'

// Vertex lines emit on EVERY edge of any shape that has them enabled — a tile's
// Figure is self-contained, not gated on shared/internal edges (user decision
// 2026-06-17). Overlapping tiles are a non-issue: PIC iterates real tiles only,
// so an overlap region is never its own tile — each tile keeps its own distinct
// strands and they simply cross. These tests pin both properties.

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

describe('vertex strands are self-contained per tile', () => {
  it('a lone tile emits vertex strands on all of its own edges', () => {
    const A = square('A', 0, 0)
    expect(vertexEdges([A], 'A')).toBe(4)
  })

  it('overlapping tiles each keep their own full figure; the overlap is never a new tile', () => {
    // B overlaps A's upper-right quadrant. Each tile emits on all 4 of its own
    // edges, and every emitted segment belongs to A or B — the overlap region
    // does not become a separate tile with its own strands.
    const A = square('A', 0, 0)
    const B = square('B', 1.1, 0.3)
    expect(vertexEdges([A, B], 'A')).toBe(4)
    expect(vertexEdges([A, B], 'B')).toBe(4)
    const ids = new Set(runPIC([A, B], config).map(s => s.polygonId))
    expect([...ids].sort()).toEqual(['A', 'B'])
  })

  it('disjoint tiles still each emit on all of their edges', () => {
    const A = square('A', 0, 0)
    const B = square('B', 5, 0)
    expect(vertexEdges([A, B], 'A')).toBe(4)
    expect(vertexEdges([A, B], 'B')).toBe(4)
  })
})
