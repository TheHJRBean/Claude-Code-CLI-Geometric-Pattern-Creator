import type { Vec2 } from '../utils/math'
import { canonicalPose, poseBBox, type StampBBox } from '../decoration/stamps'
import { downloadBlob } from './download'

/**
 * Void **Stamp** asset I/O (Decoration Phase):
 *
 * - **Shape-canvas export** — a blank canvas sized to a Void's canonical
 *   pose, with the outline as a guide layer, so the user can design a stamp
 *   at exactly the right proportions in an external editor. The canvas is
 *   EXACTLY the canonical bounding box (no padding): a re-imported image
 *   cover-fits back onto that same box, so a design made on the exported
 *   canvas round-trips pixel-true.
 * - **Image import** — downscale + compress an uploaded image to a data URL
 *   small enough to live inside the saved config (localStorage library).
 */

/** Canonical pose + bbox for a Void outline, or null if degenerate. */
export function voidStampCanvas(outline: Vec2[]): { points: Vec2[]; box: StampBBox } | null {
  const pose = canonicalPose(outline)
  if (!pose) return null
  const box = poseBBox(pose.points)
  if (!box || box.width <= 0 || box.height <= 0) return null
  return { points: pose.points, box }
}

/** Standalone SVG document: transparent canvas = the canonical bbox, with
 * the Void outline stroked as a guide layer. Pure string builder. */
export function voidShapeSVGDocument(points: Vec2[], box: StampBBox): string {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round3(p.x)},${round3(p.y)}`).join('') + 'Z'
  const guideW = Math.max(box.width, box.height) / 200
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round3(box.x)} ${round3(box.y)} ${round3(box.width)} ${round3(box.height)}" width="${round3(box.width)}" height="${round3(box.height)}">`,
    `  <!-- Guide layer: the Void outline. Design inside it; the canvas edge is the exact cover-fit box. Delete or hide this layer before export if unwanted (the stamp is clipped to the shape either way). -->`,
    `  <path d="${d}" fill="none" stroke="#888888" stroke-width="${round3(guideW)}" stroke-dasharray="${round3(guideW * 4)} ${round3(guideW * 3)}" opacity="0.8"/>`,
    `</svg>`,
  ].join('\n')
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

export function downloadVoidShapeSVG(outline: Vec2[], filename: string): boolean {
  const c = voidStampCanvas(outline)
  if (!c) return false
  const svg = voidShapeSVGDocument(c.points, c.box)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename)
  return true
}

/** Transparent PNG canvas (long side `maxDim` px) with the guide outline. */
export function downloadVoidShapePNG(outline: Vec2[], filename: string, maxDim = 1024): boolean {
  const c = voidStampCanvas(outline)
  if (!c) return false
  const { box, points } = c
  const scale = maxDim / Math.max(box.width, box.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(box.width * scale))
  canvas.height = Math.max(1, Math.round(box.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.strokeStyle = 'rgba(136,136,136,0.8)'
  ctx.lineWidth = Math.max(1, maxDim / 300)
  ctx.setLineDash([ctx.lineWidth * 4, ctx.lineWidth * 3])
  ctx.beginPath()
  for (let i = 0; i < points.length; i++) {
    const x = (points[i].x - box.x) * scale
    const y = (points[i].y - box.y) * scale
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()
  canvas.toBlob(blob => {
    if (blob) downloadBlob(blob, filename)
  }, 'image/png')
  return true
}

/** Named polygon labels matching the Composition-Phase tile-type scheme. */
const REGULAR_NAME: Record<number, string> = {
  3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon',
  7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 11: 'hendecagon', 12: 'dodecagon',
}

/** True when the polygon is (within tolerance) a regular n-gon. */
function isApproxRegular(points: Vec2[]): boolean {
  const n = points.length
  if (n < 3) return false
  const lens: number[] = []
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n]
    lens.push(Math.hypot(b.x - a.x, b.y - a.y))
  }
  const mean = lens.reduce((s, l) => s + l, 0) / n
  if (mean <= 0) return false
  if (lens.some(l => Math.abs(l - mean) > mean * 0.02)) return false
  const expected = Math.PI * (n - 2) / n
  for (let i = 0; i < n; i++) {
    const p = points[(i + n - 1) % n], q = points[i], r = points[(i + 1) % n]
    const v1x = p.x - q.x, v1y = p.y - q.y, v2x = r.x - q.x, v2y = r.y - q.y
    const denom = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)
    if (denom <= 0) return false
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / denom)))
    if (Math.abs(ang - expected) > 0.02) return false
  }
  return true
}

export interface NamedVoidShape {
  signature: string
  outline: Vec2[]
  /** Composition-style shape name, numbered when several distinct shapes
   * share it: "triangle-1", "triangle-2", "6-gon", "hexagon". */
  name: string
}

/**
 * Dedupe Voids to one entry per congruent signature (first-seen order) and
 * assign each a human shape name: regular shapes get the Composition-Phase
 * label ("triangle", "hexagon"…), anything else "<n>-gon"; distinct shapes
 * sharing a base name are numbered.
 */
export function nameVoidShapes(
  voids: ReadonlyArray<{ signature: string; polygon: Vec2[]; keyPolygon?: Vec2[] }>,
): NamedVoidShape[] {
  const bySig = new Map<string, Vec2[]>()
  for (const v of voids) {
    if (!bySig.has(v.signature)) bySig.set(v.signature, v.keyPolygon ?? v.polygon)
  }
  const entries: { signature: string; outline: Vec2[]; base: string }[] = []
  for (const [signature, outline] of bySig) {
    const c = voidStampCanvas(outline)
    if (!c) continue
    const n = c.points.length
    const base = isApproxRegular(c.points) ? (REGULAR_NAME[n] ?? `${n}-gon`) : `${n}-gon`
    entries.push({ signature, outline, base })
  }
  const totals = new Map<string, number>()
  for (const e of entries) totals.set(e.base, (totals.get(e.base) ?? 0) + 1)
  const seen = new Map<string, number>()
  return entries.map(e => {
    const idx = (seen.get(e.base) ?? 0) + 1
    seen.set(e.base, idx)
    const name = (totals.get(e.base) ?? 1) > 1 ? `${e.base}-${idx}` : e.base
    return { signature: e.signature, outline: e.outline, name }
  })
}

/**
 * Download one shape canvas per distinct Void shape, named by shape
 * ("triangle-1-canvas.svg", "6-gon-canvas.png"…). Downloads are staggered so
 * the browser doesn't drop them as a burst. Resolves to the file count.
 */
export async function downloadAllVoidShapeCanvases(
  voids: ReadonlyArray<{ signature: string; polygon: Vec2[]; keyPolygon?: Vec2[] }>,
  format: 'svg' | 'png',
): Promise<number> {
  const named = nameVoidShapes(voids)
  let count = 0
  for (const s of named) {
    const ok = format === 'svg'
      ? downloadVoidShapeSVG(s.outline, `${s.name}-canvas.svg`)
      : downloadVoidShapePNG(s.outline, `${s.name}-canvas.png`)
    if (ok) {
      count++
      await new Promise(r => setTimeout(r, 300))
    }
  }
  return count
}

export interface StampImageImport {
  /** Compressed data URL. */
  image: string
  /** Pixel size of the (possibly downscaled) encoded image. */
  width: number
  height: number
}

/**
 * Load an uploaded image file, downscale its long side to `maxDim` px and
 * re-encode as a compact data URL (WebP where the browser supports encoding
 * it, PNG otherwise) so the stamp can live inside the saved config without
 * blowing the localStorage quota.
 */
export function importStampImage(file: File, maxDim = 1024): Promise<StampImageImport> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas 2d context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      // WebP keeps photos ~5-10× smaller than PNG; browsers that can't
      // encode it silently return a PNG data URL from the same call.
      const image = canvas.toDataURL('image/webp', 0.85)
      resolve({ image, width: w, height: h })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`could not load image "${file.name}"`))
    }
    img.src = url
  })
}
