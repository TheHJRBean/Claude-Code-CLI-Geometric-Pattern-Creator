import { describe, it, expect, beforeEach } from 'vitest'
import type { PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { resetIds } from '../tilings/shared'
import { runPIC } from '../pic/index'
import { editorTilesToPolygons } from './buildEditorPolygons'
import { editorLatticeStamps, applyStamp, type LatticeStamp } from './lattice'
import { compositionToPolygons, compositionLatticeStamps } from './compositionLattice'
import { convertPresetToEditorConfig } from './presetConversion'

// Tolerance fingerprint suite (convergence ticket #4, Q12/Q4): for every
// flagship preset, the converted Builder lattice must reproduce the BFS
// pipeline's output within tolerance — golden-fingerprint idiom (segment
// count + total length), not byte-exact snapshots, because the two fields
// may sit at different lattice offsets/orientations.
//
// Three checks per flagship:
//   1. Per-tile-type emission (interior polygons): segments-per-polygon and
//      mean segment length match between pipelines — the converted tiles are
//      congruent to the BFS tiles and PIC emits identically on them.
//      Calibrated tolerance: square/hex/oct/dodec types match EXACTLY (0.00%
//      probed); triangles carry ≤3% noise from PIC's per-copy tie-breaking
//      (rotation-dependent float ties in the pair/dedup passes — a known PIC
//      trait, not a conversion artifact).
//   2. Coverage: polygon area clipped to the window sums to the window area
//      on BOTH pipelines (no gaps, no overlaps — catches a wrong lattice
//      basis or a wrongly scaled/rotated seed). Probed at exactly 1.000.
//   3. Field density: segment count + total length per window agree between
//      pipelines (probed ≤5.1%, worst on the triangular tiling's tie noise).

beforeEach(() => resetIds())

const VP = { x: -450, y: -450, width: 900, height: 900 }
/** Half-extent of the inner comparison window (fully covered by both fields). */
const INNER = 300

const FLAGSHIPS: Array<{ type: string; scale: number }> = [
  { type: 'square', scale: 100 },
  { type: 'hexagonal', scale: 80 },
  { type: 'triangular', scale: 60 },
  { type: '4.8.8', scale: 60 },
  { type: '3.12.12', scale: 50 },
  { type: '4.6.12', scale: 45 },
  { type: '3.6.3.6', scale: 70 },
  { type: '3.4.6.4', scale: 60 },
  { type: '3.3.3.4.4', scale: 60 },
]

function presetConfig(type: string, scale: number): PatternConfig {
  return {
    tiling: { type, scale },
    figures: (TILINGS[type].defaultConfig?.figures ?? {}) as PatternConfig['figures'],
    strand: { width: 4, color: '#1a1a2e', background: '#f5f0e8' },
  }
}

/** Sutherland–Hodgman clip of a polygon to the ±INNER window. */
function clipToWindow(vertices: Vec2[]): Vec2[] {
  const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
    ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const clipEdge = (
    pts: Vec2[],
    inside: (p: Vec2) => boolean,
    intersect: (a: Vec2, b: Vec2) => Vec2,
  ): Vec2[] => {
    const out: Vec2[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const ai = inside(a), bi = inside(b)
      if (ai) out.push(a)
      if (ai !== bi) out.push(intersect(a, b))
    }
    return out
  }
  let poly = vertices
  poly = clipEdge(poly, p => p.x >= -INNER, (a, b) => lerp(a, b, (-INNER - a.x) / (b.x - a.x)))
  if (poly.length === 0) return poly
  poly = clipEdge(poly, p => p.x <= INNER, (a, b) => lerp(a, b, (INNER - a.x) / (b.x - a.x)))
  if (poly.length === 0) return poly
  poly = clipEdge(poly, p => p.y >= -INNER, (a, b) => lerp(a, b, (-INNER - a.y) / (b.y - a.y)))
  if (poly.length === 0) return poly
  poly = clipEdge(poly, p => p.y <= INNER, (a, b) => lerp(a, b, (INNER - a.y) / (b.y - a.y)))
  return poly
}

function shoelaceArea(vertices: Vec2[]): number {
  let a = 0
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i]
    const q = vertices[(i + 1) % vertices.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

function stampPolygons(base: Polygon[], stamps: LatticeStamp[]): Polygon[] {
  const out: Polygon[] = []
  for (let s = 0; s < stamps.length; s++) {
    for (const p of base) {
      out.push({
        ...p,
        id: `${p.id}@${s}`,
        center: applyStamp(p.center, stamps[s]),
        vertices: p.vertices.map(v => applyStamp(v, stamps[s])),
      })
    }
  }
  return out
}

function inWindow(p: Vec2): boolean {
  return Math.abs(p.x) <= INNER && Math.abs(p.y) <= INNER
}

interface TypeStats { polys: number; segs: number; len: number }

/** Per-tile-type stats over INTERIOR polygons (centre in the window, so far
 * from the generated field's rim) and the segments they own. */
function statsByType(polygons: Polygon[], segments: Segment[]): Map<string, TypeStats> {
  const stats = new Map<string, TypeStats>()
  const get = (id: string): TypeStats => {
    let s = stats.get(id)
    if (!s) { s = { polys: 0, segs: 0, len: 0 }; stats.set(id, s) }
    return s
  }
  const interior = new Set<string>()
  for (const p of polygons) {
    if (!inWindow(p.center)) continue
    interior.add(p.id)
    get(p.tileTypeId).polys++
  }
  for (const s of segments) {
    if (!interior.has(s.polygonId)) continue
    const t = get(s.tileTypeId)
    t.segs++
    t.len += Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
  }
  return stats
}

describe.each(FLAGSHIPS)('flagship fingerprint: $type', ({ type, scale }) => {
  const config = presetConfig(type, scale)

  // BFS pipeline field.
  const bfsPolys = generateTiling(TILINGS[type], VP, scale)
  const bfsSegs = runPIC(bfsPolys, config)

  // Converted Builder lattice field, stamped over the same viewport.
  const converted = convertPresetToEditorConfig(config)!
  const patch = converted.editor!
  const multiCell = patch.cells.length > 1
  const basePolys = multiCell
    ? compositionToPolygons(patch)
    : editorTilesToPolygons(patch.cells[0])
  const stamps = multiCell
    ? compositionLatticeStamps(patch, VP)
    : editorLatticeStamps(patch.cells[0], VP)
  const latPolys = stampPolygons(basePolys, stamps)
  const latSegs = runPIC(latPolys, converted)

  it('per-tile-type emission matches (congruent tiles, identical figures)', () => {
    const bfs = statsByType(bfsPolys, bfsSegs)
    const lat = statsByType(latPolys, latSegs)
    expect([...lat.keys()].sort()).toEqual([...bfs.keys()].sort())
    for (const [tileType, b] of bfs) {
      const l = lat.get(tileType)!
      expect(b.polys).toBeGreaterThan(0)
      expect(l.polys).toBeGreaterThan(0)
      // Segments per polygon: exact for even-sided regulars, ≤3% probed tie
      // noise on triangles — 4% keeps headroom without masking a real drift.
      const perPolyB = b.segs / b.polys
      const perPolyL = l.segs / l.polys
      expect(Math.abs(perPolyL - perPolyB) / perPolyB).toBeLessThan(0.04)
      // Mean segment length: ≤1.2% probed.
      const meanB = b.len / b.segs
      const meanL = l.len / l.segs
      expect(Math.abs(meanL - meanB) / meanB).toBeLessThan(0.02)
    }
  })

  it('both fields tile the window without gaps or overlaps', () => {
    const windowArea = (2 * INNER) ** 2
    for (const polys of [bfsPolys, latPolys]) {
      const covered = polys.reduce((sum, p) => {
        const clipped = clipToWindow(p.vertices)
        return clipped.length ? sum + shoelaceArea(clipped) : sum
      }, 0)
      // Exact-coverage check: gaps pull below 1, overlaps push above 1.
      // Probed at 1.00000 on every flagship for both pipelines.
      expect(covered / windowArea).toBeGreaterThan(0.995)
      expect(covered / windowArea).toBeLessThan(1.005)
    }
  })

  it('segment count + total length densities agree within tolerance', () => {
    const density = (segs: Segment[]): { n: number; len: number } => {
      let n = 0, len = 0
      for (const s of segs) {
        const mid = { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 }
        if (!inWindow(mid)) continue
        n++
        len += Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
      }
      return { n, len }
    }
    const b = density(bfsSegs)
    const l = density(latSegs)
    expect(b.n).toBeGreaterThan(0)
    // The two fields sit at (possibly) different lattice offsets so the
    // window rim clips them differently; probed ≤5.1% (triangular, whose
    // per-copy PIC tie noise dominates), ≤2% everywhere else.
    expect(Math.abs(l.n - b.n) / b.n).toBeLessThan(0.07)
    expect(Math.abs(l.len - b.len) / b.len).toBeLessThan(0.07)
  })
})
