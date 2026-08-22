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

/** Ceilings a browser puts on a `<canvas>` backing store. Over either one the
 *  allocation does NOT throw: the canvas exists, every draw against it is
 *  silently dropped, and the export saves a perfectly blank PNG — which is the
 *  8192 px Max-fill symptom (Max-fill picks the height from the content's own
 *  aspect, so it is the biggest raster the menu can ask for). 32767 is the
 *  smallest max-dimension in the field; 2^28 px is Chrome's max area — Firefox
 *  caps area lower still, which the runtime probe below catches. */
export const MAX_RASTER_DIMENSION = 32767
export const MAX_RASTER_AREA = 268_435_456

/** Scale `width`×`height` down — aspect preserved — until it is inside both
 *  ceilings. Pure, so the policy is testable without a DOM. */
export function fittedRasterSize(
  width: number,
  height: number,
  { maxDimension = MAX_RASTER_DIMENSION, maxArea = MAX_RASTER_AREA }: { maxDimension?: number; maxArea?: number } = {},
): { width: number; height: number } {
  const w0 = Math.max(1, Math.floor(width))
  const h0 = Math.max(1, Math.floor(height))
  const scale = Math.min(1, maxDimension / w0, maxDimension / h0, Math.sqrt(maxArea / (w0 * h0)))
  if (!(scale < 1)) return { width: w0, height: h0 }
  return { width: Math.max(1, Math.floor(w0 * scale)), height: Math.max(1, Math.floor(h0 * scale)) }
}

/** Does this context actually paint? A canvas past the browser's budget still
 *  hands back a 2D context and accepts every call — so the only honest test is
 *  to write a pixel and read it back. */
function canvasPaints(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    ctx.clearRect(0, 0, 1, 1)
    return d[0] === 255 && d[3] === 255
  } catch {
    return false
  }
}

/**
 * Allocate the largest canvas at this aspect ratio that the browser will
 * really draw on, at most the requested size. The published limits are a
 * starting point, not the answer: they differ per engine and the real budget
 * also depends on how much memory the tab has left, so each candidate size is
 * probed and the area halved on failure rather than trusted.
 *
 * Returns the canvas WITH the size it settled on — a smaller PNG than asked
 * for is a far better export than a blank one at full size.
 */
function allocateRasterCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  let { width: w, height: h } = fittedRasterSize(width, height)
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (ctx && canvasPaints(ctx)) {
      if (w !== Math.floor(width) || h !== Math.floor(height)) {
        console.warn(`Export raster reduced from ${Math.floor(width)}×${Math.floor(height)} to ${w}×${h} — the browser would not paint a canvas that large.`)
      }
      return { canvas, ctx, width: w, height: h }
    }
    const next = fittedRasterSize(w, h, { maxArea: (w * h) / 2 })
    if (next.width === w && next.height === h) break
    w = next.width
    h = next.height
  }
  console.error('Export failed: no usable canvas at any size.')
  return null
}

/** Largest single SVG→bitmap decode this module will ask a browser for. One
 *  giant decode is the other way a big export comes back blank: the canvas is
 *  fine, `drawImage` is a no-op, and nothing is thrown — reported as an 8192 px
 *  Max-fill PNG that is "completely empty, one flat colour". Past this budget
 *  the export is rendered as a grid of tiles instead, each a small decode, at
 *  the FULL requested resolution. 4096² is the common GPU max-texture size. */
export const MAX_DECODE_PIXELS = 16_777_216

/**
 * How many tiles to split a `width`×`height` raster into so that no single
 * decode exceeds `maxPixels`. The longer side splits first, so tiles stay
 * roughly square rather than becoming a strip that spends the whole budget on
 * one dimension. Pure — the policy is testable without a DOM.
 */
export function rasterTileGrid(
  width: number,
  height: number,
  maxPixels: number = MAX_DECODE_PIXELS,
): { cols: number; rows: number } {
  let cols = 1
  let rows = 1
  // The bound is a guard against a pathological maxPixels, not a real ceiling.
  while (Math.ceil(width / cols) * Math.ceil(height / rows) > maxPixels && cols * rows < 4096) {
    if (width / cols >= height / rows) cols++
    else rows++
  }
  return { cols, rows }
}

/** Set/replace the sizing attributes on serialized markup's root `<svg>` open
 *  tag. Pure: the export markup is built once and then re-pointed per tile,
 *  since stripping exclusions and inlining CSS vars over a large pattern is far
 *  more expensive than the render itself. */
export function withRootSvgAttrs(
  markup: string,
  attrs: { width: number; height: number; viewBox?: ContentBounds; preserveAspectRatio?: string },
): string {
  const svgStart = markup.indexOf('<svg')
  if (svgStart === -1) return markup
  const openEnd = markup.indexOf('>', svgStart)
  if (openEnd === -1) return markup
  const selfClosing = markup[openEnd - 1] === '/'
  let openTag = markup.slice(svgStart, selfClosing ? openEnd - 1 : openEnd)
  openTag = openTag.replace(/\s(?:width|height|viewBox|preserveAspectRatio)\s*=\s*"[^"]*"/g, '')
  const vb = attrs.viewBox
  const parts = [
    openTag.trimEnd(),
    `width="${attrs.width}"`,
    `height="${attrs.height}"`,
    ...(vb ? [`viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}"`] : []),
    ...(attrs.preserveAspectRatio ? [`preserveAspectRatio="${attrs.preserveAspectRatio}"`] : []),
  ]
  return parts.join(' ') + (selfClosing ? '/' : '') + markup.slice(openEnd)
}

/** The live canvas's own viewBox, as content bounds. The tiled path needs a
 *  user-space frame to cut into tiles; a screen-view export doesn't carry one
 *  explicitly, but the live `<svg>` always has it. */
function liveViewBox(svgEl: SVGSVGElement): ContentBounds | null {
  const attr = svgEl.getAttribute('viewBox')
  if (!attr) return null
  const n = attr.trim().split(/[\s,]+/).map(Number)
  if (n.length < 4 || n.some(v => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null
  return { x: n[0], y: n[1], width: n[2], height: n[3] }
}

/** The export markup for this canvas — overlays stripped, CSS vars inlined —
 *  with its root sizing left to `withRootSvgAttrs`. */
function buildExportMarkup(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return inlineCssVariables(stripExportExclusions(new XMLSerializer().serializeToString(clone)), svgEl)
}

/** Decode SVG markup as an `<img>` at the given pixel size. Null when the
 *  browser refuses to load it — a very large SVG image has its own decode
 *  budget, separate from the canvas's. */
async function decodeSvgMarkup(markup: string, width: number, height: number): Promise<HTMLImageElement | null> {
  const blob = new Blob([markup], { type: 'image/svg+xml' })
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
    return img
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Overlap rendered around each tile and cropped off when it is drawn, so the
 *  antialiasing at a tile's own edge never lands in the output. */
const TILE_PAD_PX = 2

/**
 * Draw the pattern into `ctx` as a `cols`×`rows` grid of separate renders,
 * each a small decode. Every tile carries the FULL markup and differs only in
 * its viewBox window, so geometry crossing a tile edge is drawn in both and
 * the seam is invisible — nothing here clips, it only frames.
 *
 * False if any tile failed to decode; the caller then re-fills and falls back
 * to one whole-canvas render.
 */
async function drawSvgTiles(
  ctx: CanvasRenderingContext2D,
  markup: string,
  width: number,
  height: number,
  vb: ContentBounds,
  cols: number,
  rows: number,
): Promise<boolean> {
  const unitsPerPxX = vb.width / width
  const unitsPerPxY = vb.height / height
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round((c * width) / cols)
      const x1 = Math.round(((c + 1) * width) / cols)
      const y0 = Math.round((r * height) / rows)
      const y1 = Math.round(((r + 1) * height) / rows)
      const tw = x1 - x0
      const th = y1 - y0
      if (tw <= 0 || th <= 0) continue
      const tileVb: ContentBounds = {
        x: vb.x + (x0 - TILE_PAD_PX) * unitsPerPxX,
        y: vb.y + (y0 - TILE_PAD_PX) * unitsPerPxY,
        width: (tw + 2 * TILE_PAD_PX) * unitsPerPxX,
        height: (th + 2 * TILE_PAD_PX) * unitsPerPxY,
      }
      // `none`: the tile viewBox is derived from the tile's own pixel rect, so
      // it must fill it exactly — `meet` would letterbox each tile separately
      // and shift the content by a fraction of a pixel per tile.
      const tileMarkup = withRootSvgAttrs(markup, {
        width: tw + 2 * TILE_PAD_PX,
        height: th + 2 * TILE_PAD_PX,
        viewBox: tileVb,
        preserveAspectRatio: 'none',
      })
      const img = await decodeSvgMarkup(tileMarkup, tw + 2 * TILE_PAD_PX, th + 2 * TILE_PAD_PX)
      if (!img) return false
      ctx.drawImage(img, TILE_PAD_PX, TILE_PAD_PX, tw, th, x0, y0, tw, th)
    }
  }
  return true
}

/**
 * Rasterise a live `<svg>` onto a 2D canvas at the given size, with the same
 * overlay-stripping + CSS-var inlining the file exports use. Shared by
 * `exportPNG` (which downloads it) and the thumbnail renderer (which reads a
 * data URL back off it). Returns null if the SVG can't be rendered at all.
 *
 * Two ceilings stand between a request and a PNG, and crossing either one
 * fails silently rather than throwing: the canvas backing store
 * (`allocateRasterCanvas` probes it) and the single SVG→bitmap decode
 * (`rasterTileGrid` splits past it). Both were seen as an "empty" export.
 */
export async function rasterizeSvgToCanvas(
  svgEl: SVGSVGElement,
  { width = 2048, height = 2048, background = DEFAULT_PNG_BACKGROUND, viewBox }: PngExportOptions = {},
): Promise<HTMLCanvasElement | null> {
  const target = allocateRasterCanvas(width, height)
  if (!target) return null
  const { canvas, ctx } = target
  const markup = buildExportMarkup(svgEl)

  const paintBackground = () => {
    // Skip the fill for a transparent export — a fresh canvas is already clear.
    if (!background) return
    ctx.fillStyle = background
    ctx.fillRect(0, 0, target.width, target.height)
  }
  paintBackground()

  const vb = viewBox ?? liveViewBox(svgEl)
  const grid = vb ? rasterTileGrid(target.width, target.height) : { cols: 1, rows: 1 }
  // Tiles stretch to their own pixel rect, so they are only equivalent to the
  // whole render when the raster's aspect already matches the viewBox's — the
  // export menu derives the height that way, a thumbnail may not.
  const squareOn = vb ? Math.abs((vb.width / target.width) / (vb.height / target.height) - 1) < 0.01 : false
  if (vb && squareOn && grid.cols * grid.rows > 1) {
    if (await drawSvgTiles(ctx, markup, target.width, target.height, vb, grid.cols, grid.rows)) return canvas
    console.warn('Export: a tile failed to render; falling back to a single full-size decode.')
    paintBackground()
  }

  const whole = withRootSvgAttrs(markup, { width: target.width, height: target.height, viewBox: vb ?? undefined })
  let img = await decodeSvgMarkup(whole, target.width, target.height)
  if (!img) {
    // The decode has its own budget; half the size is worth one retry before
    // giving the user nothing.
    const half = fittedRasterSize(target.width, target.height, { maxArea: (target.width * target.height) / 4 })
    img = await decodeSvgMarkup(
      withRootSvgAttrs(markup, { width: half.width, height: half.height, viewBox: vb ?? undefined }),
      half.width,
      half.height,
    )
    if (!img) return null
  }
  ctx.drawImage(img, 0, 0, target.width, target.height)
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
