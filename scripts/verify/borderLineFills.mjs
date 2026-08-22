/**
 * Per-line colours on the **Frame border** — headless checks against the
 * rendered DOM.
 *
 * Split from `strokeBandFills.mjs` (the Strand side) rather than merged,
 * because in the Decoration phase the border block and the Display section's
 * Strand controls carry identically labelled rows — "Colour the lines",
 * "Individual", "Line divisions". With the Strand ones already switched on
 * there is no index that reliably picks the border's, and the mis-pick reads
 * as the border feature being dead rather than as a bad selector.
 *
 * The border is a different renderer (`PatternSVG`'s `FrameBorder`, closed
 * polygons offset outward) resolving through the same `strandStyle` helpers,
 * which is exactly the shape of thing that can diverge silently.
 *
 * Optional argv[2] = a path to screenshot the canvas to.
 */
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/home/harry/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.click('button:has-text("Square-Octagon 4.8.8")')
await page.waitForTimeout(2200)
const go = async (name) => { const el = await page.$(`button:has-text("${name}")`); if (el) { await el.click(); await page.waitForTimeout(900) } }
await go('Design')
const add = await page.$('button:has-text("+ Shape Frame")')
if (add) { await add.scrollIntoViewIfNeeded(); await add.click(); await page.waitForTimeout(900) }
await go('Decoration')
const bt = await page.$('label:has-text("Frame border stroke") input[type=checkbox]')
if (bt) { await bt.scrollIntoViewIfNeeded(); if (!(await bt.isChecked())) { await bt.check(); await page.waitForTimeout(800) } }

const sliderBy = async (label) => page.evaluateHandle((l) => {
  for (const s of document.querySelectorAll('input.pattern-slider')) {
    if ((s.previousElementSibling?.textContent ?? '').includes(l)) return s
  }
  return null
}, label).then(h => h.asElement())
const setSlider = async (label, value) => {
  const el = await sliderBy(label); if (!el) { console.log('MISSING', label); return }
  await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(150)
  const box = await el.boundingBox()
  const min = Number(await el.getAttribute('min')), max = Number(await el.getAttribute('max'))
  const step = Number(await el.getAttribute('step')) || 1
  await page.mouse.click(box.x + 8 + (box.width - 16) * ((value - min) / (max - min)), box.y + box.height / 2)
  for (let i = 0; i < 300; i++) {
    const v = Number(await el.inputValue())
    if (Math.abs(v - value) < step / 2) break
    await page.keyboard.press(v < value ? 'ArrowRight' : 'ArrowLeft'); await page.waitForTimeout(15)
  }
  await page.waitForTimeout(400)
  console.log(`SET  ${label} → ${await el.inputValue()} (max ${max})`)
}
await setSlider('Border width', 90)
await setSlider('Line divisions', 4)

const lt = await page.$('label:has-text("Colour the lines") input[type=checkbox]')
if (!lt) { console.log('FAIL — no "Colour the lines" on the border') }
else { await lt.scrollIntoViewIfNeeded(); await lt.check(); await page.waitForTimeout(700) }

const state = () => page.evaluate(() => ({
  rings: [...document.querySelectorAll('polygon[data-band="line-ring"]')].map(p => ({
    w: Number(p.getAttribute('stroke-width')).toFixed(2), c: p.getAttribute('stroke'),
  })),
  individual: [...document.querySelectorAll('polygon[data-band="line-individual"]')].map(p => ({
    w: Number(p.getAttribute('stroke-width')).toFixed(2), c: p.getAttribute('stroke'),
  })),
}))
console.log('BORDER all      ', JSON.stringify(await state()))

const indiv = await page.$$('button:has-text("Individual")')
if (indiv.length) { await indiv[indiv.length - 1].scrollIntoViewIfNeeded(); await indiv[indiv.length - 1].click(); await page.waitForTimeout(800) }
const PAL = ['#ff0000', '#00cc00', '#0000ff', '#ffaa00']
// The 'Border colour' swatch sits AFTER the per-line rows, so the last four
// colour inputs are lines 2-4 plus that one. Take the window before it.
const sw = (await page.$$('input[type=color]')).slice(-5, -1)
for (let i = 0; i < sw.length; i++) { await sw[i].scrollIntoViewIfNeeded(); await sw[i].fill(PAL[i]); await page.waitForTimeout(250) }
await page.waitForTimeout(900)
const ind = await state()
console.log('BORDER individ  ', JSON.stringify(ind))
console.log('BORDER VERDICT  ', ind.individual.length === 4 && PAL.every(c => ind.individual.some(r => r.c === c))
  ? 'PASS — 4 individually-coloured line rings on the border'
  : `FAIL — ${JSON.stringify(ind.individual)}`)
console.log('ERRORS          ', errs.length ? errs.slice(0, 3) : 'none')
if (process.argv[2]) {
  const canvas = await page.$('svg[data-pattern-canvas]')
  await canvas.screenshot({ path: process.argv[2] })
}
await b.close()
