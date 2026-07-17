import { describe, it, expect } from 'vitest'
import { generateTiling, buildEdgeMap, type Viewport } from '../tilings/archimedean'
import { TILINGS } from '../tilings'
import { generateTapratsTiling } from '../tilings/tapratsTiling'
import { runPIC } from './index'
import type { FigureConfig, MorphConfig, PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import { dist, midpoint, pointInPolygon, type Vec2 } from '../utils/math'

/**
 * Step 20 Morph — probe suite (#37, "probe suite FIRST").
 *
 * A morph gives polygons asymmetric θ across their edges, which exercises the
 * fragile `emitStarArms` / `pairAtVertex` branches (edge-slide, pair
 * selection, centroid-V). These are regression assertions, not diagnostics:
 *
 *  1. Uniform-field equivalence — a morph whose stops resolve to a constant
 *     field must reproduce the uniform runPIC output exactly.
 *  2. Shared-edge C1 continuity — both polygons at a shared edge derive the
 *     same θ from the field, so their midpoint arms are collinear-opposite.
 *  3. Containment — no segment endpoint leaks past its polygon.
 *  4. No double-emission — no two same-origin near-same-direction arms.
 *  5. Stub storms — under gradients over the known-nasty tilings (tetrakis
 *     right-triangle asym threshold at 46°, Cairo's 25–32° band, floret),
 *     the count of short-stub arms must not exceed the worst uniform-θ
 *     baseline across the swept band.
 */

const star = (contactAngle: number, extra?: Partial<FigureConfig>): FigureConfig =>
  ({ type: 'star', contactAngle, lineLength: 1.0, autoLineLength: true, ...extra })

function figuresFor(polys: Polygon[], angle: number, extra?: Partial<FigureConfig>): Record<string, FigureConfig> {
  const out: Record<string, FigureConfig> = {}
  for (const p of polys) out[p.tileTypeId] ??= star(angle, extra)
  return out
}

function overlayFor(polys: Polygon[], overlay: Partial<FigureConfig>): Record<string, Partial<FigureConfig>> {
  const out: Record<string, Partial<FigureConfig>> = {}
  for (const p of polys) out[p.tileTypeId] ??= overlay
  return out
}

const baseStrand = { width: 4, color: '#000', background: '#fff' }

function makeConfig(polys: Polygon[], startAngle: number, morph?: MorphConfig, extra?: Partial<FigureConfig>): PatternConfig {
  return {
    tiling: { type: 'probe', scale: 1 },
    figures: figuresFor(polys, startAngle, extra),
    strand: baseStrand,
    ...(morph ? { morph } : {}),
  }
}

/** Linear morph along +x: angle `a0` at x ≤ x0, `a1` at x ≥ x1. */
function linearMorph(polys: Polygon[], x0: number, a0: number, x1: number, a1: number): MorphConfig {
  return {
    enabled: true,
    mode: 'linear',
    origin: { x: x0, y: 0 },
    direction: { x: 1, y: 0 },
    easing: 'linear',
    boundaries: [
      { id: 'b0', position: 0, figures: overlayFor(polys, { contactAngle: a0 }) },
      { id: 'b1', position: x1 - x0, figures: overlayFor(polys, { contactAngle: a1 }) },
    ],
  }
}

/** Radial morph about the origin: `a0` inside r0, `a1` beyond r1. */
function radialMorph(polys: Polygon[], r0: number, a0: number, r1: number, a1: number): MorphConfig {
  return {
    enabled: true,
    mode: 'radial',
    origin: { x: 0, y: 0 },
    easing: 'linear',
    boundaries: [
      { id: 'b0', position: r0, figures: overlayFor(polys, { contactAngle: a0 }) },
      { id: 'b1', position: r1, figures: overlayFor(polys, { contactAngle: a1 }) },
    ],
  }
}

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

function polyInradius(poly: Polygon): number {
  let best = Infinity
  for (let i = 0; i < poly.sides; i++) {
    const d = dist(poly.center, midpoint(poly.vertices[i], poly.vertices[(i + 1) % poly.sides]))
    if (d < best) best = d
  }
  return best
}

/** Invariants 3 + 4 over a runPIC output. `tol` in world units. */
function checkFieldInvariants(segs: Segment[], polys: Polygon[], tol = 1e-4): void {
  const byId = new Map(polys.map(p => [p.id, p]))
  const byPoly = new Map<string, Segment[]>()
  for (const s of segs) {
    expect(Number.isFinite(s.from.x + s.from.y + s.to.x + s.to.y)).toBe(true)
    expect(dist(s.from, s.to)).toBeGreaterThan(1e-9)
    const poly = byId.get(s.polygonId)
    expect(poly, `segment for unknown polygon ${s.polygonId}`).toBeTruthy()
    if (!poly) continue
    for (const p of [s.from, s.to]) {
      const contained = pointInPolygon(p, poly.vertices) || distToBoundary(p, poly.vertices) <= tol
      expect(contained, `endpoint (${p.x.toFixed(3)}, ${p.y.toFixed(3)}) leaks past polygon ${poly.id}`).toBe(true)
    }
    if (!byPoly.has(s.polygonId)) byPoly.set(s.polygonId, [])
    byPoly.get(s.polygonId)!.push(s)
  }
  // No double-emission: within a polygon, no two star-arms starting at the
  // same point in (near-)identical directions — duplicate ray coverage.
  for (const [pid, list] of byPoly) {
    const arms = list.filter(s => s.kind === 'star-arm')
    for (let i = 0; i < arms.length; i++) {
      for (let j = i + 1; j < arms.length; j++) {
        if (dist(arms[i].from, arms[j].from) > 1e-6) continue
        const d1 = { x: arms[i].to.x - arms[i].from.x, y: arms[i].to.y - arms[i].from.y }
        const d2 = { x: arms[j].to.x - arms[j].from.x, y: arms[j].to.y - arms[j].from.y }
        const dot = (d1.x * d2.x + d1.y * d2.y) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y))
        expect(dot, `double-emission on ${pid}: two same-origin arms in the same direction`).toBeLessThan(0.9999)
      }
    }
  }
}

/**
 * Invariant 2 — collinear-opposite midpoint arms across every interior
 * shared edge. Only meaningful when both tile types resolve the same θ at the
 * shared midpoint (same start angle + same overlays).
 *
 * Known limitation (documented, by design of the probe): the centroid-V
 * branch of `emitStarArms` (convex polygon whose pair tip falls outside)
 * replaces the ray direction with midpoint→centre, so at contact points in a
 * regime-transition band (e.g. θ crossing 45° on squares) one polygon can
 * emit a natural ray arm while its neighbour emits a centroid arm — a real
 * C1 kink inherited from the uniform-θ branch behaviour, only *exposed* by
 * the morph's spatial sweep. Those midpoints are skipped here (an arm ending
 * at its polygon centre marks the midpoint mixed-regime), but they must stay
 * a bounded minority — a blow-up would mean the morph path is pushing whole
 * fields into the degenerate branch.
 */
function checkSharedEdgeContinuity(
  segs: Segment[],
  polys: Polygon[],
): { checked: number; skippedMixed: number; interiorEdges: number } {
  const edgeMap = buildEdgeMap(polys)
  const byId = new Map(polys.map(p => [p.id, p]))
  const armsByPoly = new Map<string, Segment[]>()
  for (const s of segs) {
    if (s.kind !== 'star-arm') continue
    if (!armsByPoly.has(s.polygonId)) armsByPoly.set(s.polygonId, [])
    armsByPoly.get(s.polygonId)!.push(s)
  }
  let checked = 0
  let skippedMixed = 0
  let interiorEdges = 0
  for (const entry of edgeMap.values()) {
    if (entry.polygonIds.length !== 2) continue
    interiorEdges++
    const mid = midpoint(entry.a, entry.b)
    const [armsA, armsB] = entry.polygonIds.map(pid =>
      (armsByPoly.get(pid) ?? []).filter(s => dist(s.from, mid) < 1e-6))
    const centroidRouted = [...armsA, ...armsB].some(s =>
      dist(s.to, byId.get(s.polygonId)!.center) < 1e-6)
    if (centroidRouted || armsA.length !== 2 || armsB.length !== 2) {
      skippedMixed++
      continue
    }
    for (const a of armsA) {
      const da = { x: a.to.x - a.from.x, y: a.to.y - a.from.y }
      const la = Math.hypot(da.x, da.y)
      let bestDot = 1
      for (const b of armsB) {
        const db = { x: b.to.x - b.from.x, y: b.to.y - b.from.y }
        const dot = (da.x * db.x + da.y * db.y) / (la * Math.hypot(db.x, db.y))
        if (dot < bestDot) bestDot = dot
      }
      expect(bestDot, `arm at shared midpoint (${mid.x.toFixed(2)}, ${mid.y.toFixed(2)}) has no collinear-opposite partner (best dot ${bestDot.toFixed(6)})`)
        .toBeLessThan(-1 + 1e-9)
      checked++
    }
  }
  return { checked, skippedMixed, interiorEdges }
}

/** Count star-arms shorter than `frac` of their polygon's inradius. */
function countStubs(segs: Segment[], polys: Polygon[], frac = 0.12): number {
  const inr = new Map(polys.map(p => [p.id, polyInradius(p)]))
  let n = 0
  for (const s of segs) {
    if (s.kind !== 'star-arm') continue
    const r = inr.get(s.polygonId)
    if (r && dist(s.from, s.to) < frac * r) n++
  }
  return n
}

const VP: Viewport = { x: -240, y: -240, width: 480, height: 480 }

function archimedean(name: string, scale = 60): Polygon[] {
  return generateTiling(TILINGS[name], VP, scale)
}

function taprats(name: string, scale = 50): Polygon[] {
  return generateTapratsTiling(name, { x: -250, y: -250, width: 500, height: 500 }, scale)
}

const roundSeg = (s: Segment): string =>
  [s.polygonId, s.kind, s.side, s.from.x, s.from.y, s.to.x, s.to.y].map(v =>
    typeof v === 'number' ? v.toFixed(6) : v).join('|')

describe('morph probe — uniform-field equivalence', () => {
  it('empty-overlay stops reproduce the no-morph output exactly', () => {
    const polys = archimedean('square')
    const morph: MorphConfig = {
      enabled: true,
      mode: 'linear',
      origin: { x: -100, y: 0 },
      direction: { x: 1, y: 0 },
      easing: 'linear',
      boundaries: [
        { id: 'b0', position: 0, figures: {} },
        { id: 'b1', position: 200, figures: {} },
      ],
    }
    const plain = runPIC(polys, makeConfig(polys, 67.5))
    const morphed = runPIC(polys, makeConfig(polys, 67.5, morph))
    expect(morphed.map(roundSeg)).toEqual(plain.map(roundSeg))
  })

  it('constant-valued stops reproduce the uniform run at that angle', () => {
    const polys = archimedean('hexagonal')
    const morph = linearMorph(polys, -100, 55, 100, 55)
    const at55 = runPIC(polys, makeConfig(polys, 55))
    const morphed = runPIC(polys, makeConfig(polys, 40, morph))
    expect(morphed.map(roundSeg)).toEqual(at55.map(roundSeg))
  })
})

describe('morph probe — regular tilings under gradients', () => {
  const cases: { tiling: string; a0: number; a1: number }[] = [
    { tiling: 'square', a0: 35, a1: 80 },
    { tiling: 'hexagonal', a0: 35, a1: 80 },
    // Avoid the exact 60° collinear degeneracy on equilateral triangles
    // (uniform-θ behaviour, pair-B + dedup) inside the gradient band.
    { tiling: 'triangular', a0: 35, a1: 55 },
    { tiling: 'triangular', a0: 62, a1: 80 },
    { tiling: '4.8.8', a0: 40, a1: 80 },
  ]
  for (const c of cases) {
    it(`${c.tiling}: linear ${c.a0}°→${c.a1}° — invariants + shared-edge continuity`, () => {
      const polys = archimedean(c.tiling)
      const segs = runPIC(polys, makeConfig(polys, c.a0, linearMorph(polys, -180, c.a0, 180, c.a1)))
      expect(segs.length).toBeGreaterThan(0)
      checkFieldInvariants(segs, polys)
      const r = checkSharedEdgeContinuity(segs, polys)
      expect(r.checked).toBeGreaterThan(20)
      expect(r.skippedMixed / r.interiorEdges).toBeLessThan(0.6)
    })

    it(`${c.tiling}: radial ${c.a0}°→${c.a1}° — invariants + shared-edge continuity`, () => {
      const polys = archimedean(c.tiling)
      const segs = runPIC(polys, makeConfig(polys, c.a0, radialMorph(polys, 40, c.a0, 220, c.a1)))
      expect(segs.length).toBeGreaterThan(0)
      checkFieldInvariants(segs, polys)
      const r = checkSharedEdgeContinuity(segs, polys)
      expect(r.checked).toBeGreaterThan(20)
      expect(r.skippedMixed / r.interiorEdges).toBeLessThan(0.6)
    })
  }
})

describe('morph probe — nasty cases (fragile emitStarArms / pairAtVertex branches)', () => {
  // Bands deliberately cross the known thresholds: tetrakis right-triangle
  // goes asymmetric at θ ≥ 46°; Cairo's short edge degenerates at 25–32°;
  // floret / kisrhombille snap in and out of edge-slide across low θ.
  const cases: { tiling: string; a0: number; a1: number }[] = [
    { tiling: 'tetrakis-square', a0: 30, a1: 60 },
    { tiling: 'cairo-pentagonal', a0: 22, a1: 60 },
    { tiling: 'floret-pentagonal', a0: 20, a1: 72 },
    { tiling: 'kisrhombille', a0: 20, a1: 72 },
  ]
  for (const c of cases) {
    for (const mode of ['linear', 'radial'] as const) {
      it(`${c.tiling}: ${mode} ${c.a0}°→${c.a1}° — invariants + stub count vs uniform baseline`, () => {
        const polys = taprats(c.tiling)
        const morph = mode === 'linear'
          ? linearMorph(polys, -200, c.a0, 200, c.a1)
          : radialMorph(polys, 40, c.a0, 230, c.a1)
        const segs = runPIC(polys, makeConfig(polys, c.a0, morph))
        expect(segs.length).toBeGreaterThan(0)
        checkFieldInvariants(segs, polys)
        // Baseline: worst uniform-θ stub count across the swept band, sampled
        // every 2°. The morph must not create a stub storm beyond what some
        // uniform θ in the band already produces.
        let baselineMax = 0
        for (let a = Math.min(c.a0, c.a1); a <= Math.max(c.a0, c.a1); a += 2) {
          const n = countStubs(runPIC(polys, makeConfig(polys, a)), polys)
          if (n > baselineMax) baselineMax = n
        }
        const morphStubs = countStubs(segs, polys)
        expect(morphStubs, `stub storm: ${morphStubs} short arms vs uniform-baseline max ${baselineMax}`)
          .toBeLessThanOrEqual(baselineMax)
      })
    }
  }
})

describe('morph probe — vertex lines through the field', () => {
  it('decoupled vertexContactAngle interpolates: invariants + uniform equivalence', () => {
    const polys = archimedean('square')
    // Band 50°→80°: at θ < 45° on squares the vertex rays already leak past
    // the polygon at UNIFORM θ (α = 90−θ exceeds the interior half-angle, the
    // exit crossing sits at the ray's own vertex and is rejected by the clip's
    // t>ε guard — verified pre-existing, 1800/3600 endpoints at uniform 40°).
    // The morph inherits that artifact; it is not a morph regression, so the
    // probe sweeps the regime where uniform θ is leak-free.
    const extra: Partial<FigureConfig> = {
      vertexLinesEnabled: true,
      vertexLinesDecoupled: true,
      vertexContactAngle: 50,
      vertexAutoLineLength: true,
    }
    const morph: MorphConfig = {
      enabled: true,
      mode: 'linear',
      origin: { x: -180, y: 0 },
      direction: { x: 1, y: 0 },
      easing: 'linear',
      boundaries: [
        { id: 'b0', position: 0, figures: overlayFor(polys, { vertexContactAngle: 50 }) },
        { id: 'b1', position: 360, figures: overlayFor(polys, { vertexContactAngle: 80 }) },
      ],
    }
    const segs = runPIC(polys, makeConfig(polys, 67.5, morph, extra))
    expect(segs.some(s => s.kind === 'vertex-line')).toBe(true)
    checkFieldInvariants(segs, polys)

    // Constant vertex overlay ≡ uniform decoupled run at that angle.
    const constMorph: MorphConfig = {
      ...morph,
      boundaries: morph.boundaries.map(b => ({ ...b, figures: overlayFor(polys, { vertexContactAngle: 55 }) })),
    }
    const uniform = runPIC(polys, makeConfig(polys, 67.5, undefined, { ...extra, vertexContactAngle: 55 }))
    const morphed = runPIC(polys, makeConfig(polys, 67.5, constMorph, extra))
    expect(morphed.map(roundSeg)).toEqual(uniform.map(roundSeg))
  })

  it('coupled vertex lines ride the contactAngle field: invariants hold', () => {
    const polys = archimedean('square')
    const extra: Partial<FigureConfig> = { vertexLinesEnabled: true }
    const segs = runPIC(polys, makeConfig(polys, 45, linearMorph(polys, -180, 45, 180, 75), extra))
    expect(segs.some(s => s.kind === 'vertex-line')).toBe(true)
    checkFieldInvariants(segs, polys)
  })
})
