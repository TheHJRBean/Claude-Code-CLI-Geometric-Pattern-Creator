import type { Segment } from '../types/geometry'
import { buildStrands } from '../strand/buildStrands'
import { downloadBlob } from './download'

/**
 * Resolve `var(--x)` references in serialized SVG markup against the live
 * element's computed style. CSS custom properties live in the document
 * stylesheet, not inline, so a cloned standalone SVG (and the isolated render
 * the PNG path rasterizes) loses them — e.g. the Frame outline's
 * `stroke="var(--accent)"` would export with no colour. Reading the resolved
 * value from `sourceEl` (which is in the DOM, so the cascade applies) keeps
 * those colours in the exported file.
 */
/** Pure var() substitution: replace each `var(--name[, fallback])` in `markup`
 * using `resolve(name)` → resolved value, falling back to the inline fallback
 * (or `none`) when unresolved. Split out from `inlineCssVariables` so it's
 * testable without a DOM. */
export function substituteCssVariables(markup: string, resolve: (name: string) => string): string {
  // A regex can't delimit the fallback: `var(--x, rgba(1,2,3,.5))` needs the
  // var()'s OWN closing paren, not the first one, or the fallback truncates
  // and a stray `)` corrupts the paint. Scan with a paren depth counter.
  let out = ''
  let i = 0
  for (;;) {
    const start = markup.indexOf('var(', i)
    if (start === -1) {
      out += markup.slice(i)
      return out
    }
    out += markup.slice(i, start)
    let depth = 1
    let j = start + 4
    while (j < markup.length && depth > 0) {
      const ch = markup[j]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      j++
    }
    if (depth > 0) {
      // Unbalanced — not a well-formed var(); emit the rest verbatim.
      out += markup.slice(start)
      return out
    }
    const inner = markup.slice(start + 4, j - 1)
    // First top-level comma splits name from fallback (the fallback may
    // itself hold commas inside rgba()/var()).
    let comma = -1
    let d = 0
    for (let k = 0; k < inner.length; k++) {
      const ch = inner[k]
      if (ch === '(') d++
      else if (ch === ')') d--
      else if (ch === ',' && d === 0) { comma = k; break }
    }
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim()
    const fallback = comma === -1 ? '' : inner.slice(comma + 1).trim()
    if (!name.startsWith('--')) {
      // Not a custom-property reference — leave untouched.
      out += markup.slice(start, j)
    } else {
      const value = resolve(name).trim()
      // Fallbacks may nest their own var() — substitute recursively.
      out += value || (fallback ? substituteCssVariables(fallback, resolve) : 'none')
    }
    i = j
  }
}

function inlineCssVariables(markup: string, sourceEl: Element): string {
  const computed = getComputedStyle(sourceEl)
  return substituteCssVariables(markup, name => computed.getPropertyValue(name))
}

export function exportSVG(svgEl: SVGSVGElement) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const w = svgEl.clientWidth || 1200
  const h = svgEl.clientHeight || 900
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const str = inlineCssVariables(new XMLSerializer().serializeToString(clone), svgEl)
  const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, 'islamic-pattern.svg')
}

/**
 * Build the clean editable "unwoven" SVG markup — one `<path>` per Strand with
 * nodes at every vertex, thin strokes for Inkscape editing. Pure (no DOM); the
 * download wrapper is `exportUnwovenSVG`. The stroke width is ~0.1% of the
 * viewBox diagonal so lines stay visible but thin at any scale.
 */
export function unwovenSvgMarkup(segments: Segment[], viewBox: string, width: number, height: number): string {
  const strandData = buildStrands(segments)

  const vbParts = viewBox.split(/[\s,]+/).map(Number)
  const vbW = vbParts[2] || width
  const vbH = vbParts[3] || height
  const strokeWidth = Math.sqrt(vbW * vbW + vbH * vbH) * 0.001

  const pathEls = strandData.map((sd, i: number) => {
    const pts = sd.points
    const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    return `  <path id="strand-${i}" d="${d}" fill="none" stroke="#000000" stroke-width="${strokeWidth.toFixed(4)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">
${pathEls}
</svg>
`
}

/** Export clean editable SVG — one <path> per Strand with nodes at every vertex.
 *  Thin strokes for Inkscape editing. */
export function exportUnwovenSVG(segments: Segment[], viewBox: string, width: number, height: number) {
  const blob = new Blob([unwovenSvgMarkup(segments, viewBox, width, height)], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, 'islamic-pattern-unwoven.svg')
}

export async function exportPNG(svgEl: SVGSVGElement, width = 2048, height = 2048) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const str = inlineCssVariables(new XMLSerializer().serializeToString(clone), svgEl)
  const blob = new Blob([str], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  const img = new Image()
  img.width = width
  img.height = height
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = url
  })
  URL.revokeObjectURL(url)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f5f0e8'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0)

  canvas.toBlob(b => {
    if (b) downloadBlob(b, 'islamic-pattern.png')
  }, 'image/png')
}
