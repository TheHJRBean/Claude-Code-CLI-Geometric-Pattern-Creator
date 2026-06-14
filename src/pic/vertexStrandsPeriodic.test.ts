import { describe, it, expect } from 'vitest'
import { runPIC } from './index'
import { createDefault31212EditorConfig, createDefault4612EditorConfig } from '../editor/createDefault'
import { compositionToPolygons, compositionOneRingStamps } from '../editor/compositionLattice'
import { applyStamp } from '../editor/lattice'
import type { Polygon } from '../types/geometry'
import type { FigureConfig, PatternConfig } from '../types/pattern'

// A figure with vertex lines enabled — these only emit on internal (tile-shared)
// edges, which is the behaviour the periodic edge-context fix restores.
const vertexFigure: FigureConfig = {
  type: 'star',
  contactAngle: 30,
  lineLength: 1,
  autoLineLength: true,
  edgeLinesEnabled: false,
  vertexLinesEnabled: true,
}

function configFor(polys: Polygon[]): PatternConfig {
  const figures: Record<string, FigureConfig> = {}
  for (const p of polys) figures[p.tileTypeId] = vertexFigure
  return { figures, figureRouting: 'auto' } as unknown as PatternConfig
}

function neighbourGhosts(polys: Polygon[], patch: ReturnType<typeof createDefault31212EditorConfig>): Polygon[] {
  const ghosts: Polygon[] = []
  for (const s of compositionOneRingStamps(patch)) {
    for (const p of polys) ghosts.push({ ...p, vertices: p.vertices.map(v => applyStamp(v, s)) })
  }
  return ghosts
}

function dodecagonEdgesCovered(polys: Polygon[], config: PatternConfig, ctx?: Polygon[]): number {
  const segs = runPIC(polys, config, ctx)
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
  describe(`periodic vertex strands — ${name}`, () => {
    it('dodecagon emits vertex strands on all 12 edges only with lattice edge-context', () => {
      const patch = seed()
      const polys = compositionToPolygons(patch)
      const config = configFor(polys)

      const without = dodecagonEdgesCovered(polys, config)
      const withCtx = dodecagonEdgesCovered(polys, config, neighbourGhosts(polys, patch))

      // The bug: the isolated unit cell sees only the cell-interior edges as
      // internal, so the dodecagon strands on a strict minority of its edges.
      expect(without).toBeLessThan(12)
      // The fix: every dodecagon edge is internal in the infinite tiling.
      expect(withCtx).toBe(12)
    })
  })
}
