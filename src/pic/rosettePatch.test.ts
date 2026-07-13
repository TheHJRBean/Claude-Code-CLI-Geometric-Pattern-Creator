import { describe, it, expect, beforeEach } from 'vitest'
import { runRosettePIC } from './rosettePatch'
import { runPIC } from './index'
import { generateTiling } from '../tilings/archimedean'
import { generateTapratsTiling } from '../tilings/tapratsTiling'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { resetIds } from '../tilings/shared'
import { buildStrands } from '../strand/buildStrands'
import { pointInPolygon, type Vec2 } from '../utils/math'
import type { PatternConfig, FigureConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { Viewport } from '../tilings/archimedean'

// Step 3 of the rosette-patch epic (ticket #22): characterise the bisector-
// anchored construction of ROSETTE_PATCH_PLAN.md "Step 0 findings" against
// the spike's acceptance bar — Kepler baseline exactness on regular tilings,
// the 12-tiling × 9-θ grand matrix property checks, and buildStrands interop.

beforeEach(() => resetIds())

const VP: Viewport = { x: -150, y: -150, width: 300, height: 300 }

const fig = (contactAngle: number, over: Partial<FigureConfig> = {}): FigureConfig =>
  ({ type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle, ...over })

/** All rosette-patch registry entries (the taprats-generated tilings). */
const ROSETTE_TILINGS = Object.keys(TILINGS).filter(
  (k) => TILINGS[k].category === 'rosette-patch' && k !== 'keplers-star' && k !== 'davids-star',
)

/** Same θ spread as the Step 0 spike's grand matrix. */
const THETAS = [27.5, 36, 45, 46, 54, 60, 67.5, 72, 80]

/** Figures keyed off the generated polygons — some registry entries
 *  (heptagonal/nonagonal rosette) don't declare `tileTypes`. */
function configFor(tilingKey: string, theta: number, polys: Polygon[]): PatternConfig {
  const figures: Record<string, FigureConfig> = {}
  for (const p of polys) figures[p.tileTypeId] = fig(theta)
  return { ...DEFAULT_CONFIG, tiling: { type: tilingKey, scale: 50 }, figures }
}

const r = (v: number) => Math.round(v * 1e3)
const pKey = (p: Vec2) => `${r(p.x)},${r(p.y)}`
const segKey = (s: Segment) => {
  const a = pKey(s.from), b = pKey(s.to)
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function groupByPolygon(segs: Segment[]): Map<string, Segment[]> {
  const by = new Map<string, Segment[]>()
  for (const s of segs) {
    if (!by.has(s.polygonId)) by.set(s.polygonId, [])
    by.get(s.polygonId)!.push(s)
  }
  return by
}

/** Distance from point p to the polygon boundary. */
function distToBoundary(p: Vec2, verts: Vec2[]): number {
  let best = Infinity
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n]
    const abx = b.x - a.x, aby = b.y - a.y
    const l2 = abx * abx + aby * aby
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2))
    const dx = p.x - (a.x + t * abx), dy = p.y - (a.y + t * aby)
    best = Math.min(best, Math.hypot(dx, dy))
  }
  return best
}

/** Proper interior crossing between two segments (shared endpoints excluded). */
function segmentsCross(s1: Segment, s2: Segment, tol: number): boolean {
  const d1 = { x: s1.to.x - s1.from.x, y: s1.to.y - s1.from.y }
  const d2 = { x: s2.to.x - s2.from.x, y: s2.to.y - s2.from.y }
  const denom = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(denom) < 1e-12) return false
  const dx = s2.from.x - s1.from.x, dy = s2.from.y - s1.from.y
  const t1 = (dx * d2.y - dy * d2.x) / denom
  const t2 = (dx * d1.y - dy * d1.x) / denom
  const len1 = Math.hypot(d1.x, d1.y), len2 = Math.hypot(d2.x, d2.y)
  if (len1 < tol || len2 < tol) return false
  const m1 = tol / len1, m2 = tol / len2
  return t1 > m1 && t1 < 1 - m1 && t2 > m2 && t2 < 1 - m2
}

describe('runRosettePIC — Kepler baseline (regular tilings match runPIC exactly)', () => {
  const CASES: { key: string; gen: () => Polygon[]; config: PatternConfig }[] = [
    {
      key: 'square@67.5',
      gen: () => generateTiling(TILINGS['square'], VP, 100),
      config: DEFAULT_CONFIG,
    },
    {
      key: 'hexagonal@60',
      gen: () => generateTiling(TILINGS['hexagonal'], VP, 80),
      config: { ...DEFAULT_CONFIG, tiling: { type: 'hexagonal', scale: 80 }, figures: { 6: fig(60) } },
    },
    {
      key: 'square-fixedlen',
      gen: () => generateTiling(TILINGS['square'], VP, 100),
      config: { ...DEFAULT_CONFIG, figures: { 4: fig(67.5, { autoLineLength: false, lineLength: 0.6 }) } },
    },
    {
      key: 'square-vertexlines',
      gen: () => generateTiling(TILINGS['square'], VP, 100),
      config: { ...DEFAULT_CONFIG, figures: { 4: fig(67.5, { vertexLinesEnabled: true }) } },
    },
  ]

  for (const c of CASES) {
    it(`${c.key}: segment-for-segment identical to runPIC`, () => {
      const polys = c.gen()
      const rosette = runRosettePIC(polys, c.config)
      const classic = runPIC(polys, c.config)
      expect(rosette.length).toBe(classic.length)
      // Compare as multisets of rounded endpoint pairs (emission order within
      // a polygon may differ; geometry must not).
      const count = new Map<string, number>()
      for (const s of classic) count.set(segKey(s), (count.get(segKey(s)) ?? 0) + 1)
      for (const s of rosette) {
        const k = segKey(s)
        const n = count.get(k) ?? 0
        expect(n, `unexpected segment ${k}`).toBeGreaterThan(0)
        count.set(k, n - 1)
      }
    })
  }
})

describe('runRosettePIC — collinear-ray singularity (square@45, triangular@60)', () => {
  // The Step 0 exception to Kepler exactness: at these θ adjacent edges'
  // rays are collinear, where runPIC's pair-B path emits full midpoint→
  // midpoint chords (plus asymmetric-fallback stubs). The bisector
  // construction instead splits each chord into two clean halves at the
  // bisector crossing — geometrically equivalent, not segment-identical.
  // Assert the construction's own invariants: 2 arms per vertex, no
  // duplicate segments, closed figures.
  const CASES: { key: string; gen: () => Polygon[]; config: PatternConfig; sides: number }[] = [
    {
      key: 'square@45',
      gen: () => generateTiling(TILINGS['square'], VP, 100),
      config: { ...DEFAULT_CONFIG, figures: { 4: fig(45) } },
      sides: 4,
    },
    {
      key: 'triangular@60',
      gen: () => generateTiling(TILINGS['triangular'], VP, 60),
      config: { ...DEFAULT_CONFIG, tiling: { type: 'triangular', scale: 60 }, figures: { 3: fig(60) } },
      sides: 3,
    },
  ]

  for (const c of CASES) {
    it(`${c.key}: two arms per vertex, no duplicates, closed figures`, () => {
      const segs = runRosettePIC(c.gen(), c.config)
      for (const [polyId, polySegs] of groupByPolygon(segs)) {
        expect(polySegs.length, `poly ${polyId}`).toBe(c.sides * 2)
        const keys = new Set(polySegs.map(segKey))
        expect(keys.size, `duplicate segments in poly ${polyId}`).toBe(polySegs.length)
        const degree = new Map<string, number>()
        for (const s of polySegs) {
          degree.set(pKey(s.from), (degree.get(pKey(s.from)) ?? 0) + 1)
          degree.set(pKey(s.to), (degree.get(pKey(s.to)) ?? 0) + 1)
        }
        for (const [, d] of degree) expect(d % 2).toBe(0)
      }
    })
  }
})

describe('runRosettePIC — grand matrix property checks (rosette tilings × θ)', () => {
  // Sole accepted residual from the Step 0 spike: decagonal-rosette's
  // elongated hexagon (6.3) at θ ≥ 67.5° interleaves adjacent vertex tips
  // (172 crossings, ~9-unit depth at scale 50 — a real weave, not a graze).
  // Rule/λ-invariant; ships as weave (see rosettePatch.ts header).
  const CROSSING_EXCLUSIONS = new Set([
    'decagonal-rosette@67.5',
    'decagonal-rosette@72',
    'decagonal-rosette@80',
  ])

  // "Non-self-intersecting" means no VISIBLE crossing: two figures graze
  // (tips touching within 1% of scale — nonagonal 5-gon @80 penetrates
  // 0.03 units, decagonal thin rhombus @36 penetrates 0.29 at scale 50)
  // without being defects. Crossings deeper than this are real failures.
  const CROSSING_TOL = 50 * 0.01

  for (const tiling of ROSETTE_TILINGS) {
    for (const theta of THETAS) {
      it(`${tiling}@${theta}: finite, closed, tips inside, no arm crossings`, () => {
        const polys = generateTapratsTiling(tiling, VP, 50)
        const polyById = new Map(polys.map((p) => [p.id, p]))
        const segs = runRosettePIC(polys, configFor(tiling, theta, polys))
        expect(segs.length).toBeGreaterThan(0)

        const scaleTol = 50 * 1e-4
        for (const s of segs) {
          expect(Number.isFinite(s.from.x) && Number.isFinite(s.from.y)).toBe(true)
          expect(Number.isFinite(s.to.x) && Number.isFinite(s.to.y)).toBe(true)
          // Tips never leave the tile (inside or on the boundary).
          const poly = polyById.get(s.polygonId)!
          const inside =
            pointInPolygon(s.to, poly.vertices) || distToBoundary(s.to, poly.vertices) < scaleTol
          expect(inside, `tip outside ${tiling}@${theta} tile ${s.tileTypeId}`).toBe(true)
        }

        for (const [polyId, polySegs] of groupByPolygon(segs)) {
          // Closure: every endpoint of the per-polygon arm graph has even
          // degree ⇒ the figure decomposes into closed circuits.
          const degree = new Map<string, number>()
          for (const s of polySegs) {
            degree.set(pKey(s.from), (degree.get(pKey(s.from)) ?? 0) + 1)
            degree.set(pKey(s.to), (degree.get(pKey(s.to)) ?? 0) + 1)
          }
          for (const [pt, d] of degree) {
            expect(d % 2, `odd degree at ${pt} in ${tiling}@${theta} poly ${polyId}`).toBe(0)
          }

          // Non-self-intersection: no two arms of one figure properly cross.
          if (!CROSSING_EXCLUSIONS.has(`${tiling}@${theta}`)) {
            for (let i = 0; i < polySegs.length; i++) {
              for (let j = i + 1; j < polySegs.length; j++) {
                expect(
                  segmentsCross(polySegs[i], polySegs[j], CROSSING_TOL),
                  `arms cross in ${tiling}@${theta} tile ${polySegs[i].tileTypeId}`,
                ).toBe(false)
              }
            }
          }
        }
      })
    }
  }

  it('decagonal-rosette 6.3 residual is confined to θ ≥ 67.5 (documented weave)', () => {
    // Guard the exclusion list itself: at θ=60 the same tiling must be clean,
    // so the exclusions can't silently mask a broader regression.
    const polys = generateTapratsTiling('decagonal-rosette', VP, 50)
    const segs = runRosettePIC(polys, configFor('decagonal-rosette', 60, polys))
    for (const [, polySegs] of groupByPolygon(segs)) {
      for (let i = 0; i < polySegs.length; i++) {
        for (let j = i + 1; j < polySegs.length; j++) {
          expect(segmentsCross(polySegs[i], polySegs[j], 50 * 0.01)).toBe(false)
        }
      }
    }
  })
})

describe('runRosettePIC — buildStrands interop', () => {
  it('single square @67.5 chains into one closed 8-segment strand', () => {
    const polys = generateTiling(TILINGS['square'], VP, 100)
    const one = [polys[0]]
    const segs = runRosettePIC(one, DEFAULT_CONFIG)
    expect(segs.length).toBe(8)
    const strands = buildStrands(segs)
    expect(strands.length).toBe(1)
    expect(strands[0].segmentIndices.length).toBe(8)
    const pts = strands[0].points
    expect(pts[0].x).toBeCloseTo(pts[pts.length - 1].x, 4)
    expect(pts[0].y).toBeCloseTo(pts[pts.length - 1].y, 4)
  })

  for (const tiling of ROSETTE_TILINGS) {
    it(`${tiling}@54: every tile type's figure chains into closed strands`, () => {
      const polys = generateTapratsTiling(tiling, VP, 50)
      const config = configFor(tiling, 54, polys)
      const seen = new Set<string>()
      for (const poly of polys) {
        if (seen.has(poly.tileTypeId)) continue
        seen.add(poly.tileTypeId)
        const segs = runRosettePIC([poly], config)
        const strands = buildStrands(segs)
        // Every segment consumed exactly once across the strands…
        const used = strands.flatMap((s) => s.segmentIndices)
        expect(new Set(used).size).toBe(segs.length)
        expect(used.length).toBe(segs.length)
        // …and every strand is a closed loop (figures are closed by
        // construction; angle-continuity pairing must preserve that).
        for (const strand of strands) {
          const pts = strand.points
          expect(
            Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y),
            `open strand on ${tiling} tile ${poly.tileTypeId}`,
          ).toBeLessThan(1e-3)
        }
      }
      expect(seen.size).toBe(new Set(polys.map((p) => p.tileTypeId)).size)
    })
  }
})
