import { describe, it, expect } from 'vitest'
import { generateTiling, type Viewport } from '../tilings/archimedean'
import { TILINGS } from '../tilings'
import { runPIC } from './index'
import type { FigureConfig, MorphConfig, PatternConfig } from '../types/pattern'
import { pointInPolygon, type Vec2 } from '../utils/math'

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

function distToBoundary(p: Vec2, verts: Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < verts.length; i++) {
    const d = distToSegment(p, verts[i], verts[(i + 1) % verts.length])
    if (d < best) best = d
  }
  return best
}

/**
 * Regression suite for #40 — vertex-line rays leaking past their own polygon.
 * Two independent mechanisms, both in `emitVertexArms`:
 *
 *  1. α = 90°−θ exceeds the vertex's interior half-angle: the ray direction
 *     itself points outside the polygon's tangent cone at its origin, so
 *     `clipSegmentToPolygon` never finds a boundary crossing and returns the
 *     unclipped natural endpoint. Fixed by `vertexRayEntersPolygon`.
 *  2. An ASYMMETRIC pairing (one ray's `t` in the shared intersection is
 *     negative) used the shared point as BOTH rays' natural target — for the
 *     negative-t ray that point sits behind its own origin, so the segment
 *     was drawn in the exact opposite direction from `ray.dir`. Only reachable
 *     when the two rays at a pairing carry different effective θ (a per-vertex
 *     Morph field), since a single uniform θ on a regular tile keeps both t
 *     signs equal. Fixed by extending that ray forward along its own
 *     direction instead of reusing the shared (behind-origin) point.
 */

function assertNoLeak(segs: { from: { x: number; y: number }; to: { x: number; y: number } }[], polys: { id: string; vertices: { x: number; y: number }[] }[], polygonId: (s: any) => string, tol = 1e-4): void {
  const byId = new Map(polys.map(p => [p.id, p]))
  for (const s of segs) {
    const poly = byId.get(polygonId(s))
    if (!poly) continue
    for (const p of [s.from, s.to]) {
      const contained = pointInPolygon(p, poly.vertices) || distToBoundary(p, poly.vertices) <= tol
      expect(contained, `endpoint (${p.x.toFixed(3)}, ${p.y.toFixed(3)}) leaks past polygon ${poly.id}`).toBe(true)
    }
  }
}

describe('#40 — vertex ray leak, mechanism 1: cone-exceeding uniform θ', () => {
  it('squares stay contained across the whole 20°–80° band', () => {
    const VP: Viewport = { minX: -150, maxX: 150, minY: -150, maxY: 150 } as any
    const polys = generateTiling(TILINGS['square'], VP, 100)
    for (let theta = 20; theta <= 80; theta += 5) {
      const fig: FigureConfig = { type: 'star', contactAngle: theta, lineLength: 1, autoLineLength: true, vertexLinesEnabled: true, edgeLinesEnabled: false }
      const figures: Record<string, FigureConfig> = {}
      for (const p of polys) figures[p.tileTypeId] = fig
      const segs = runPIC(polys, { figures } as unknown as PatternConfig)
      assertNoLeak(segs, polys, s => s.polygonId)
    }
  })

  it('the leak-triggering configuration produces zero arms, not a leak (θ=30 on a square, α=60° > 45° half-angle)', () => {
    const fig: FigureConfig = { type: 'star', contactAngle: 30, lineLength: 1, autoLineLength: true, vertexLinesEnabled: true, edgeLinesEnabled: false }
    const poly = {
      id: 'A', sides: 4, tileTypeId: '4', center: { x: 0, y: 0 },
      vertices: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }],
    }
    const segs = runPIC([poly as any], { figures: { '4': fig } } as unknown as PatternConfig)
    expect(segs.filter(s => s.kind === 'vertex-line')).toEqual([])
  })
})

describe('#40 — vertex ray leak, mechanism 2: asymmetric pairing under a per-vertex Morph', () => {
  it('a decoupled per-vertex vertexContactAngle field does not leak on squares', () => {
    const VP: Viewport = { x: -240, y: -240, width: 480, height: 480 } as any
    const polys = generateTiling(TILINGS['square'], VP, 60)
    const extra: Partial<FigureConfig> = {
      vertexLinesEnabled: true,
      vertexLinesDecoupled: true,
      vertexContactAngle: 30,
      vertexAutoLineLength: true,
    }
    const figures: Record<string, FigureConfig> = {}
    for (const p of polys) figures[p.tileTypeId] ??= { type: 'star', contactAngle: 67.5, lineLength: 1, autoLineLength: true, ...extra }
    const morph: MorphConfig = {
      enabled: true,
      mode: 'linear',
      axisOrigin: { x: -180, y: 0 },
      direction: { x: 1, y: 0 },
      easing: 'linear',
      origins: [
        { id: 'o0', position: 0, reach: 360, sides: 'positive', figures: Object.fromEntries(polys.map(p => [p.tileTypeId, { vertexContactAngle: 80 }])) },
      ],
    }
    const segs = runPIC(polys, { tiling: { type: 'probe', scale: 1 }, figures, strand: { width: 4, color: '#000', background: '#fff' }, morph } as unknown as PatternConfig)
    assertNoLeak(segs, polys, s => s.polygonId)
  })
})
