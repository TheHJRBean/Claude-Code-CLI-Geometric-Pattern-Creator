import { describe, it, expect } from 'vitest'
import { unwovenSvgMarkup, substituteCssVariables } from './exportSVG'
import type { Segment } from '../types/geometry'

// Pin the pure "unwoven" SVG markup builder extracted from exportUnwovenSVG:
// the SVG wrapper/dimensions, one <path> per chained Strand, and the
// stroke-width = 0.1% of the viewBox diagonal formula (with width/height
// fallback when the viewBox carries no numbers).

function seg(from: Segment['from'], to: Segment['to']): Segment {
  return {
    from,
    to,
    edgeMidpoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    polygonCenter: { x: 0, y: 0 },
    polygonId: 'p',
    polygonSides: 4,
    tileTypeId: '4',
    kind: 'star-arm',
  }
}

describe('unwovenSvgMarkup', () => {
  it('emits the SVG wrapper with the given viewBox and dimensions', () => {
    const out = unwovenSvgMarkup([], '0 0 100 200', 100, 200)
    expect(out).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200" width="100" height="200">')
    expect(out).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    // No segments → no paths.
    expect(out).not.toContain('<path')
  })

  it('emits one <path> per chained strand', () => {
    // Two collinear segments chain into one strand; a disjoint segment is a second.
    const segs = [
      seg({ x: 0, y: 0 }, { x: 10, y: 0 }),
      seg({ x: 10, y: 0 }, { x: 20, y: 0 }),
      seg({ x: 0, y: 100 }, { x: 0, y: 110 }),
    ]
    const out = unwovenSvgMarkup(segs, '0 0 100 200', 100, 200)
    const paths = out.match(/<path /g) ?? []
    expect(paths).toHaveLength(2)
    expect(out).toContain('id="strand-0"')
    expect(out).toContain('id="strand-1"')
    // The chained strand renders as a single move + line-to polyline.
    expect(out).toMatch(/M0,0 L10,0 L20,0|M20,0 L10,0 L0,0/)
  })

  it('sizes the stroke at 0.1% of the viewBox diagonal', () => {
    // diag = sqrt(100^2 + 200^2) = 223.6068…; ×0.001 → 0.2236.
    const out = unwovenSvgMarkup([seg({ x: 0, y: 0 }, { x: 5, y: 0 })], '0 0 100 200', 999, 999)
    expect(out).toContain('stroke-width="0.2236"')
  })

  it('falls back to width/height when the viewBox carries no numbers', () => {
    // diag from 30×40 → 50; ×0.001 → 0.0500.
    const out = unwovenSvgMarkup([seg({ x: 0, y: 0 }, { x: 5, y: 0 })], '', 30, 40)
    expect(out).toContain('stroke-width="0.0500"')
  })
})

// substituteCssVariables keeps Frame strokes (and any `var(--x)` colour)
// visible in exported standalone SVG/PNG, where the document's CSS custom
// properties no longer apply.
describe('substituteCssVariables', () => {
  const resolve = (map: Record<string, string>) => (name: string) => map[name] ?? ''

  it('resolves a var() against the resolver', () => {
    const out = substituteCssVariables('<polygon stroke="var(--accent)" />', resolve({ '--accent': '#c0392b' }))
    expect(out).toBe('<polygon stroke="#c0392b" />')
  })

  it('replaces every occurrence', () => {
    const out = substituteCssVariables('stroke="var(--accent)" fill="var(--accent)"', resolve({ '--accent': '#abc123' }))
    expect(out).toBe('stroke="#abc123" fill="#abc123"')
  })

  it('uses the fallback when the variable is undefined', () => {
    const out = substituteCssVariables('stroke="var(--missing, #000)"', resolve({}))
    expect(out).toBe('stroke="#000"')
  })

  it('emits "none" for an undefined variable with no fallback', () => {
    const out = substituteCssVariables('stroke="var(--missing)"', resolve({}))
    expect(out).toBe('stroke="none"')
  })
})
