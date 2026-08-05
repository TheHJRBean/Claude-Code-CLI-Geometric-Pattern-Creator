import type { Segment } from '../types/geometry'
import { buildStrands } from '../strand/buildStrands'
import { downloadBlob } from './download'
import { exportFileName } from './fileName'
import { DEFAULT_CANVAS_BACKGROUND } from '../state/defaults'

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
        // A self-closing nested `<tag .../>` (e.g. an empty overlay layer)
        // has no matching close of its own — counting it toward depth eats
        // one of the ENCLOSING tag's real closes instead, truncating the
        // output past the excluded subtree's own boundary.
        const nestedOpenEnd = out.indexOf('>', nextOpen)
        if (nestedOpenEnd !== -1 && out[nestedOpenEnd - 1] === '/') {
          i = nestedOpenEnd + 1
        } else {
          depth++
          i = nextOpen + openTok.length
        }
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

/** An axis-aligned world-space bounding box, as read off rendered SVG content. */
export interface ContentBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Fraction of the larger content dimension added as breathing room around a
 *  Max-fill export, so the artwork isn't cropped razor-tight to its edges. */
const MAX_FILL_MARGIN_RATIO = 0.03

/** Parse an SVG `points="x,y x,y ..."` attribute into its bounding box. Pure
 *  string parsing — no DOM — so it's testable like the rest of this module's
 *  markup helpers. Null for fewer than one coordinate pair. */
export function boundsFromPointsAttr(points: string): ContentBounds | null {
  const nums = points.trim().split(/[\s,]+/).map(Number).filter(n => !Number.isNaN(n))
  if (nums.length < 2) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i]
    const y = nums[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (maxX <= minX || maxY <= minY) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Pad a content bbox by {@link MAX_FILL_MARGIN_RATIO} of its larger
 *  dimension, symmetrically on every side. Pure — split out so the margin
 *  policy is independently testable. */
export function padContentBounds(bounds: ContentBounds): ContentBounds {
  const margin = Math.max(bounds.width, bounds.height) * MAX_FILL_MARGIN_RATIO
  return { x: bounds.x - margin, y: bounds.y - margin, width: bounds.width + margin * 2, height: bounds.height + margin * 2 }
}

/**
 * Measure the world-space bounding box of a live pattern `<svg>`'s exportable
 * content — the basis for the Max-fill export viewBox. Two paths:
 *
 * - **Frame clipping active**: the exported/visible content is exactly the
 *   Frame outline, so read its bbox straight off the clip polygon's `points`
 *   attribute (cheap string parse, no rendering-tree requirement).
 * - **Otherwise**: measure the actual rendered content via `getBBox()` on a
 *   detached clone with the same overlay stripping the file exports use
 *   (`stripExportExclusions`) — authoring scaffolding (ghost polygons,
 *   Cell-Boundary guides, Frame pick nodes) must not inflate the bbox. The
 *   clone is attached off-screen because `getBBox()` requires the element to
 *   be part of the render tree in some browsers.
 *
 * Returns null if content bounds can't be determined (empty pattern).
 */
export function measureExportContentBounds(svgEl: SVGSVGElement): ContentBounds | null {
  const clipPolygon = svgEl.querySelector('#pattern-frame-clip polygon')
  const clipPoints = clipPolygon?.getAttribute('points')
  if (clipPoints) {
    const bounds = boundsFromPointsAttr(clipPoints)
    if (bounds) return bounds
  }

  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const markup = stripExportExclusions(new XMLSerializer().serializeToString(clone))
  const container = document.createElement('div')
  container.setAttribute('style', 'position:fixed; left:-99999px; top:-99999px;')
  container.innerHTML = markup
  document.body.appendChild(container)
  try {
    const el = container.querySelector('svg')
    if (!el) return null
    const bbox = (el as SVGSVGElement).getBBox()
    if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) return null
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }
  } catch {
    return null
  } finally {
    document.body.removeChild(container)
  }
}

/** Parse a `viewBox="x y w h"` attribute out of a serialized root `<svg>` open
 *  tag. Null when absent or malformed — the caller then falls back to a
 *  viewport-relative cover. */
function viewBoxFromOpenTag(openTag: string): ContentBounds | null {
  const m = /viewBox\s*=\s*"([^"]*)"/.exec(openTag)
  if (!m) return null
  const n = m[1].trim().split(/[\s,]+/).map(Number)
  if (n.length < 4 || n.some(v => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null
  return { x: n[0], y: n[1], width: n[2], height: n[3] }
}

/**
 * Insert an opaque background `<rect>` as the exported SVG's first drawn
 * element.
 *
 * The live canvas carries its backdrop as a CSS `background` on the root
 * `<svg>` and a clone keeps that — but a CSS background is *presentation, not
 * content*: browsers honour it, Illustrator and Inkscape generally don't. Once
 * the backdrop became user-editable (the Decoration panel's Canvas background
 * control, `b8a733c`) an SVG export was silently dropping a deliberate choice
 * while the PNG path — which flattens onto the same colour — kept it. A real
 * `<rect>` is the only form every consumer reads.
 *
 * Pure string transform (no DOM), like the rest of this module's markup
 * helpers. Geometry comes from the export's **own** viewBox so the rect covers
 * exactly what is exported, including a Max-fill viewBox whose origin is not
 * (0,0). With no viewBox at all, user space *is* the viewport, so a 100% cover
 * from the origin is correct.
 */
export function insertBackgroundRect(
  markup: string,
  background: string | null | undefined,
  viewBox?: ContentBounds,
): string {
  if (!background) return markup
  const svgStart = markup.indexOf('<svg')
  if (svgStart === -1) return markup
  const openEnd = markup.indexOf('>', svgStart)
  if (openEnd === -1) return markup
  const vb = viewBox ?? viewBoxFromOpenTag(markup.slice(svgStart, openEnd))
  const geom = vb
    ? `x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}"`
    : 'x="0" y="0" width="100%" height="100%"'
  const rect = `<rect ${geom} fill="${background}" data-export-background="true"/>`
  return markup.slice(0, openEnd + 1) + rect + markup.slice(openEnd + 1)
}

/** `name` = the saved entry this pattern came from, when there is one; the
 *  download is named after it (see `exportFileName`). `background` paints an
 *  underlay rect (see `insertBackgroundRect`); null/undefined exports on
 *  transparency, which is what every export did before 2026-08-05. */
export function exportSVG(
  svgEl: SVGSVGElement,
  opts: { viewBox?: ContentBounds; name?: string | null; background?: string | null } = {},
) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const vb = opts.viewBox
  const w = svgEl.clientWidth || 1200
  const h = vb ? Math.max(1, Math.round(w * (vb.height / vb.width))) : (svgEl.clientHeight || 900)
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  if (vb) clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`)
  // Inserted last, so the rect is not itself subject to exclusion-stripping or
  // var() substitution — its fill is already a literal colour.
  const str = insertBackgroundRect(
    inlineCssVariables(stripExportExclusions(new XMLSerializer().serializeToString(clone)), svgEl),
    opts.background,
    vb,
  )
  const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, exportFileName(opts.name, 'svg'))
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
 *  Thin strokes for Inkscape editing.
 *
 *  ARCHIVED (ADR-0006 Q8b, convergence flip): no longer wired to any export
 *  menu. It rebuilt from the in-memory segments, which are a single fundamental
 *  domain under the Lever A fast-path, so it emitted one unit cell rather than
 *  the full field. Kept (with `unwovenSvgMarkup` + its test) so it can return
 *  Lab-wide via the export epic's full-field re-derivation. */
export function exportUnwovenSVG(segments: Segment[], viewBox: string, width: number, height: number, name?: string | null) {
  const blob = new Blob([unwovenSvgMarkup(segments, viewBox, width, height)], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, exportFileName(name ? `${name}-unwoven` : 'islamic-pattern-unwoven', 'svg'))
}

/** Fallback raster fill for callers with no config to hand (the thumbnail
 *  renderer's default). Live exports pass `config.strand.background`, which the
 *  Decoration panel's background control now edits. */
export const DEFAULT_PNG_BACKGROUND = DEFAULT_CANVAS_BACKGROUND

export interface PngExportOptions {
  width?: number
  height?: number
  /** Fill colour behind the pattern; `null` exports on transparent alpha. */
  background?: string | null
  /** Max-fill: override the rasterised viewBox instead of the live on-screen
   *  one, so `width`/`height` frame the given content bounds exactly. */
  viewBox?: ContentBounds
  /** Saved-entry name to name the download after (`exportPNG` only — the
   *  thumbnail/rasterise paths never hit the filesystem). */
  name?: string | null
}

/**
 * Rasterise a live `<svg>` onto a 2D canvas at the given size, with the same
 * overlay-stripping + CSS-var inlining the file exports use. Shared by
 * `exportPNG` (which downloads it) and the thumbnail renderer (which reads a
 * data URL back off it). Returns null if the SVG can't be loaded as an image.
 */
export async function rasterizeSvgToCanvas(
  svgEl: SVGSVGElement,
  { width = 2048, height = 2048, background = DEFAULT_PNG_BACKGROUND, viewBox }: PngExportOptions = {},
): Promise<HTMLCanvasElement | null> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  if (viewBox) clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`)
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
    if (b) downloadBlob(b, exportFileName(opts.name, 'png'))
  }, 'image/png')
}
