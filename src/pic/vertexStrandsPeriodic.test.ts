import { describe, it, expect } from 'vitest'
import { runPIC } from './index'
import { createDefault31212EditorConfig, createDefault4612EditorConfig } from '../editor/createDefault'
import { compositionToPolygons } from '../editor/compositionLattice'
import type { Polygon } from '../types/geometry'
import type { FigureConfig, PatternConfig } from '../types/pattern'

// Vertex lines emit on every edge of any shape with them enabled — no longer
// gated on internal/shared edges (user decision 2026-06-17). A multi-cell unit
// cell PIC'd in isolation therefore shows the FULL vertex figure on each tile,
// including the dodecagon's 12 edges, with no lattice edge-context needed (the
// old `edgeContext` workaround for the gate is gone).

const vertexFigure: FigureConfig = {
  type: 'star',
  contactAngle: 60,
  lineLength: 1,
  autoLineLength: true,
  edgeLinesEnabled: false,
  vertexLinesEnabled: true,
}

function configFor(polys: Polygon[]): PatternConfig {
  const figures: Record<string, FigureConfig> = {}
  for (const p of polys) figures[p.tileTypeId] = vertexFigure
  return { figures } as unknown as PatternConfig
}

function dodecagonEdgesCovered(polys: Polygon[], config: PatternConfig): number {
  const segs = runPIC(polys, config)
  const f = 1e3
  const edges = new Set<string>()
  for (const s of segs) {
    if (s.kind !== 'vertex-line') continue
    if (s.polygonId !== 'dodecagon/seed') continue
    edges.add(`${Math.round(s.edgeMidpoint.x * f)},${Math.round(s.edgeMidpoint.y * f)}`)
  }
  return edges.size
}

for (const [name, seed] of [
  ['3.12.12', createDefault31212EditorConfig],
  ['4.6.12', createDefault4612EditorConfig],
] as const) {
  describe(`vertex strands — ${name}`, () => {
    it('dodecagon emits vertex strands on all 12 edges from the isolated unit cell', () => {
      const patch = seed()
      const polys = compositionToPolygons(patch)
      const config = configFor(polys)
      expect(dodecagonEdgesCovered(polys, config)).toBe(12)
    })
  })
}
