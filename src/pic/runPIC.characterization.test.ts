import { describe, it, expect, beforeEach } from 'vitest'
import { runPIC } from './index'
import { generateTiling } from '../tilings/archimedean'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { resetIds } from '../tilings/shared'
import type { PatternConfig, FigureConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { Viewport } from '../tilings/archimedean'

// Golden + adversarial characterization of runPIC (thermo-nuclear review Chunk 7).
// pic/ is the documented edge-case minefield; this pins the full pipeline's
// output across a matrix of tilings/θ so any refactor (the deferred branch-ladder
// reframe; the dead-`convex`-param removal) is provably behaviour-preserving.

beforeEach(() => resetIds())

const VP: Viewport = { x: -150, y: -150, width: 300, height: 300 }

const fig = (contactAngle: number, over: Partial<FigureConfig> = {}): FigureConfig =>
  ({ type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle, ...over })

/** A small, stable fingerprint of a segment field: count + summed rounded
 *  length (sensitive to coordinate changes) + per-kind counts (sensitive to
 *  branch-selection changes). Robust to float noise via rounding. */
function fingerprint(segs: Segment[]): { n: number; len: number; arms: number; vtx: number } {
  let len = 0, arms = 0, vtx = 0
  for (const s of segs) {
    len += Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
    if (s.kind === 'star-arm') arms++
    else vtx++
  }
  return { n: segs.length, len: Math.round(len), arms, vtx }
}

interface Case { key: string; gen: () => Polygon[]; config: PatternConfig }

const CASES: Case[] = [
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
    key: 'triangular@60',
    gen: () => generateTiling(TILINGS['triangular'], VP, 60),
    config: { ...DEFAULT_CONFIG, tiling: { type: 'triangular', scale: 60 }, figures: { 3: fig(60) } },
  },
  {
    key: '4.8.8',
    gen: () => generateTiling(TILINGS['4.8.8'], VP, 60),
    config: { ...DEFAULT_CONFIG, tiling: { type: '4.8.8', scale: 60 }, figures: { 4: fig(45), 8: fig(67.5) } },
  },
  {
    key: 'square-vertexlines',
    gen: () => generateTiling(TILINGS['square'], VP, 100),
    config: { ...DEFAULT_CONFIG, figures: { 4: fig(67.5, { vertexLinesEnabled: true }) } },
  },
  {
    key: 'square-fixedlen',
    gen: () => generateTiling(TILINGS['square'], VP, 100),
    config: { ...DEFAULT_CONFIG, figures: { 4: fig(67.5, { autoLineLength: false, lineLength: 0.6 }) } },
  },
  // 2026-07-13 (rosette epic Step 4, ticket #23): the 6 rosette-patch/taprats
  // golden cases that used to live here (cairo@27.5, floret@40, floret@40-edge,
  // kisrhombille@72, nonagonal@54, tetrakis@46) were retired — `usePattern`
  // now dispatches the `rosette-patch` category to `runRosettePIC`, not
  // `runPIC`, so pinning their fingerprints against `runPIC` no longer tests
  // the live path. Coverage moved to `pic/rosettePatch.test.ts` (Kepler
  // baseline + collinear-singularity + grand-matrix property checks + the
  // buildStrands interop suite, spanning all rosette-patch tilings incl.
  // these five across a spread of contact angles).
  {
    // Rosette-patch epic ticket #21 — Kepler's Star, star-of-squares over
    // 4^4 at theta=67.5 through the existing archimedean path (gap octagon
    // is regular there). Same underlying geometry as 'square@67.5'.
    key: 'keplers-star@67.5',
    gen: () => generateTiling(TILINGS['keplers-star'], VP, 100),
    config: { ...DEFAULT_CONFIG, tiling: { type: 'keplers-star', scale: 100 }, figures: { 4: fig(67.5) } },
  },
]

// Captured 2026-06-13 on `main` @ 609e1c2 (before the dead-`convex`-param
// removal). Any diff here means runPIC's output changed — investigate before
// updating these numbers.
const GOLDEN: Record<string, ReturnType<typeof fingerprint>> = {
  'square@67.5': { n: 968, len: 37044, arms: 968, vtx: 0 },
  'hexagonal@60': { n: 540, len: 21600, arms: 540, vtx: 0 },
  'triangular@60': { n: 1648, len: 38916, arms: 1648, vtx: 0 },
  '4.8.8': { n: 551, len: 21315, arms: 551, vtx: 0 },
  // vtx == arms: vertex lines emit on EVERY edge (no shared-edge gate, 2026-06-17),
  // including the field-boundary squares the old gate suppressed (was vtx 880).
  'square-vertexlines': { n: 1936, len: 89432, arms: 968, vtx: 968 },
  'square-fixedlen': { n: 968, len: 29040, arms: 968, vtx: 0 },
  // Captured 2026-07-13 (ticket #21). Same geometry as 'square@67.5' — the
  // registry entry differs only in name/label, so the fingerprint matches.
  'keplers-star@67.5': { n: 968, len: 37044, arms: 968, vtx: 0 },
}

describe('runPIC — golden fingerprint across the tiling/θ matrix', () => {
  for (const c of CASES) {
    it(`${c.key} output is stable`, () => {
      const fp = fingerprint(runPIC(c.gen(), c.config))
      expect(fp).toEqual(GOLDEN[c.key])
    })
  }
})

describe('runPIC — adversarial / boundary', () => {
  it('returns [] for no polygons', () => {
    expect(runPIC([], DEFAULT_CONFIG)).toEqual([])
  })

  it('skips polygons whose tileTypeId has no figure', () => {
    const polys = generateTiling(TILINGS['square'], VP, 100)
    expect(runPIC(polys, { ...DEFAULT_CONFIG, figures: {} })).toEqual([])
  })

  it('does not crash on a degenerate (zero-area, collinear) polygon', () => {
    const degenerate: Polygon = {
      id: 'deg', sides: 4, tileTypeId: '4',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 5, y: 0 }],
      center: { x: 8.75, y: 0 },
    }
    const segs = runPIC([degenerate], { ...DEFAULT_CONFIG, figures: { 4: fig(67.5) } })
    for (const s of segs) {
      expect(Number.isFinite(s.from.x) && Number.isFinite(s.from.y)).toBe(true)
      expect(Number.isFinite(s.to.x) && Number.isFinite(s.to.y)).toBe(true)
    }
  })

  it('emits finite coordinates at extreme contact angles', () => {
    const polys = generateTiling(TILINGS['square'], VP, 100)
    for (const angle of [5, 85]) {
      const segs = runPIC(polys, { ...DEFAULT_CONFIG, figures: { 4: fig(angle) } })
      for (const s of segs) {
        expect(Number.isFinite(s.to.x) && Number.isFinite(s.to.y)).toBe(true)
      }
    }
  })

  it('is deterministic: identical inputs yield an identical fingerprint', () => {
    const a = fingerprint(runPIC(generateTiling(TILINGS['4.8.8'], VP, 60), CASES[3].config))
    resetIds()
    const b = fingerprint(runPIC(generateTiling(TILINGS['4.8.8'], VP, 60), CASES[3].config))
    expect(b).toEqual(a)
  })

  it('dedups collinear star-arms on equilateral triangles at θ=60° (no duplicate segments)', () => {
    const polys = generateTiling(TILINGS['triangular'], VP, 60)
    const segs = runPIC(polys, { ...DEFAULT_CONFIG, tiling: { type: 'triangular', scale: 60 }, figures: { 3: fig(60) } })
    // Within each polygon, no two star-arms share both endpoints (rounded).
    const byPoly = new Map<string, Set<string>>()
    for (const s of segs) {
      if (s.kind !== 'star-arm') continue
      const r = (n: number) => Math.round(n * 1000)
      const a = `${r(s.from.x)},${r(s.from.y)}`, b = `${r(s.to.x)},${r(s.to.y)}`
      const ek = a < b ? `${a}|${b}` : `${b}|${a}`
      const set = byPoly.get(s.polygonId) ?? new Set<string>()
      expect(set.has(ek)).toBe(false) // duplicate within a polygon ⇒ dedup failed
      set.add(ek)
      byPoly.set(s.polygonId, set)
    }
  })
})
