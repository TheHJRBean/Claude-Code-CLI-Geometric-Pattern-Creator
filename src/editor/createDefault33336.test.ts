import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { createDefault33336EditorConfig } from './createDefault'
import { compositionToPolygons, compositionCellBasis } from './compositionLattice'

/**
 * Exact-geometry guard for the 3.3.3.3.6 (snub hexagonal) seed — ticket #16.
 * The fingerprint suite proves coverage within tolerance; this pins the
 * shared-edge coincidences, the pocket-triangle placement (the chiral part),
 * and the lattice algebra exactly, so a wrong Cell offset or rotation fails
 * loudly rather than as a few-per-mille coverage drift.
 */

// Quantise, squashing negative zero (rotated vertices land at ±1e-14, which
// would print as "-0.000000").
const q = (n: number): string => {
  const r = Math.round(n * 1e6) / 1e6
  return (r === 0 ? 0 : r).toFixed(6)
}
const key = (v: Vec2): string => `${q(v.x)},${q(v.y)}`

describe('createDefault33336EditorConfig', () => {
  const patch = createDefault33336EditorConfig()
  const L = patch.edgeLength
  const polys = compositionToPolygons(patch)
  const hexagons = polys.filter(p => p.sides === 6)
  const triangles = polys.filter(p => p.sides === 3)
  const hexagon = hexagons[0]
  const hexKeys = new Set(hexagon.vertices.map(key))
  const pockets = triangles.filter(t => String(t.id).includes('pocket'))
  const edgeTris = triangles.filter(t => !String(t.id).includes('pocket'))

  it('seeds one hexagon and eight triangles at the Patch edge length', () => {
    expect(polys.length).toBe(9)
    expect(hexagons.length).toBe(1)
    expect(triangles.length).toBe(8)
    for (const p of polys) {
      for (let i = 0; i < p.vertices.length; i++) {
        const a = p.vertices[i], b = p.vertices[(i + 1) % p.vertices.length]
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(L, 9)
      }
    }
  })

  it('each of the six edge triangles shares its base with a distinct hexagon edge', () => {
    expect(edgeTris.length).toBe(6)
    const seenBases = new Set<string>()
    for (const t of edgeTris) {
      const shared = t.vertices.filter(v => hexKeys.has(key(v)))
      expect(shared.length).toBe(2)
      seenBases.add(shared.map(key).sort().join('|'))
    }
    // Six distinct bases ⇒ all six hexagon edges are triangle-shared.
    expect(seenBases.size).toBe(6)
  })

  it('pocket triangles touch the hexagon at exactly one vertex (no shared edge)', () => {
    expect(pockets.length).toBe(2)
    for (const t of pockets) {
      const shared = t.vertices.filter(v => hexKeys.has(key(v)))
      expect(shared.length).toBe(1)
    }
  })

  it('pocket-n sits on the hexagon top vertex with apex +x; pocket-nw is its 60° rotation mate', () => {
    const pocketN = pockets.find(t => t.center.x > 0)!
    const pocketNW = pockets.find(t => t.center.x < 0)!
    const s3 = Math.sqrt(3)
    expect(pocketN.vertices.map(key).sort()).toEqual(
      [
        { x: 0, y: L },
        { x: 0, y: 2 * L },
        { x: (s3 * L) / 2, y: (3 * L) / 2 },
      ].map(key).sort(),
    )
    // pocket-nw = rot60(pocket-n) about the Patch origin — the chirality
    // witness: the mirror tiling would place it as rot(-60) instead.
    const rot60 = (p: Vec2): Vec2 => ({
      x: p.x / 2 - (p.y * s3) / 2,
      y: (p.x * s3) / 2 + p.y / 2,
    })
    expect(pocketNW.vertices.map(key).sort()).toEqual(
      pocketN.vertices.map(rot60).map(key).sort(),
    )
  })

  it('the eight triangles are pairwise translation-inequivalent', () => {
    const { u, v } = compositionCellBasis(patch)
    const det = u.x * v.y - u.y * v.x
    // Lattice coords of each centroid; fractional parts must be pairwise
    // distinct within each orientation class (equal fractional parts would
    // mean two seed triangles are lattice translates — a double-stamp).
    const frac = (n: number): number => ((n % 1) + 1) % 1
    const latticeKey = (t: { center: Vec2 }): string => {
      const a = (t.center.x * v.y - t.center.y * v.x) / det
      const b = (t.center.y * u.x - t.center.x * u.y) / det
      return `${q(frac(a))},${q(frac(b))}`
    }
    const keys = triangles.map(latticeKey)
    expect(new Set(keys).size).toBe(8)
  })

  it('lattice basis is hexagonal with |u| = L√7 and matches the domain area exactly', () => {
    const { u, v } = compositionCellBasis(patch)
    const s3 = Math.sqrt(3)
    expect(u.x).toBeCloseTo(L * s3, 9)
    expect(u.y).toBeCloseTo(2 * L, 9)
    // v = rotate(u, 60°).
    expect(v.x).toBeCloseTo(u.x / 2 - (u.y * s3) / 2, 9)
    expect(v.y).toBeCloseTo((u.x * s3) / 2 + u.y / 2, 9)
    expect(Math.hypot(u.x, u.y)).toBeCloseTo(L * Math.sqrt(7), 9)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(L * Math.sqrt(7), 9)
    // Domain area equals the lattice cell area (no gap, no overlap by area).
    const area = (verts: Vec2[]): number => {
      let a = 0
      for (let i = 0; i < verts.length; i++) {
        const p = verts[i], r = verts[(i + 1) % verts.length]
        a += p.x * r.y - r.x * p.y
      }
      return Math.abs(a) / 2
    }
    const domain = polys.reduce((s, p) => s + area(p.vertices), 0)
    expect(domain).toBeCloseTo(Math.abs(u.x * v.y - u.y * v.x), 6)
    expect(domain).toBeCloseTo((7 * s3 * L * L) / 2, 6)
  })

  it('v translates the SE edge triangle onto the gap closing the top-vertex figure', () => {
    const { v } = compositionCellBasis(patch)
    const s3 = Math.sqrt(3)
    const triSE = edgeTris.find(t => t.center.x > 0 && t.center.y < -L / 2)!
    const translated = triSE.vertices
      .map(p => ({ x: p.x + v.x, y: p.y + v.y }))
      .map(key)
      .sort()
    // The stamped copy = {(0,L),(0,2L),(−√3L/2,3L/2)} — the fifth tile around
    // the hexagon's top vertex (0,L), completing 3.3.3.3.6 there: hexagon +
    // tri-ne + tri-nw + pocket-n + this stamp = 120° + 4·60° = 360°.
    const expected = [
      { x: 0, y: L },
      { x: 0, y: 2 * L },
      { x: -(s3 * L) / 2, y: (3 * L) / 2 },
    ].map(key).sort()
    expect(translated).toEqual(expected)
    // And the seed does supply the other four tiles at that vertex.
    const topKey = key({ x: 0, y: L })
    const incident = polys.filter(p => p.vertices.some(w => key(w) === topKey))
    expect(incident.length).toBe(4) // hexagon + tri-ne + tri-nw + pocket-n
    expect(incident.filter(p => p.sides === 6).length).toBe(1)
  })
})
