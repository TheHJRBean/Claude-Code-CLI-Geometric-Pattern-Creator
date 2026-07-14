import { describe, it, expect } from 'vitest'
import { voidStampCanvas, voidShapeSVGDocument } from './stampAssets'

const QUAD = [
  { x: 5, y: 5 },
  { x: 15, y: 5 },
  { x: 18, y: 11 },
  { x: 7, y: 14 },
]

describe('voidStampCanvas', () => {
  it('returns the canonical points + exact bbox (no padding)', () => {
    const c = voidStampCanvas(QUAD)!
    expect(c.points).toHaveLength(4)
    // Canonical: first vertex at origin, first edge along +x.
    expect(c.points[0].x).toBeCloseTo(0, 12)
    expect(c.points[0].y).toBeCloseTo(0, 12)
    expect(c.box.width).toBeGreaterThan(0)
    expect(c.box.height).toBeGreaterThan(0)
    // bbox tight on the points.
    const xs = c.points.map(p => p.x)
    expect(Math.min(...xs)).toBeCloseTo(c.box.x, 9)
    expect(Math.max(...xs)).toBeCloseTo(c.box.x + c.box.width, 9)
  })

  it('is null for degenerate outlines', () => {
    expect(voidStampCanvas([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeNull()
  })
})

describe('voidShapeSVGDocument', () => {
  it('emits a standalone SVG whose viewBox equals the bbox', () => {
    const c = voidStampCanvas(QUAD)!
    const svg = voidShapeSVGDocument(c.points, c.box)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain(`viewBox="${Math.round(c.box.x * 1000) / 1000} ${Math.round(c.box.y * 1000) / 1000}`)
    expect(svg).toContain('<path d="M')
    expect(svg).toContain('Z"')
    expect(svg).toContain('fill="none"')
  })
})
