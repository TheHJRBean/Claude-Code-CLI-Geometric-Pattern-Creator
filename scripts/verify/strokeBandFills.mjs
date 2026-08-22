/**
 * Per-line colours + the `individual` grain on a Strand — headless checks
 * against the rendered DOM.
 *
 * The geometry has unit tests; what those cannot see is whether any of it
 * reaches the canvas. Three things are only true in the DOM:
 *   1. Every line ring is drawn, filled or not — a skipped one would wear its
 *      outer neighbour's colour, and the unit test can only say the resolver
 *      returned null.
 *   2. An `individual` band really is drawn on an OFFSET path. Same `d` as the
 *      ink = the offset silently didn't happen, and the picture would still
 *      look plausible (a symmetric band).
 *   3. The Individual grain is now offered on a Strand at all.
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

const sliderBy = async (label, after = null) => page.evaluateHandle(([l, a]) => {
  let armed = a === null
  for (const s of document.querySelectorAll('input.pattern-slider')) {
    const text = s.previousElementSibling?.textContent ?? ''
    if (!armed) { if (text.includes(a)) armed = true; continue }
    if (text.includes(l)) return s
  }
  return null
}, [label, after]).then(h => h.asElement())

const setSlider = async (label, value, after = null) => {
  const el = await sliderBy(label, after)
  if (!el) { console.log(`MISSING SLIDER  ${label}`); return false }
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  const box = await el.boundingBox()
  const min = Number(await el.getAttribute('min'))
  const max = Number(await el.getAttribute('max'))
  const step = Number(await el.getAttribute('step')) || 1
  const frac = Math.min(1, Math.max(0, (value - min) / (max - min)))
  await page.mouse.click(box.x + 8 + (box.width - 16) * frac, box.y + box.height / 2)
  await page.waitForTimeout(200)
  for (let i = 0; i < 200; i++) {
    const v = Number(await el.inputValue())
    if (Math.abs(v - value) < step / 2) break
    await page.keyboard.press(v < value ? 'ArrowRight' : 'ArrowLeft')
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(500)
  const got = await el.inputValue()
  console.log(`SET             ${label} → ${got} (range ${min}..${max})`)
  return { value: Number(got), min, max }
}

const comp = await page.$('button:has-text("Composition")')
if (comp) { await comp.click(); await page.waitForTimeout(900) }

// ── 0. The raised ceilings actually reached the sliders ─────────────────────
const widthRange = await setSlider('Strand width', 60)
const divRange = await setSlider('Line divisions', 5)
console.log('CEILINGS        ', widthRange.max === 120 && divRange.max === 20
  ? 'PASS — Strand width to 120, divisions to 20'
  : `FAIL — width max ${widthRange.max}, divisions max ${divRange.max}`)

// ── 1. Per-line colours, All grain ──────────────────────────────────────────
const lineToggle = await page.$('label:has-text("Colour the lines") input[type=checkbox]')
if (!lineToggle) { console.log('MISSING         "Colour the lines" toggle'); }
else if (!(await lineToggle.isChecked())) { await lineToggle.scrollIntoViewIfNeeded(); await lineToggle.check(); await page.waitForTimeout(700) }

const ringState = () => page.evaluate(() => {
  const rings = [...document.querySelectorAll('#strand-layer path[data-band="line-ring"]')]
  const widths = [...new Set(rings.map(p => Number(p.getAttribute('stroke-width')).toFixed(3)))]
  return {
    count: rings.length,
    distinctWidths: widths.length,
    widths: widths.map(Number).sort((a, c) => c - a),
    colours: [...new Set(rings.map(p => p.getAttribute('stroke')))],
  }
})
console.log('LINE RINGS all  ', JSON.stringify(await ringState()))

// ── 2. Matching grain: rings take different colours, every ring still drawn ─
const modeButtons = await page.$$('button:has-text("Matching")')
if (modeButtons.length) { await modeButtons[modeButtons.length - 1].scrollIntoViewIfNeeded(); await modeButtons[modeButtons.length - 1].click(); await page.waitForTimeout(700) }
const matching = await ringState()
console.log('LINE RINGS match', JSON.stringify(matching))
// 5 lines ⇒ ceil(5/2) = 3 rings, so 3 distinct stroke widths must be present.
console.log('RING COVER      ', matching.distinctWidths === 3
  ? 'PASS — all 3 line rings of a 5-line stroke are drawn'
  : `FAIL — ${matching.distinctWidths} distinct ring widths, expected 3`)

// ── 3. Individual grain on a Strand ─────────────────────────────────────────
const indiv = await page.$$('button:has-text("Individual")')
console.log('INDIVIDUAL OFFER', indiv.length > 0
  ? `PASS — ${indiv.length} Individual button(s) on a Strand panel`
  : 'FAIL — Individual grain not offered on a Strand')
if (indiv.length) { await indiv[indiv.length - 1].scrollIntoViewIfNeeded(); await indiv[indiv.length - 1].click(); await page.waitForTimeout(900) }

// Give each line its own colour, so the DOM can be read for WHICH line got
// what — with every swatch on the seeded default they are indistinguishable
// and the check degenerates to "something was drawn".
const PALETTE = ['#ff0000', '#00cc00', '#0000ff', '#ffaa00', '#aa00ff']
const swatches = await page.$$('input[type=color]')
const lineSwatches = swatches.slice(-5)
for (let i = 0; i < lineSwatches.length; i++) {
  await lineSwatches[i].scrollIntoViewIfNeeded()
  await lineSwatches[i].fill(PALETTE[i])
  await page.waitForTimeout(250)
}
await page.waitForTimeout(700)

const offsetState = () => page.evaluate(() => {
  const bands = [...document.querySelectorAll('#strand-layer path[data-band="line-individual"]')]
  const ink = [...document.querySelectorAll('#strand-layer g[mask] > path:not([data-band])')]
  const inkSet = new Set(ink.map(p => p.getAttribute('d')))
  return {
    inkPaths: ink.length,
    bands: bands.length,
    // A band must be drawn on an OFFSET path, not the ink's own — except the
    // lone centre line of an odd count, whose offset is genuinely zero.
    onOwnPath: bands.filter(p => inkSet.has(p.getAttribute('d'))).length,
    widths: [...new Set(bands.map(p => Number(p.getAttribute('stroke-width')).toFixed(3)))],
    colours: [...new Set(bands.map(p => p.getAttribute('stroke')))],
  }
})
const off = await offsetState()
console.log('INDIVIDUAL BANDS', JSON.stringify(off))
// 5 lines over `inkPaths` pieces; exactly the centre line rides the ink path.
const expectCentre = off.inkPaths
console.log('OFFSET VERDICT  ', off.bands > 0 && off.onOwnPath === expectCentre
  ? `PASS — ${off.bands} bands; only the ${expectCentre} centre-line copies ride the ink path, the rest are offset`
  : `FAIL — ${off.onOwnPath} on own path, expected ${expectCentre} (the odd count's centre line)`)
console.log('COLOUR VERDICT  ', PALETTE.every(c => off.colours.includes(c))
  ? `PASS — all 5 per-line colours reached the canvas`
  : `FAIL — canvas has ${JSON.stringify(off.colours)}`)

console.log('CONSOLE ERRORS  ', errs.length ? errs.slice(0, 3) : 'none')
await b.close()
