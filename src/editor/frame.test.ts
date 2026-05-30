import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { frameOutlinePolygon, computeFrameSections, frameNodePoints, placeRegularNGonOnFrameSection, frameCornerStubTiles } from './frame'

/** Axis-aligned 100×100 square outline (CCW). */
const square100: Vec2[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

describe('frameOutlinePolygon', () => {
  it('returns null for n-ring frames', () => {
    expect(frameOutlinePolygon({ type: 'n-ring', rings: 2 })).toBeNull()
  })

  it('builds a 4-vertex square centred on origin', () => {
    const out = frameOutlinePolygon({ type: 'shape', shape: 'square', size: 100 })
    expect(out).not.toBeNull()
    expect(out!.length).toBe(4)
    // Centroid at origin.
    const cx = out!.reduce((s, v) => s + v.x, 0) / 4
    const cy = out!.reduce((s, v) => s + v.y, 0) / 4
    expect(cx).toBeCloseTo(0, 6)
    expect(cy).toBeCloseTo(0, 6)
  })

  it('honours origin offset', () => {
    const out = frameOutlinePolygon({ type: 'shape', shape: 'hexagon', size: 50, origin: { x: 10, y: -20 } })!
    const cx = out.reduce((s, v) => s + v.x, 0) / out.length
    const cy = out.reduce((s, v) => s + v.y, 0) / out.length
    expect(cx).toBeCloseTo(10, 6)
    expect(cy).toBeCloseTo(-20, 6)
  })

  it('hexagon/octagon have the right side counts', () => {
    expect(frameOutlinePolygon({ type: 'shape', shape: 'hexagon', size: 50 })!.length).toBe(6)
    expect(frameOutlinePolygon({ type: 'shape', shape: 'octagon', size: 50 })!.length).toBe(8)
  })
})

describe('computeFrameSections', () => {
  it('centres full sections with a half-stub at each corner', () => {
    const sections = computeFrameSections(square100, 30)
    // Each 100-unit edge → 3 full (90) centred + two 5-unit half-stubs.
    // 5 sections/edge × 4 edges → 20.
    expect(sections.length).toBe(20)
    const full = sections.filter(s => !s.isStub)
    const stubs = sections.filter(s => s.isStub)
    expect(full.length).toBe(12)
    expect(stubs.length).toBe(8)
    for (const s of full) expect(s.length).toBeCloseTo(30, 6)
    for (const s of stubs) expect(s.length).toBeCloseTo(5, 6)
  })

  it('lays sections symmetrically about each edge midpoint', () => {
    const sections = computeFrameSections(square100, 30).filter(s => s.edgeIndex === 0)
    // First and last sections are the equal half-stubs; the full run is centred.
    expect(sections[0].isStub).toBe(true)
    expect(sections[sections.length - 1].isStub).toBe(true)
    expect(sections[0].length).toBeCloseTo(sections[sections.length - 1].length, 6)
    // The leading stub ends at the same distance the trailing stub begins from
    // the opposite corner → symmetric layout.
    const a = square100[0]
    const b = square100[1]
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y)
    const dStart = Math.hypot(sections[0].p2.x - a.x, sections[0].p2.y - a.y)
    const dEnd = edgeLen - Math.hypot(sections[sections.length - 1].p1.x - a.x, sections[sections.length - 1].p1.y - a.y)
    expect(dStart).toBeCloseTo(dEnd, 6)
  })

  it('produces no stub when edgeLength divides the edge evenly', () => {
    const sections = computeFrameSections(square100, 25)
    // 100 / 25 = 4 full, no remainder. 4 edges → 16 full sections.
    expect(sections.length).toBe(16)
    expect(sections.every(s => !s.isStub)).toBe(true)
  })

  it('section endpoints chain (p2 of one = p1 of next within an edge)', () => {
    const sections = computeFrameSections(square100, 30)
    const edge0 = sections.filter(s => s.edgeIndex === 0)
    for (let i = 1; i < edge0.length; i++) {
      expect(edge0[i].p1.x).toBeCloseTo(edge0[i - 1].p2.x, 6)
      expect(edge0[i].p1.y).toBeCloseTo(edge0[i - 1].p2.y, 6)
    }
  })

  it('returns empty for degenerate input', () => {
    expect(computeFrameSections([], 10)).toEqual([])
    expect(computeFrameSections(square100, 0)).toEqual([])
  })

  it('frameNodePoints yields one point per section', () => {
    const sections = computeFrameSections(square100, 30)
    expect(frameNodePoints(sections).length).toBe(sections.length)
  })
})

describe('placeRegularNGonOnFrameSection', () => {
  // A square Frame outline centred on origin (so "inward" = toward origin).
  const frameOutline = frameOutlinePolygon({ type: 'shape', shape: 'square', size: 200 })!
  const sections = computeFrameSections(frameOutline, 50)

  it('places a Tile with edge length = section length, tagged completed', () => {
    const full = sections.find(s => !s.isStub)!
    const tile = placeRegularNGonOnFrameSection(4, full, 'frame-0')
    expect(tile.kind).toBe('regular')
    expect(tile.sides).toBe(4)
    expect(tile.edgeLength).toBeCloseTo(full.length, 6)
    expect(tile.source).toBe('completed')
  })

  it('places the Tile on the interior (inward) side of the section', () => {
    const full = sections.find(s => !s.isStub)!
    const tile = placeRegularNGonOnFrameSection(6, full, 'frame-1')
    // Section midpoint sits on the outline; the Tile centre is pushed inward
    // (toward the frame centre at origin), so it must be strictly closer.
    const midR = Math.hypot(full.midpoint.x, full.midpoint.y)
    const ctrR = Math.hypot(tile.center.x, tile.center.y)
    expect(ctrR).toBeLessThan(midR)
  })
})

describe('frameCornerStubTiles', () => {
  it('emits one irregular corner fill per Frame corner when stubs exist', () => {
    // 100-unit edges, edgeLength 30 → 3 full (90) + 5-unit half-stub each corner.
    const tiles = frameCornerStubTiles(square100, 30)
    expect(tiles.length).toBe(4)
    for (const t of tiles) {
      expect(t.kind).toBe('irregular')
      expect(t.source).toBe('completed')
      expect(t.vertices.length).toBe(3)
    }
  })

  it('builds right-isosceles corner notches with the expected area', () => {
    // Each notch has legs = half-stub length (5) along the two incident edges.
    const tiles = frameCornerStubTiles(square100, 30)
    const area = (verts: Vec2[]) => {
      let a2 = 0
      for (let i = 0; i < verts.length; i++) {
        const j = (i + 1) % verts.length
        a2 += verts[i].x * verts[j].y - verts[j].x * verts[i].y
      }
      return Math.abs(a2) / 2
    }
    for (const t of tiles) expect(area(t.vertices)).toBeCloseTo(12.5, 6)
  })

  it('shares each notch vertex with the corner and the adjacent full sections', () => {
    // Corner (0,0): leading stub on edge 0 ends at (5,0); trailing stub on
    // edge 3 ends at (0,5). The notch must contain all three points.
    const tiles = frameCornerStubTiles(square100, 30)
    const corner0 = tiles.find(t =>
      t.vertices.some(v => Math.hypot(v.x, v.y) < 1e-6),
    )!
    const has = (px: number, py: number) =>
      corner0.vertices.some(v => Math.hypot(v.x - px, v.y - py) < 1e-6)
    expect(has(0, 0)).toBe(true)
    expect(has(5, 0)).toBe(true)
    expect(has(0, 5)).toBe(true)
  })

  it('emits no corner fills when the edge divides evenly (no stub)', () => {
    expect(frameCornerStubTiles(square100, 25)).toEqual([])
  })

  it('returns empty for degenerate input', () => {
    expect(frameCornerStubTiles([], 10)).toEqual([])
    expect(frameCornerStubTiles(square100, 0)).toEqual([])
  })
})
