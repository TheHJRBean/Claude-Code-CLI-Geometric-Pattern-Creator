/**
 * Line divisions + line/gap ratio — headless check against the rendered DOM.
 *
 * Loads the 4.8.8 preset, switches to Composition, and drives the two new
 * Strand controls, asserting on the **strand mask** the renderer emits: an
 * n-line stroke carves n−1 gaps out of it, so the mask carries n−1 alternating
 * cut/restore bands (see `strandStyleAttrs`). Reads the SVG, never
 * localStorage, which the Lab writes on a debounce.
 */
import { chromium } from 'playwright-core'

const CHROME = '/home/harry/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const b = await chromium.launch({ executablePath: CHROME })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

await page.click('button:has-text("Square-Octagon 4.8.8")')
await page.waitForTimeout(2200)
const comp = await page.$('button:has-text("Composition")')
if (comp) { await comp.click(); await page.waitForTimeout(900) }

/** The mask the `'lines'` style renders through: band strokes, widest first. */
const maskBands = () => page.evaluate(() => {
  const m = document.querySelector('#strand-style-mask')
  if (!m) return null
  // One <path> per band per visible strand piece; the distinct stroke widths
  // ARE the bands (every piece repeats the same set).
  const widths = [...m.querySelectorAll('path')].map(p => ({
    w: Number(p.getAttribute('stroke-width')).toFixed(3),
    colour: p.getAttribute('stroke'),
  }))
  const seen = new Map()
  for (const x of widths) if (!seen.has(x.w)) seen.set(x.w, x.colour)
  return [...seen].map(([w, colour]) => ({ w: Number(w), colour }))
})

/** A slider by its FieldLabel text. */
const sliderBy = async label => page.evaluateHandle(l => {
  for (const s of document.querySelectorAll('input.pattern-slider')) {
    if ((s.previousElementSibling?.textContent ?? '').includes(l)) return s
  }
  return null
}, label).then(h => h.asElement())

const setSlider = async (label, value) => {
  const el = await sliderBy(label)
  if (!el) return false
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  const box = await el.boundingBox()
  const min = Number(await el.getAttribute('min'))
  const max = Number(await el.getAttribute('max'))
  const step = Number(await el.getAttribute('step')) || 1
  // Click lands the thumb roughly, THEN arrow-key to the exact value: a click
  // at frac 0 or 1 falls on the thumb's own half-width and stops short, which
  // silently pins the extremes of the track out of reach.
  const frac = Math.min(1, Math.max(0, (value - min) / (max - min)))
  await page.mouse.click(box.x + 8 + (box.width - 16) * frac, box.y + box.height / 2)
  await page.waitForTimeout(250)
  for (let i = 0; i < 60; i++) {
    const v = Number(await el.inputValue())
    if (Math.abs(v - value) < step / 2) break
    await page.keyboard.press(v < value ? 'ArrowRight' : 'ArrowLeft')
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(700)
  return true
}

const readout = async label => page.evaluate(l => {
  for (const s of document.querySelectorAll('input.pattern-slider')) {
    const row = s.previousElementSibling
    if ((row?.textContent ?? '').includes(l)) return row.textContent.trim()
  }
  return 'absent'
}, label)

console.log('SOLID mask      ', JSON.stringify(await maskBands()))
console.log('DIVISIONS label ', await readout('Line divisions'))

for (const n of [2, 4, 7, 10]) {
  const ok = await setSlider('Line divisions', n)
  const bands = await maskBands()
  const expected = n - 1
  console.log(`n=${n}`.padEnd(6), ok ? await readout('Line divisions') : 'SLIDER ABSENT',
    '| bands', bands ? bands.length : 'none', `(expect ${expected})`,
    bands && bands.length === expected ? 'PASS' : 'FAIL',
    '|', JSON.stringify(bands))
}

// Ratio: at a fixed count, a higher ratio narrows every gap, so the outermost
// cut band (everything inside the two outer lines) must grow narrower.
await setSlider('Line divisions', 4)
const outer = async () => (await maskBands())?.[0]?.w
await setSlider('Line / gap ratio', Math.log2(0.25))
const thin = await outer()
console.log('RATIO 0.25x     ', await readout('Line / gap ratio'), '| outer cut', thin)
await setSlider('Line / gap ratio', Math.log2(4))
const thick = await outer()
console.log('RATIO 4x        ', await readout('Line / gap ratio'), '| outer cut', thick)
console.log('RATIO VERDICT   ', thick < thin
  ? `PASS — thicker lines leave a narrower cut (${thick} < ${thin})`
  : `FAIL — ${thick} vs ${thin}`)

console.log('ERRORS          ', JSON.stringify(errs.slice(0, 5)))
await b.close()
