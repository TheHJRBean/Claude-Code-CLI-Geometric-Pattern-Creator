import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { createDefault33434EditorConfig } from './createDefault'
import { compositionToPolygons, compositionCellBasis } from './compositionLattice'

/**
 * Exact-geometry guard for the 3.3.4.3.4 (snub square) seed — ticket #14.
 * The fingerprint suite proves coverage within tolerance; this pins the
 * shared-edge coincidences and the lattice algebra exactly, so a wrong Cell
 * offset or rotation fails loudly rather than as a few-per-mille coverage
 * drift.
 */

// Quantise, squashing negative zero (square-b's shared vertex lands at
// x = −1e-14, which would print as "-0.000000").
const q = (n: number): string => {
  const r = Math.round(n * 1e6) / 1e6
  return (r === 0 ? 0 : r).toFixed(6)
}
const key = (v: Vec2): string => `${q(v.x)},${q(v.y)}`

describe('createDefault33434EditorConfig', () => {
  const patch = createDefault33434EditorConfig()
  const L = patch.edgeLength
  const polys = compositionToPolygons(patch)
  const squares = polys.filter(p => p.sides === 4)
  const triangles = polys.filter(p => p.sides === 3)
  const squareA = squares.find(p => Math.abs(p.center.x) < 1e-9 && Math.abs(p.center.y) < 1e-9)!
  const squareB = squares.find(p => p !== squareA)!

  it('seeds two squares and four triangles at the Patch edge length', () => {
    expect(polys.length).toBe(6)
    expect(squares.length).toBe(2)
    expect(triangles.length).toBe(4)
    for (const p of polys) {
      for (let i = 0; i < p.vertices.length; i++) {
        const a = p.vertices[i], b = p.vertices[(i + 1) % p.vertices.length]
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(L, 9)
      }
    }
  })

  it('each triangle shares its base with the matching square-a edge', () => {
    const aKeys = new Set(squareA.vertices.map(key))
    for (const t of triangles) {
      const shared = t.vertices.filter(v => aKeys.has(key(v)))
      expect(shared.length).toBe(2)
    }
  })

  it('square-b closes the vertex figure across the up-triangle right edge', () => {
    const up = triangles.find(t => t.center.y > 0 && Math.abs(t.center.x) < 1e-9)!
    const bKeys = new Set(squareB.vertices.map(key))
    // square-b shares one full edge with the up triangle...
    const sharedUp = up.vertices.filter(v => bKeys.has(key(v)))
    expect(sharedUp.length).toBe(2)
    // ...one of whose ends is square-a's top-right corner (the 3.3.4.3.4
    // vertex where both squares and the up triangle meet).
    expect(bKeys.has(key({ x: L / 2, y: L / 2 }))).toBe(true)
    // square-b's fourth-side vertex (one edge step from the corner, 30°
    // above the row) sits at (L(1+√3)/2, L).
    const expected = { x: (L * (1 + Math.sqrt(3))) / 2, y: L }
    expect(bKeys.has(key(expected))).toBe(true)
  })

  it('the four triangles are pairwise translation-inequivalent (distinct apex directions)', () => {
    // Apex = the vertex not shared with square-a; its direction from the
    // triangle centroid must differ per triangle (translations preserve it).
    const aKeys = new Set(squareA.vertices.map(key))
    const dirs = triangles.map(t => {
      const apex = t.vertices.find(v => !aKeys.has(key(v)))!
      return Math.round(
        (Math.atan2(apex.y - t.center.y, apex.x - t.center.x) * 180) / Math.PI,
      )
    })
    expect(new Set(dirs).size).toBe(4)
  })

  it('lattice basis is square, tilted 15°, and matches the domain area exactly', () => {
    const { u, v } = compositionCellBasis(patch)
    expect(u.x).toBeCloseTo((L * (2 + Math.sqrt(3))) / 2, 9)
    expect(u.y).toBeCloseTo(L / 2, 9)
    // v = rotate(u, π/2).
    expect(v.x).toBeCloseTo(-u.y, 9)
    expect(v.y).toBeCloseTo(u.x, 9)
    // |u| = L√(2+√3), at 15° to the x axis.
    expect(Math.hypot(u.x, u.y)).toBeCloseTo(L * Math.sqrt(2 + Math.sqrt(3)), 9)
    expect((Math.atan2(u.y, u.x) * 180) / Math.PI).toBeCloseTo(15, 9)
    // Domain area equals the lattice cell area (no gap, no overlap by area).
    const area = (verts: Vec2[]): number => {
      let a = 0
      for (let i = 0; i < verts.length; i++) {
        const p = verts[i], q = verts[(i + 1) % verts.length]
        a += p.x * q.y - q.x * p.y
      }
      return Math.abs(a) / 2
    }
    const domain = polys.reduce((s, p) => s + area(p.vertices), 0)
    expect(domain).toBeCloseTo(Math.abs(u.x * v.y - u.y * v.x), 6)
    expect(domain).toBeCloseTo(L * L * (2 + Math.sqrt(3)), 6)
  })

  it('u translates the left triangle onto the triangle right of square-b exactly', () => {
    const { u } = compositionCellBasis(patch)
    const left = triangles.find(t => t.center.x < 0)!
    // Translated copy = the triangle with vertices (L/2,L/2),
    // (L(1+√3)/2, L(1+... )) — assert against the derived closure triangle
    // A(L/2,L/2), P(L(1+√3)/2, L/2 + ... ) computed from square-b's edge.
    const translated = left.vertices
      .map(p => ({ x: p.x + u.x, y: p.y + u.y }))
      .map(key)
      .sort()
    const expected = [
      { x: L / 2, y: L / 2 },
      { x: (L * (1 + Math.sqrt(3))) / 2, y: L },
      { x: (L * (1 + Math.sqrt(3))) / 2, y: 0 },
    ].map(key).sort()
    expect(translated).toEqual(expected)
  })
})
