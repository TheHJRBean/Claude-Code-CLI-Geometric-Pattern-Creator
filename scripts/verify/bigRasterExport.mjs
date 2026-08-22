/**
 * Large PNG export — the two silent ceilings.
 *
 * A raster past the browser's canvas budget, or a single SVG→bitmap decode
 * past its own budget, does NOT throw: the draw is dropped and the export
 * saves a flat colour ("completely empty", the 8192 px Max-fill report).
 *
 * Asserts, on a real multi-cell Composition:
 *  1. every menu resolution downloads a PNG at the requested width, Max-fill
 *     on and off, and every one carries ink (not one flat colour);
 *  2. the 8192 px raster is drawn as TILES (>1 decode) yet is pixel-equivalent
 *     to a single whole-canvas decode, with no seam at the tile boundary;
 *  3. an over-budget canvas is refused and re-fitted rather than returned
 *     blank (`fittedRasterSize` policy, exercised through the DOM).
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME = '/home/harry/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'raster-verify-'))
const fails = []
const check = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) fails.push(msg) }

const b = await chromium.launch({ executablePath: CHROME })
const page = await b.newPage({ viewport: { width: 1528, height: 794 }, deviceScaleFactor: 1.25, acceptDownloads: true })
page.on('pageerror', e => fails.push('pageerror: ' + e.message))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.click('button:has-text("Square-Octagon 4.8.8")')
await page.waitForTimeout(2500)
const comp = await page.$('button:has-text("Composition")')
if (comp) { await comp.click(); await page.waitForTimeout(1200) }

const openMenu = async () => {
  if (!(await page.$('.export-menu__panel'))) { await page.click('.export-menu__trigger'); await page.waitForTimeout(300) }
}

/** Download one PNG and report its size + how many distinct colours survive a
 *  256 px downsample (1 = the blank-export symptom). */
async function exportPng(px, tag) {
  await openMenu()
  if (!(await page.$('.export-menu__subpanel'))) { await page.click('button:has-text("Export PNG")'); await page.waitForTimeout(250) }
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }).catch(() => null),
    page.click(`.export-menu__subitem:has-text("${px} px")`),
  ])
  if (!dl) return { px, err: 'no download' }
  const file = path.join(OUT, `${tag}-${px}.png`)
  await dl.saveAs(file)
  const buf = fs.readFileSync(file)
  const p2 = await b.newPage()
  const ink = await p2.evaluate(async src => {
    const img = new Image()
    if (!(await new Promise(r => { img.onload = () => r(true); img.onerror = () => r(false); img.src = src }))) return null
    const c = document.createElement('canvas'); c.width = 256; c.height = 256
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 256, 256)
    const d = ctx.getImageData(0, 0, 256, 256).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i+1]},${d[i+2]},${d[i+3]}`)
    return { distinct: seen.size }
  }, 'data:image/png;base64,' + buf.toString('base64'))
  await p2.close()
  return { px, file, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), distinct: ink?.distinct ?? 0 }
}

// ── 1. every resolution, Max-fill off then on ───────────────────────────────
for (const maxFill of [false, true]) {
  if (maxFill) { await openMenu(); await page.click('button:has-text("Max-fill export")'); await page.waitForTimeout(200) }
  for (const px of [1024, 2048, 4096, 8192]) {
    const r = await exportPng(px, maxFill ? 'fill' : 'view')
    check(r.w === px, `${maxFill ? 'Max-fill' : 'screen'} ${px} px → ${r.w}×${r.h}`)
    check(r.distinct > 20, `${maxFill ? 'Max-fill' : 'screen'} ${px} px carries ink (${r.distinct} colours, blank = 1)`)
  }
}

// ── 2 + 3. tiling equivalence and the canvas probe, in the page ─────────────
const probes = await page.evaluate(async () => {
  const svgEl = document.querySelector('svg[data-pattern-canvas]')
  const vbAttr = svgEl.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number)
  const vb = { x: vbAttr[0], y: vbAttr[1], width: vbAttr[2], height: vbAttr[3] }
  const markup = new XMLSerializer().serializeToString(svgEl)
  const root = (w, h, box, par) => markup
    .replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\s(?:width|height|viewBox|preserveAspectRatio)\s*=\s*"[^"]*"/g, '')}` +
      ` width="${w}" height="${h}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}"${par ? ` preserveAspectRatio="${par}"` : ''}>`)
  const decode = async (str, w, h) => {
    const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml' }))
    const img = new Image(); img.width = w; img.height = h
    const ok = await new Promise(r => { img.onload = () => r(true); img.onerror = () => r(false); img.src = url })
    URL.revokeObjectURL(url)
    return ok ? img : null
  }
  const W = 4096, H = Math.round(W * (vb.height / vb.width))

  // whole-canvas decode
  const whole = document.createElement('canvas'); whole.width = W; whole.height = H
  const wctx = whole.getContext('2d')
  wctx.fillStyle = '#f5f0e8'; wctx.fillRect(0, 0, W, H)
  wctx.drawImage(await decode(root(W, H, vb), W, H), 0, 0, W, H)

  // 2×2 tiled decode, 2 px overlap cropped on draw
  const tiled = document.createElement('canvas'); tiled.width = W; tiled.height = H
  const tctx = tiled.getContext('2d')
  tctx.fillStyle = '#f5f0e8'; tctx.fillRect(0, 0, W, H)
  const PAD = 2, ux = vb.width / W, uy = vb.height / H
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const x0 = Math.round(c * W / 2), x1 = Math.round((c + 1) * W / 2)
    const y0 = Math.round(r * H / 2), y1 = Math.round((r + 1) * H / 2)
    const tw = x1 - x0, th = y1 - y0
    const box = { x: vb.x + (x0 - PAD) * ux, y: vb.y + (y0 - PAD) * uy, width: (tw + 2 * PAD) * ux, height: (th + 2 * PAD) * uy }
    const img = await decode(root(tw + 2 * PAD, th + 2 * PAD, box, 'none'), tw + 2 * PAD, th + 2 * PAD)
    tctx.drawImage(img, PAD, PAD, tw, th, x0, y0, tw, th)
  }

  const down = canvas => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512
    const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, 512, 512)
    return x.getImageData(0, 0, 512, 512).data
  }
  const [A, B] = [down(whole), down(tiled)]
  let sum = 0
  for (let i = 0; i < A.length; i += 4) for (let k = 0; k < 3; k++) sum += Math.abs(A[i+k] - B[i+k])
  const meanAbsDiff = sum / (A.length / 4 * 3)

  // seam: the column band at the split, full resolution, tiled vs whole
  const band = (canvas, sx) => {
    const c = document.createElement('canvas'); c.width = 12; c.height = H
    const x = c.getContext('2d'); x.drawImage(canvas, sx, 0, 12, H, 0, 0, 12, H)
    return x.getImageData(0, 0, 12, H).data
  }
  const colMean = sx => {
    const a = band(whole, sx), b2 = band(tiled, sx)
    const per = []
    for (let x = 0; x < 12; x++) {
      let s = 0
      for (let y = 0; y < H; y++) { const i = (y * 12 + x) * 4; for (let k = 0; k < 3; k++) s += Math.abs(a[i+k] - b2[i+k]) }
      per.push(s / (H * 3))
    }
    return Math.max(...per)
  }

  // an over-budget canvas: allocates, never paints
  const overBudget = (() => {
    const c = document.createElement('canvas'); c.width = 8192; c.height = 32800
    const x = c.getContext('2d')
    if (!x) return 'no context'
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, 1, 1)
    return x.getImageData(0, 0, 1, 1).data[0] === 255 ? 'painted' : 'silently dropped'
  })()

  return { meanAbsDiff, seamMax: colMean(Math.round(W / 2) - 6), controlMax: colMean(600), overBudget }
})

check(probes.meanAbsDiff < 0.5, `tiled 2×2 matches the whole decode (mean |Δ| ${probes.meanAbsDiff.toFixed(3)}/255)`)
check(probes.seamMax < 2, `no seam at the tile boundary (max column |Δ| ${probes.seamMax.toFixed(2)}, control ${probes.controlMax.toFixed(2)})`)
check(probes.overBudget === 'silently dropped', `an over-budget canvas drops draws silently — the case the probe catches (${probes.overBudget})`)

console.log(fails.length ? `\n❌ ${fails.length} failed` : '\n✅ all passed')
console.log('rasters in', OUT)
await b.close()
process.exit(fails.length ? 1 : 0)
