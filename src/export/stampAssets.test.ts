import { describe, it, expect } from 'vitest'
import { nameVoidShapes, voidStampCanvas, voidShapeSVGDocument } from './stampAssets'

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

const regularNGon = (n: number, r = 10, rot = 0) =>
  Array.from({ length: n }, (_, i) => ({
    x: r * Math.cos(rot + (2 * Math.PI * i) / n),
    y: r * Math.sin(rot + (2 * Math.PI * i) / n),
  }))

describe('nameVoidShapes', () => {
  it('names regular shapes by their polygon name and dedupes by signature', () => {
    const tri = regularNGon(3)
    const hex = regularNGon(6)
    const named = nameVoidShapes([
      { signature: 'tri', polygon: tri },
      { signature: 'hex', polygon: hex },
      { signature: 'tri', polygon: tri }, // duplicate signature — dropped
    ])
    expect(named.map(s => s.name)).toEqual(['triangle', 'hexagon'])
  })

  it('numbers distinct shapes sharing a base name', () => {
    const named = nameVoidShapes([
      { signature: 'a', polygon: regularNGon(3, 10) },
      { signature: 'b', polygon: regularNGon(3, 20) },
      { signature: 'c', polygon: regularNGon(6) },
    ])
    expect(named.map(s => s.name)).toEqual(['triangle-1', 'triangle-2', 'hexagon'])
  })

  it('labels non-regular shapes as <n>-gon', () => {
    const named = nameVoidShapes([
      { signature: 'q', polygon: QUAD },
    ])
    expect(named[0].name).toBe('4-gon')
  })

  it('prefers keyPolygon (straight outline) over the rendered polygon', () => {
    const tri = regularNGon(3)
    const named = nameVoidShapes([
      { signature: 't', polygon: [...tri, ...tri], keyPolygon: tri },
    ])
    expect(named[0].name).toBe('triangle')
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
