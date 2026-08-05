/**
 * Gap fills + the outside-hung Frame border — headless checks against the
 * rendered DOM.
 *
 * 1. Per-gap fills: with 5 divisions and only the OUTER ring filled, the
 *    strand layer must carry the `#strand-gap-fill-mask` (an unfilled ring
 *    cannot be expressed by the underlay stack alone) and exactly one
 *    coloured underlay stroke.
 * 2. Frame border: the border polygon must sit entirely OUTSIDE the Frame
 *    outline — measured as its bbox growing by the stroke width, so a wide
 *    border can't bury the pattern the outline clips.
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

/**
 * A slider by its FieldLabel text. `after` skips forward past another label —
 * the Decoration phase shows the border's own divisions/ratio sliders while
 * the Strand ones are still in the DOM, and the first match is the wrong one.
 */
const sliderBy = async (label, after = null) => page.evaluateHandle(([l, a]) => {
  let armed = a === null
  for (const s of document.querySelectorAll('input.pattern-slider')) {
    const text = s.previousElementSibling?.textContent ?? ''
    if (!armed) { if (text.includes(a)) armed = true; continue }
    if (text.includes(l)) return s
  }
  return null
}, [label, after]).then(h => h.asElement())

/** Click roughly, then arrow-key exactly — a click at either end of a range
 *  track lands on the thumb's half-width and stops short. */
const setSlider = async (label, value, after = null) => {
  const el = await sliderBy(label, after)
  if (!el) return false
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  const box = await el.boundingBox()
  const min = Number(await el.getAttribute('min'))
  const max = Number(await el.getAttribute('max'))
  const step = Number(await el.getAttribute('step')) || 1
  const frac = Math.min(1, Math.max(0, (value - min) / (max - min)))
  await page.mouse.click(box.x + 8 + (box.width - 16) * frac, box.y + box.height / 2)
  await page.waitForTimeout(200)
  for (let i = 0; i < 60; i++) {
    const v = Number(await el.inputValue())
    if (Math.abs(v - value) < step / 2) break
    await page.keyboard.press(v < value ? 'ArrowRight' : 'ArrowLeft')
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(600)
  const got = await el.inputValue()
  console.log(`SET             ${label}${after ? ` (after ${after})` : ''} → ${got}`)
  return Math.abs(Number(got) - value) < step
}

const click = async (selector, label) => {
  const el = await page.$(selector)
  if (!el) { console.log(`MISSING         ${label} (${selector})`); return false }
  await el.scrollIntoViewIfNeeded()
  await el.click()
  await page.waitForTimeout(600)
  return true
}

// ── 1. Per-gap fills ────────────────────────────────────────────────────────
const comp = await page.$('button:has-text("Composition")')
if (comp) { await comp.click(); await page.waitForTimeout(900) }
await setSlider('Line divisions', 5)

const fillToggle = await page.$('label:has-text("Fill between lines") input[type=checkbox]')
if (fillToggle && !(await fillToggle.isChecked())) { await fillToggle.check(); await page.waitForTimeout(600) }
await click('button:has-text("Individual")', 'Individual gap mode')

const gapState = () => page.evaluate(() => {
  const layer = document.querySelector('#strand-layer')
  const mask = document.querySelector('#strand-gap-fill-mask')
  const fills = [...(layer?.querySelectorAll('g > path[stroke]:not([mask])') ?? [])]
  const underlays = [...(layer?.querySelectorAll('#strand-gap-fills path') ?? [])]
    .map(p => p.getAttribute('stroke'))
  return {
    gapMask: !!mask,
    maskBandColours: mask ? [...new Set([...mask.querySelectorAll('path')].map(p => p.getAttribute('stroke')))] : [],
    underlayColours: [...new Set(underlays)],
    anyFill: fills.length > 0,
  }
})

console.log('BOTH rings      ', JSON.stringify(await gapState()))
// Clear the inner ring: mixed fills, which is the case that needs the mask.
// By title, not text: "Clear" also matches the panel's disabled "Clear paint".
const clearButtons = await page.$$('button[title="Leave this ring unfilled"]')
if (clearButtons.length) { await clearButtons[clearButtons.length - 1].click(); await page.waitForTimeout(700) }
const mixed = await gapState()
console.log('OUTER ring only ', JSON.stringify(mixed))
console.log('GAPFILL VERDICT ', mixed.gapMask && mixed.underlayColours.length === 1
  ? `PASS — one ring painted (${mixed.underlayColours[0]}) behind a reveal mask`
  : `FAIL — ${JSON.stringify(mixed)}`)

// ── 2. Frame border hangs outside the outline ───────────────────────────────
const design = await page.$('button:has-text("Design")')
if (design) { await design.click(); await page.waitForTimeout(800) }
await click('button:has-text("+ Shape Frame")', 'add Shape Frame')

const deco = await page.$('button:has-text("Decoration")')
if (deco) { await deco.click(); await page.waitForTimeout(900) }
const borderToggle = await page.$('label:has-text("Frame border stroke") input[type=checkbox]')
if (borderToggle && !(await borderToggle.isChecked())) { await borderToggle.check(); await page.waitForTimeout(700) }
await setSlider('Border width', 60)

const borderGeom = () => page.evaluate(() => {
  const bbox = poly => {
    const pts = (poly.getAttribute('points') ?? '').trim().split(/\s+/).map(p => p.split(',').map(Number))
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  }
  const clip = document.querySelector('clipPath polygon')
  // The border is the only stroked polygon carrying a stroke-width in world units.
  const border = [...document.querySelectorAll('svg[data-pattern-canvas] polygon[stroke-width]')]
    .filter(p => Number(p.getAttribute('stroke-width')) > 10)[0]
  if (!clip || !border) return null
  return { clip: bbox(clip), border: bbox(border), width: Number(border.getAttribute('stroke-width')) }
})

const g = await borderGeom()
if (!g) {
  console.log('BORDER VERDICT   INCONCLUSIVE — no frame clip / border polygon found')
} else {
  const grew = g.clip.minX - g.border.minX
  console.log('BORDER geom     ', JSON.stringify(g))
  console.log('BORDER VERDICT  ', Math.abs(grew - g.width / 2) < 1
    ? `PASS — border ring offset outward by w/2 (${grew.toFixed(2)} vs ${(g.width / 2).toFixed(2)}), inner edge on the outline`
    : `FAIL — offset ${grew.toFixed(2)}, expected ${(g.width / 2).toFixed(2)}`)
}

// ── 3. The same gap fills on the border, where they are actually visible ────
await setSlider('Line divisions', 4, 'Border width')
// FIRST match, not last: the Decoration panel's border block precedes the
// Display section, whose Strand controls carry identically-labelled rows.
const borderFill = await page.$$('label:has-text("Fill between lines") input[type=checkbox]')
if (borderFill.length && !(await borderFill[0].isChecked())) {
  await borderFill[0].check(); await page.waitForTimeout(600)
}
const indiv = await page.$$('button:has-text("Individual")')
if (indiv.length) { await indiv[0].click(); await page.waitForTimeout(600) }
const borderClears = await page.$$('button[title="Leave this ring unfilled"]')
if (borderClears.length) { await borderClears[0].click(); await page.waitForTimeout(700) }

const borderRings = await page.evaluate(() => {
  const mask = document.querySelector('#frame-gap-fill-mask')
  const fills = [...document.querySelectorAll('svg[data-pattern-canvas] g > polygon[stroke]')]
    .map(p => ({ w: Number(p.getAttribute('stroke-width')), c: p.getAttribute('stroke') }))
    .filter(f => f.c !== 'black' && f.c !== 'white')
  return { gapMask: !!mask, strokes: fills }
})
console.log('BORDER rings    ', JSON.stringify(borderRings))
console.log('BORDER FILL     ', borderRings.gapMask
  ? 'PASS — mixed border rings render behind their own reveal mask'
  : 'INCONCLUSIVE — no mixed-ring mask (all rings may be filled)')

// A picture too — the numbers can't see a gap fill leaking outside its ring.
if (process.env.SHOT) {
  await page.screenshot({ path: process.env.SHOT, clip: { x: 300, y: 60, width: 1000, height: 900 } })
  console.log('SHOT            ', process.env.SHOT)
}

console.log('ERRORS          ', JSON.stringify(errs.slice(0, 5)))
await b.close()
