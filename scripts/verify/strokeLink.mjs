/**
 * **Link stroke design** — the toggle that keeps the Frame border and the
 * Strands wearing the same divided-stroke design, edited from either end.
 *
 * The fan-out has unit tests; what only the browser can show is that the
 * toggle is reachable from BOTH ends (the point of "and vice versa"), that
 * the mirrored action targets the substrate's own Frame home, and that width
 * — the one field the link must not copy — really stays put.
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
const sliderBy = async (label, nth = 0) => page.evaluateHandle(([l, n]) => {
  const hits = [...document.querySelectorAll('input.pattern-slider')]
    .filter(s => (s.previousElementSibling?.textContent ?? '').includes(l))
  return hits[n] ?? null
}, [label, nth]).then(h => h.asElement())
const setSlider = async (label, value, nth = 0) => {
  const el = await sliderBy(label, nth); if (!el) { console.log('MISSING SLIDER', label); return null }
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
  return Number(await el.inputValue())
}
const readSlider = async (label, nth = 0) => {
  const el = await sliderBy(label, nth); return el ? Number(await el.inputValue()) : null
}

// A Frame with a border, so there is something to link to.
await go('Design')
const add = await page.$('button:has-text("+ Shape Frame")')
if (add) { await add.scrollIntoViewIfNeeded(); await add.click(); await page.waitForTimeout(900) }
await go('Decoration')
const bt = await page.$('label:has-text("Frame border stroke") input[type=checkbox]')
if (bt) { await bt.scrollIntoViewIfNeeded(); if (!(await bt.isChecked())) { await bt.check(); await page.waitForTimeout(800) } }
await setSlider('Border width', 80)

// ── 1. The toggle is offered at BOTH ends ───────────────────────────────────
const toggles = await page.$$('label:has-text("Link stroke design to Frame border") input[type=checkbox]')
console.log('TOGGLE REACH    ', toggles.length >= 2
  ? `PASS — ${toggles.length} toggles (border block + Strand controls)`
  : `FAIL — ${toggles.length} found; "and vice versa" is only discoverable from one side`)

// ── 2. Border → Strand ──────────────────────────────────────────────────────
await toggles[0].scrollIntoViewIfNeeded(); await toggles[0].check(); await page.waitForTimeout(600)
// The border's divisions slider comes FIRST in the DOM; the Strand's is in the
// Display section below it.
const borderDivs = await setSlider('Line divisions', 6, 0)
await page.waitForTimeout(700)
const strandDivsAfter = await readSlider('Line divisions', 1)
const strandWidth = await readSlider('Strand width', 0)
console.log(`BORDER→STRAND    border divisions ${borderDivs} → strand divisions ${strandDivsAfter}, strand width ${strandWidth}`)
console.log('B→S VERDICT     ', strandDivsAfter === borderDivs
  ? 'PASS — the design crossed over'
  : `FAIL — strand still at ${strandDivsAfter}`)

// ── 3. Strand → Border, and width stays put ─────────────────────────────────
const borderWidthBefore = await readSlider('Border width', 0)
const strandDivs = await setSlider('Line divisions', 3, 1)
await page.waitForTimeout(700)
const borderDivsAfter = await readSlider('Line divisions', 0)
const borderWidthAfter = await readSlider('Border width', 0)
console.log(`STRAND→BORDER    strand divisions ${strandDivs} → border divisions ${borderDivsAfter}`)
console.log('S→B VERDICT     ', borderDivsAfter === strandDivs
  ? 'PASS — the design crossed back'
  : `FAIL — border still at ${borderDivsAfter}`)
console.log('WIDTH VERDICT   ', borderWidthAfter === borderWidthBefore
  ? `PASS — border width held at ${borderWidthAfter} while the design was linked`
  : `FAIL — border width moved ${borderWidthBefore} → ${borderWidthAfter}`)

console.log('ERRORS          ', errs.length ? errs.slice(0, 3) : 'none')
if (process.argv[2]) {
  const canvas = await page.$('svg[data-pattern-canvas]')
  await canvas.screenshot({ path: process.argv[2] })
}
await b.close()
