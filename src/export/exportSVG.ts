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

/**
 * Remove every element (and its subtree) carrying `data-export="exclude"` from
 * serialized SVG markup. Non-artwork layers — Builder vertex/edge/section dots,
 * Frame pick-node dots, neighbour ghosts, Cell-Boundary guide outlines,
 * Decoration paint hit-targets — are tagged with that attribute in
 * `PatternSVG`; a raw DOM clone would otherwise bake them into the exported
 * file (worst in the Design phase, where the overlay dots are live).
 *
 * Pure string transform (no DOM) so it's testable in the node test env, like
 * `substituteCssVariables`. Every exclusion wrapper is a `<g>`, so this scans
 * for the marker, walks back to its enclosing tag, and removes that tag through
 * its balanced close — counting nested same-name tags so an inner `<g>` inside
 * an excluded group doesn't close it early.
 */
export function stripExportExclusions(markup: string): string {
  const MARKER = 'data-export="exclude"'
  let out = markup
  for (;;) {
    const attrIdx = out.indexOf(MARKER)
    if (attrIdx === -1) return out

    const tagStart = out.lastIndexOf('<', attrIdx)
    const openEnd = out.indexOf('>', attrIdx)
    // Malformed (marker not inside a well-formed opening tag) — bail rather
    // than loop forever.
    if (tagStart === -1 || openEnd === -1 || openEnd < attrIdx) return out

    // Parse the tag name so nesting is matched against the right element.
    const nameMatch = /^<\s*([a-zA-Z][\w:-]*)/.exec(out.slice(tagStart))
    if (!nameMatch) return out
    const tag = nameMatch[1]

    // Self-closing `<g ... />` — drop just the tag.
    if (out[openEnd - 1] === '/') {
      out = out.slice(0, tagStart) + out.slice(openEnd + 1)
      continue
    }

    const openTok = '<' + tag
    const closeTok = '</' + tag
    let depth = 1
    let i = openEnd + 1
    let cut = -1
    while (i < out.length && depth > 0) {
      const nextOpen = out.indexOf(openTok, i)
      const nextClose = out.indexOf(closeTok, i)
      if (nextClose === -1) return out // unbalanced — leave markup as-is
      const isTagBoundary = (idx: number, tok: string) => {
        const c = out[idx + tok.length]
        return c === ' ' || c === '>' || c === '/' || c === '\n' || c === '\t' || c === '\r'
      }
      if (nextOpen !== -1 && nextOpen < nextClose && isTagBoundary(nextOpen, openTok)) {
        depth++
        i = nextOpen + openTok.length
      } else {
        depth--
        i = nextClose + closeTok.length
        if (depth === 0) {
          const closeEnd = out.indexOf('>', i)
          cut = closeEnd === -1 ? out.length : closeEnd + 1
        }
      }
    }
    if (cut === -1) return out
    out = out.slice(0, tagStart) + out.slice(cut)
  }
}

export function exportSVG(svgEl: SVGSVGElement) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const w = svgEl.clientWidth || 1200
  const h = svgEl.clientHeight || 900
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const str = inlineCssVariables(stripExportExclusions(new XMLSerializer().serializeToString(clone)), svgEl)
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

/** Default raster fill — the app's sandy paper tone. A future Decoration
 *  background-colour option will replace this default. */
export const DEFAULT_PNG_BACKGROUND = '#f5f0e8'

export interface PngExportOptions {
  width?: number
  height?: number
  /** Fill colour behind the pattern; `null` exports on transparent alpha. */
  background?: string | null
}

/**
 * Rasterise a live `<svg>` onto a 2D canvas at the given size, with the same
 * overlay-stripping + CSS-var inlining the file exports use. Shared by
 * `exportPNG` (which downloads it) and the thumbnail renderer (which reads a
 * data URL back off it). Returns null if the SVG can't be loaded as an image.
 */
export async function rasterizeSvgToCanvas(
  svgEl: SVGSVGElement,
  { width = 2048, height = 2048, background = DEFAULT_PNG_BACKGROUND }: PngExportOptions = {},
): Promise<HTMLCanvasElement | null> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const str = inlineCssVariables(stripExportExclusions(new XMLSerializer().serializeToString(clone)), svgEl)
  const blob = new Blob([str], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  const img = new Image()
  img.width = width
  img.height = height
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
  URL.revokeObjectURL(url)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Skip the fill for a transparent export — a fresh canvas is already clear.
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

/** Rasterise a live `<svg>` to a PNG data URL (used for browser thumbnails). */
export async function rasterizeSvgToDataUrl(
  svgEl: SVGSVGElement,
  opts: PngExportOptions = {},
): Promise<string | null> {
  const canvas = await rasterizeSvgToCanvas(svgEl, opts)
  if (!canvas) return null
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export async function exportPNG(
  svgEl: SVGSVGElement,
  opts: PngExportOptions = {},
) {
  const canvas = await rasterizeSvgToCanvas(svgEl, opts)
  if (!canvas) return
  canvas.toBlob(b => {
    if (b) downloadBlob(b, 'islamic-pattern.png')
  }, 'image/png')
}
