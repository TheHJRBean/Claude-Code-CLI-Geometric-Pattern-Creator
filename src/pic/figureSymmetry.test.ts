import { describe, it, expect } from 'vitest'
import { runPIC } from './index'
import { runRosettePIC } from './rosettePatch'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { TILINGS } from '../tilings/index'
import type { Polygon } from '../types/geometry'
import type { PatternConfig, FigureConfig } from '../types/pattern'

/**
 * Invariant (#51): a REGULAR n-gon's figure must inherit the tile's own C_n
 * rotational symmetry. Rotating a tile's emitted segments by 2π/n about the
 * tile centre has to map the set onto itself.
 *
 * This is the check that would have caught #51 at introduction. The failure it
 * guards is subtle in aggregate — segment counts and total length look
 * plausible — but obvious per tile: at a contact angle where two adjacent
 * pair-A rays go exactly collinear, the pairing used to fall through to pair-B,
 * whose meeting point sits ON the polygon boundary, where `pointInPolygon`
 * classifies symmetric vertices inconsistently. The tile then emitted 5
 * segments, which no C3 or C4 figure can have.
 *
 * Degenerate angles are the whole point of the sweep, so it deliberately spans
 * θ values that land on them: 45 (square), 60 (triangle, hexagon), 67.5.
 */

const isRegular = (p: Polygon): boolean => {
  const n = p.vertices.length
  const radii = p.vertices.map(v => Math.hypot(v.x - p.center.x, v.y - p.center.y))
  const edges = p.vertices.map((v, i) => {
    const w = p.vertices[(i + 1) % n]
    return Math.hypot(w.x - v.x, w.y - v.y)
  })
  const spread = (a: number[]) => (Math.max(...a) - Math.min(...a)) / Math.max(...a)
  return spread(radii) < 1e-6 && spread(edges) < 1e-6
}

/** Largest k such that rotating by 2π/n maps the segment set onto itself k times. */
function symmetryOrder(segs: { from: { x: number; y: number }; to: { x: number; y: number } }[], c: { x: number; y: number }, n: number): number {
  const q = (v: { x: number; y: number }) => `${Math.round(v.x * 1e3)},${Math.round(v.y * 1e3)}`
  const key = (s: { from: { x: number; y: number }; to: { x: number; y: number } }) => {
    const a = q(s.from), b = q(s.to)
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }
  const base = new Set(segs.map(key))
  let order = 0
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n
    const co = Math.cos(th), si = Math.sin(th)
    const rot = (v: { x: number; y: number }) => {
      const dx = v.x - c.x, dy = v.y - c.y
      return { x: c.x + dx * co - dy * si, y: c.y + dx * si + dy * co }
    }
    if (segs.map(s => ({ from: rot(s.from), to: rot(s.to) })).every(s => base.has(key(s)))) order++
  }
  return order
}

const fig = (contactAngle: number): FigureConfig =>
  ({ type: 'star', contactAngle, lineLength: 1, autoLineLength: true })

const VP = { x: -260, y: -260, width: 520, height: 520 }

describe('figure rotational symmetry — every regular tile keeps its own C_n', () => {
  const keys = Object.keys(TILINGS)

  for (const theta of [45, 60, 67.5]) {
    it(`holds across every shipping tiling at θ=${theta}`, () => {
      const broken: string[] = []
      for (const key of keys) {
        const def = TILINGS[key]
        const polys = def.category === 'rosette-patch'
          ? generateRosettePatch(def, VP, 100)
          : generateTiling(def, VP, 100)
        if (!polys.length) continue

        // One θ for every tile type present, so each tile is judged on its own.
        const figures: Record<string, FigureConfig> = {}
        for (const p of polys) figures[p.tileTypeId] = fig(theta)
        // Match `usePattern`'s dispatch (hooks/usePattern.ts) — rosette-patch
        // tilings render through runRosettePIC, so pinning them against runPIC
        // would test a path the app never takes.
        const run = def.category === 'rosette-patch' ? runRosettePIC : runPIC
        const segs = run(polys, { figures } as unknown as PatternConfig)

        const byPoly = new Map<string, typeof segs>()
        for (const s of segs) {
          const arr = byPoly.get(s.polygonId)
          if (arr) arr.push(s); else byPoly.set(s.polygonId, [s])
        }

        // Judge only tiles well inside the viewport — field-boundary tiles have
        // no neighbours to trim against, which is a separate concern.
        for (const p of polys) {
          if (Math.hypot(p.center.x, p.center.y) > 150 || !isRegular(p)) continue
          const ss = byPoly.get(p.id)
          if (!ss?.length) continue
          const order = symmetryOrder(ss, p.center, p.sides)
          if (order !== p.sides) {
            broken.push(`${key} ${p.sides}-gon(type ${p.tileTypeId}) → C${order} of C${p.sides}, ${ss.length} segs`)
          }
        }
      }
      expect(broken).toEqual([])
    })
  }

  it('resolves the collinear degeneracy continuously (triangle at θ=60, square at θ=45)', () => {
    const ngon = (n: number, edge: number): Polygon => {
      const R = edge / (2 * Math.sin(Math.PI / n))
      return {
        id: 'p', sides: n, tileTypeId: String(n), center: { x: 0, y: 0 },
        vertices: Array.from({ length: n }, (_, k) => {
          const a = Math.PI / n + (2 * Math.PI * k) / n
          return { x: R * Math.cos(a), y: R * Math.sin(a) }
        }),
      } as Polygon
    }
    // The degenerate angle must not be an outlier: segment count and total
    // length have to sit between the values just either side of it.
    for (const [n, theta] of [[3, 60], [4, 45]] as const) {
      const at = (t: number) => {
        const segs = runPIC([ngon(n, 100)], { figures: { [String(n)]: fig(t) } } as unknown as PatternConfig)
        return { count: segs.length, len: segs.reduce((s, x) => s + Math.hypot(x.to.x - x.from.x, x.to.y - x.from.y), 0) }
      }
      const lo = at(theta - 0.1), mid = at(theta), hi = at(theta + 0.1)
      expect(mid.count).toBe(lo.count)
      expect(mid.count).toBe(hi.count)
      expect(mid.len).toBeGreaterThan(Math.min(lo.len, hi.len) - 1)
      expect(mid.len).toBeLessThan(Math.max(lo.len, hi.len) + 1)
    }
  })
})
