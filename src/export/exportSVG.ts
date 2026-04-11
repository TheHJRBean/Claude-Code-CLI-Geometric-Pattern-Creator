import type { Segment } from '../types/geometry'
import { buildStrands } from '../strand/buildStrands'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportSVG(svgEl: SVGSVGElement) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const w = svgEl.clientWidth || 1200
  const h = svgEl.clientHeight || 900
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const str = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, 'islamic-pattern.svg')
}

/** Export clean editable SVG — one <path> per strand with nodes at every vertex.
 *  No lacing, no thick strokes — just the raw geometry for Inkscape editing. */
export function exportUnwovenSVG(segments: Segment[], viewBox: string, width: number, height: number) {
  const strandData = buildStrands(segments)

  // Compute a stroke width ~0.1% of the viewBox diagonal so lines are visible but thin
  const vbParts = viewBox.split(/[\s,]+/).map(Number)
  const vbW = vbParts[2] || width
  const vbH = vbParts[3] || height
  const strokeWidth = Math.sqrt(vbW * vbW + vbH * vbH) * 0.001

  const pathEls = strandData.map((sd, i: number) => {
    const pts = sd.points
    const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    return `  <path id="strand-${i}" d="${d}" fill="none" stroke="#000000" stroke-width="${strokeWidth.toFixed(4)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join('\n')

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">
${pathEls}
</svg>
`

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, 'islamic-pattern-unwoven.svg')
}

export async function exportPNG(svgEl: SVGSVGElement, width = 2048, height = 2048) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const str = new XMLSerializer().serializeToString(clone)
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
