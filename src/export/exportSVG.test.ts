import { describe, it, expect } from 'vitest'
import { unwovenSvgMarkup, substituteCssVariables, stripExportExclusions, boundsFromPointsAttr, padContentBounds, insertBackgroundRect, fittedRasterSize, MAX_RASTER_AREA, MAX_RASTER_DIMENSION } from './exportSVG'
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

  // Regression (thermonuclear round 2, 2026-07-08): the old regex stopped the
  // fallback at the FIRST `)`, truncating rgba(...) fallbacks and leaving a
  // stray paren — malformed paint (black markers) in Lab exports.
  it('keeps an rgba() fallback intact when the variable resolves', () => {
    const out = substituteCssVariables('stroke="var(--x, rgba(1,2,3,0.5))"', resolve({ '--x': '#123456' }))
    expect(out).toBe('stroke="#123456"')
  })

  it('keeps an rgba() fallback intact when the variable is undefined', () => {
    const out = substituteCssVariables('stroke="var(--x, rgba(1,2,3,0.5))"', resolve({}))
    expect(out).toBe('stroke="rgba(1,2,3,0.5)"')
  })

  it('resolves a nested var() fallback', () => {
    const out = substituteCssVariables('stroke="var(--x, var(--y, #fff))"', resolve({ '--y': '#0f0' }))
    expect(out).toBe('stroke="#0f0"')
  })

  it('handles multiple vars with function fallbacks in one string', () => {
    const out = substituteCssVariables(
      'stroke="var(--a, rgb(1,2,3))" fill="var(--b, rgba(4,5,6,0.7))"',
      resolve({ '--a': 'red' }),
    )
    expect(out).toBe('stroke="red" fill="rgba(4,5,6,0.7)"')
  })

  it('leaves non-custom-property parens untouched', () => {
    const out = substituteCssVariables('transform="rotate(45)" stroke="var(--x)"', resolve({ '--x': 'red' }))
    expect(out).toBe('transform="rotate(45)" stroke="red"')
  })
})

describe('stripExportExclusions', () => {
  it('removes a marked group and its whole subtree', () => {
    const out = stripExportExclusions(
      '<svg><g data-export="exclude"><circle cx="1"/></g><path d="M0 0"/></svg>',
    )
    expect(out).toBe('<svg><path d="M0 0"/></svg>')
  })

  it('keeps artwork when there is nothing to exclude', () => {
    const markup = '<svg><g opacity="0.5"><path d="M0 0"/></g></svg>'
    expect(stripExportExclusions(markup)).toBe(markup)
  })

  it('matches nesting so an inner <g> does not close the excluded group early', () => {
    const out = stripExportExclusions(
      '<svg><g data-export="exclude"><g><circle/></g><rect/></g><path/></svg>',
    )
    expect(out).toBe('<svg><path/></svg>')
  })

  it('removes multiple marked groups', () => {
    const out = stripExportExclusions(
      '<svg><g data-export="exclude"><a/></g><path/><g data-export="exclude"><b/></g></svg>',
    )
    expect(out).toBe('<svg><path/></svg>')
  })

  it('keeps a marked group\'s siblings intact', () => {
    const out = stripExportExclusions(
      '<svg><g id="art"><path/></g><g data-export="exclude" clipPath="url(#f)"><circle/></g></svg>',
    )
    expect(out).toBe('<svg><g id="art"><path/></g></svg>')
  })

  it('handles a self-closing marked element', () => {
    const out = stripExportExclusions('<svg><g data-export="exclude"/><path/></svg>')
    expect(out).toBe('<svg><path/></svg>')
  })

  it('leaves markup untouched when the marked group is unbalanced', () => {
    const markup = '<svg><g data-export="exclude"><circle/></svg>'
    expect(stripExportExclusions(markup)).toBe(markup)
  })

  it('does not let a self-closing nested <g/> eat an enclosing tag\'s close', () => {
    // Regression: an empty editor overlay layer (e.g. `editor-vertex-placement-layer`
    // rendering with no picks) is a self-closing `<g id="..."/>` nested inside an
    // excluded wrapper. The old depth counter treated it as a real open with no
    // matching close, so it over-consumed one `</g>` belonging to the outer,
    // non-excluded `<g>` — truncating the exported SVG into invalid XML.
    const out = stripExportExclusions(
      '<svg><g><g data-export="exclude"><g><g id="a"/><g id="b"/></g></g><path/></g></svg>',
    )
    expect(out).toBe('<svg><g><path/></g></svg>')
  })
})

describe('boundsFromPointsAttr', () => {
  it('computes the bbox of a points attribute', () => {
    expect(boundsFromPointsAttr('10,20 50,80 30,5')).toEqual({ x: 10, y: 5, width: 40, height: 75 })
  })

  it('accepts space-only separated pairs', () => {
    expect(boundsFromPointsAttr('0 0 10 10 5 -5')).toEqual({ x: 0, y: -5, width: 10, height: 15 })
  })

  it('returns null for fewer than two coordinates', () => {
    expect(boundsFromPointsAttr('10')).toBeNull()
  })

  it('returns null for degenerate (zero-area) input', () => {
    expect(boundsFromPointsAttr('5,5 5,5')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(boundsFromPointsAttr('')).toBeNull()
  })
})

describe('padContentBounds', () => {
  it('pads symmetrically by a ratio of the larger dimension', () => {
    // larger dimension = 100 (width) → margin = 100 * 0.03 = 3
    const out = padContentBounds({ x: 0, y: 0, width: 100, height: 50 })
    expect(out).toEqual({ x: -3, y: -3, width: 106, height: 56 })
  })

  it('uses height when it is the larger dimension', () => {
    const out = padContentBounds({ x: 10, y: 10, width: 50, height: 200 })
    const margin = 200 * 0.03
    expect(out.x).toBeCloseTo(10 - margin)
    expect(out.y).toBeCloseTo(10 - margin)
    expect(out.width).toBeCloseTo(50 + margin * 2)
    expect(out.height).toBeCloseTo(200 + margin * 2)
  })
})

describe('insertBackgroundRect', () => {
  const svg = (attrs: string, body = '<g id="art"><path d="M0,0"/></g>') =>
    `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`

  it('covers the markup viewBox exactly, including a non-zero origin', () => {
    // Max-fill viewBoxes are content bounds, so their origin is rarely (0,0);
    // an x=0/y=0 rect would leave the artwork's own quadrant unpainted.
    const out = insertBackgroundRect(svg('viewBox="-120 -80 400 300"'), '#f5f0e8')
    expect(out).toContain('<rect x="-120" y="-80" width="400" height="300" fill="#f5f0e8"')
  })

  it('prefers the explicit viewBox argument over the markup attribute', () => {
    const out = insertBackgroundRect(svg('viewBox="0 0 10 10"'), '#fff', { x: 5, y: 6, width: 70, height: 80 })
    expect(out).toContain('x="5" y="6" width="70" height="80"')
    expect(out).not.toContain('width="10"')
  })

  it('is the FIRST child, so it sits behind every drawn element', () => {
    const out = insertBackgroundRect(svg('viewBox="0 0 10 10"'), '#000')
    expect(out.indexOf('<rect')).toBeLessThan(out.indexOf('<g id="art"'))
  })

  it('falls back to a 100% cover when there is no viewBox at all', () => {
    // Without a viewBox, user space IS the viewport — origin (0,0), 100%/100%.
    const out = insertBackgroundRect(svg('width="800" height="600"'), '#abc')
    expect(out).toContain('<rect x="0" y="0" width="100%" height="100%" fill="#abc"')
  })

  it('inserts nothing when the background is null, undefined or empty', () => {
    // This is the pre-2026-08-05 behaviour and what the Transparent-background
    // toggle must still reach — a transparent export has no underlay at all.
    const markup = svg('viewBox="0 0 10 10"')
    expect(insertBackgroundRect(markup, null)).toBe(markup)
    expect(insertBackgroundRect(markup, undefined)).toBe(markup)
    expect(insertBackgroundRect(markup, '')).toBe(markup)
  })

  it('leaves malformed markup untouched rather than corrupting it', () => {
    expect(insertBackgroundRect('not markup', '#fff')).toBe('not markup')
    expect(insertBackgroundRect('<svg viewBox="0 0 1 1"', '#fff')).toBe('<svg viewBox="0 0 1 1"')
  })

  it('ignores a malformed or degenerate viewBox and covers the viewport instead', () => {
    expect(insertBackgroundRect(svg('viewBox="0 0 nope 10"'), '#fff')).toContain('width="100%"')
    expect(insertBackgroundRect(svg('viewBox="0 0 0 10"'), '#fff')).toContain('width="100%"')
  })
})

// A canvas over the browser's budget does not throw — it silently drops every
// draw and the export saves a blank PNG. `fittedRasterSize` is the policy that
// keeps the request inside the published ceilings before that can happen; the
// runtime probe in `allocateRasterCanvas` handles engines whose real budget is
// lower still.
describe('fittedRasterSize', () => {
  it('leaves a size that already fits alone', () => {
    expect(fittedRasterSize(8192, 6851)).toEqual({ width: 8192, height: 6851 })
  })

  it('scales an over-area request down, aspect preserved', () => {
    // 8192 × 40960 = 335M px, past Chrome's 2^28 area cap — exactly the shape
    // a Max-fill export of a tall, narrow pattern asks for.
    const fitted = fittedRasterSize(8192, 40960)
    expect(fitted.width * fitted.height).toBeLessThanOrEqual(MAX_RASTER_AREA)
    expect(fitted.height / fitted.width).toBeCloseTo(5, 2)
  })

  it('caps a single over-long dimension even when the area fits', () => {
    const fitted = fittedRasterSize(100, 60000)
    expect(fitted.height).toBeLessThanOrEqual(MAX_RASTER_DIMENSION)
    // Flooring a 54 px width costs a little aspect precision; 2% is the bar.
    expect(Math.abs((fitted.height / fitted.width) / 600 - 1)).toBeLessThan(0.02)
  })

  it('halves the area on request — the retry step after a failed probe', () => {
    const fitted = fittedRasterSize(8192, 8192, { maxArea: (8192 * 8192) / 2 })
    expect(fitted.width).toBe(5792)
    expect(fitted.height).toBe(5792)
  })

  it('never returns a zero dimension', () => {
    expect(fittedRasterSize(0, 0)).toEqual({ width: 1, height: 1 })
    expect(fittedRasterSize(1, 1_000_000).width).toBeGreaterThanOrEqual(1)
  })
})
