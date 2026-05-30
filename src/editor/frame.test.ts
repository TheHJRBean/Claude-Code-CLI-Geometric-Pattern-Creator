import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { frameOutlinePolygon, computeFrameSections, frameNodePoints } from './frame'

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
  it('spaces full sections at exactly edgeLength with one stub per edge', () => {
    const sections = computeFrameSections(square100, 30)
    // Each 100-unit edge → 3 full (90) + 1 stub (10). 4 edges → 16 sections.
    expect(sections.length).toBe(16)
    const full = sections.filter(s => !s.isStub)
    const stubs = sections.filter(s => s.isStub)
    expect(full.length).toBe(12)
    expect(stubs.length).toBe(4)
    for (const s of full) expect(s.length).toBeCloseTo(30, 6)
    for (const s of stubs) expect(s.length).toBeCloseTo(10, 6)
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
