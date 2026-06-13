import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import {
  frameOutlinePolygon, computeFrameSections, frameNodePoints,
  frameUnitModel, frameUnitsToPx,
  MIN_FRAME_SIZE, MAX_FRAME_SIZE, MAX_FRAME_UNITS,
} from './frame'

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

// Characterization tests for the Gallery Frame unit-sizing clamp (thermo-nuclear
// review Chunk 3). Extracted out of Sidebar.tsx; the clamp edges previously
// froze the slider, so the round-trip stability below is the regression guard.

describe('frameUnitModel', () => {
  it('typical case: a 500-unit repeat gives the full 1..MAX range', () => {
    expect(frameUnitModel(500, 400)).toEqual({ min: 1, max: MAX_FRAME_UNITS, units: 1 })
  })

  it('expresses the stored px size in whole repeat units', () => {
    expect(frameUnitModel(100, 400).units).toBe(4) // round(400/100)
  })

  it('a tiny repeat raises min above 1 (a unit must be ≥ MIN_FRAME_SIZE px)', () => {
    const m = frameUnitModel(40, 400)
    expect(m.min).toBe(Math.ceil(MIN_FRAME_SIZE / 40)) // = 2
    expect(frameUnitModel(40, 50).units).toBe(m.min)   // round(1.25)=1 clamped up to min
  })

  it('clamps units to [min, max]', () => {
    expect(frameUnitModel(40, 1e7).units).toBe(frameUnitModel(40, 1e7).max) // huge → max
    expect(frameUnitModel(500, 1).units).toBe(1)                            // tiny → min
  })

  it('max never drops below min, even for an enormous repeat', () => {
    const m = frameUnitModel(10000, 400) // floor(8000/10000)=0 would beat min
    expect(m.max).toBeGreaterThanOrEqual(m.min)
    expect(m.max).toBe(1)
  })

  it('max is capped at MAX_FRAME_UNITS', () => {
    expect(frameUnitModel(10, 400).max).toBe(MAX_FRAME_UNITS) // floor(800) capped to 16
  })
})

describe('frameUnitsToPx', () => {
  it('multiplies units by the repeat within the px range', () => {
    expect(frameUnitsToPx(4, 100)).toBe(400)
  })

  it('clamps below MIN and above MAX frame size', () => {
    expect(frameUnitsToPx(1, 40)).toBe(MIN_FRAME_SIZE)    // 40 < 80 → clamped up
    expect(frameUnitsToPx(100, 500)).toBe(MAX_FRAME_SIZE) // 50000 → clamped down
  })
})

describe('frame unit round-trip stability (slider-freeze guard)', () => {
  // The documented bug: if the top unit's px (max × repeat) exceeded
  // MAX_FRAME_SIZE, frameUnitsToPx clamped it back and the model re-derived a
  // smaller unit, so the slider snapped away from its max and froze. The `max`
  // formula caps units so this can't happen — pin it across a range of repeats.
  for (const repeat of [40, 100, 333, 500, 600, 1000, 2000]) {
    it(`max unit survives a px round-trip at repeat=${repeat}`, () => {
      const { max } = frameUnitModel(repeat, 400)
      const px = frameUnitsToPx(max, repeat)
      expect(frameUnitModel(repeat, px).units).toBe(max)
    })
  }
})
