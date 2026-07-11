import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { createDefault33344EditorConfig } from './createDefault'
import { compositionToPolygons, compositionCellBasis } from './compositionLattice'

/**
 * Exact-geometry guard for the 3.3.3.4.4 (elongated triangular) seed —
 * ticket #11. The fingerprint suite proves coverage within tolerance; this
 * pins the shared-edge coincidences and the lattice algebra exactly, so a
 * wrong Cell offset or rotation fails loudly rather than as a few-per-mille
 * coverage drift.
 */

const key = (v: Vec2): string => `${v.x.toFixed(6)},${v.y.toFixed(6)}`

describe('createDefault33344EditorConfig', () => {
  const patch = createDefault33344EditorConfig()
  const L = patch.edgeLength
  const polys = compositionToPolygons(patch)
  const square = polys.find(p => p.sides === 4)!
  const triangles = polys.filter(p => p.sides === 3)

  it('seeds one square and two triangles at the Patch edge length', () => {
    expect(polys.length).toBe(3)
    expect(square).toBeDefined()
    expect(triangles.length).toBe(2)
    for (const p of polys) {
      for (let i = 0; i < p.vertices.length; i++) {
        const a = p.vertices[i], b = p.vertices[(i + 1) % p.vertices.length]
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(L, 9)
      }
    }
  })

  it('up-triangle base coincides with the square top edge', () => {
    const squareTop = square.vertices.filter(v => v.y > 0).map(key).sort()
    expect(squareTop.length).toBe(2)
    const up = triangles.find(t => Math.abs(t.center.x) < 1e-9)!
    const upBase = up.vertices.filter(v => Math.abs(v.y - L / 2) < 1e-9).map(key).sort()
    expect(upBase).toEqual(squareTop)
  })

  it('down-triangle shares an edge with the up-triangle and an apex on the square row', () => {
    const up = triangles.find(t => Math.abs(t.center.x) < 1e-9)!
    const down = triangles.find(t => t !== up)!
    const upKeys = new Set(up.vertices.map(key))
    // Shared edge = exactly two coincident vertices.
    const shared = down.vertices.filter(v => upKeys.has(key(v)))
    expect(shared.length).toBe(2)
    // Apex touches the square row's top-right corner.
    const apex = down.vertices.find(v => Math.abs(v.y - L / 2) < 1e-9)!
    expect(apex.x).toBeCloseTo(L / 2, 9)
  })

  it('lattice basis translates the domain onto adjacent rows and columns exactly', () => {
    const { u, v } = compositionCellBasis(patch)
    expect(u).toEqual({ x: L, y: 0 })
    expect(v.x).toBeCloseTo(L / 2, 9)
    expect(v.y).toBeCloseTo((L * (2 + Math.sqrt(3))) / 2, 9)
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
    // v maps the square's top-right corner onto the next row square's
    // top-right corner (offset row): translate square by v and its bottom
    // edge must land on the triangle strip's top vertex line y = L/2 + h.
    const h = (L * Math.sqrt(3)) / 2
    const bottomAfterV = Math.min(...square.vertices.map(p => p.y + v.y))
    expect(bottomAfterV).toBeCloseTo(L / 2 + h, 9)
  })
})
