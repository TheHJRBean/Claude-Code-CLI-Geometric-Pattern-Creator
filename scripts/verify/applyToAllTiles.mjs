/**
 * "Apply to all Tiles" — headless check against the rendered DOM.
 *
 * Loads the 4.8.8 preset (two Tile types: octagon + square), switches to
 * Composition, opens Strands, and reads the contact-angle readouts off the
 * Tile cards while dragging one slider — first with the toggle OFF (only the
 * dragged card moves), then ON (both move). Reads the panel, never
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

// ── 4.8.8 preset: octagon + square Tile types ───────────────────────────────
await page.click('button:has-text("Square-Octagon 4.8.8")')
await page.waitForTimeout(2200)

// ── Composition phase + strands on ──────────────────────────────────────────
const comp = await page.$('button:has-text("Composition")')
if (comp) { await comp.click(); await page.waitForTimeout(900) }
const strandsToggle = await page.$('label:has-text("Show strands") input[type=checkbox]')
if (strandsToggle && !(await strandsToggle.isChecked())) {
  await strandsToggle.check(); await page.waitForTimeout(900)
}

// Open the Strands section if it is collapsed.
if (!(await page.$('text=Contact angle'))) {
  await page.click('text=Strands'); await page.waitForTimeout(600)
}

/**
 * Every range slider on the panel, tagged with its own FieldLabel and the
 * Cinzel heading of the Tile card it sits in. Values come off the inputs
 * themselves, so a card is identified by structure, not by guessing at text.
 */
const sliders = () => page.evaluate(() => {
  return [...document.querySelectorAll('input.pattern-slider')].map((s, i) => {
    const label = s.previousElementSibling?.textContent?.trim() ?? ''
    let node = s.parentElement
    let heading = ''
    while (node) {
      const h = node.firstElementChild
      if (h && getComputedStyle(h).fontFamily.includes('Cinzel')) { heading = h.textContent.trim(); break }
      node = node.parentElement
    }
    return { i, heading, label, value: s.value }
  })
})

const contactAngles = async () =>
  (await sliders())
    .filter(s => s.label.startsWith('Contact angle'))
    .map(s => ({ tile: s.heading, angle: s.value }))

const slider = async i => (await page.$$('input.pattern-slider'))[i]
const drag = async (el, dx) => {
  // The sidebar is long — an un-scrolled slider sits below the viewport and
  // every synthetic mouse event misses it silently.
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const box = await el.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(700)
}

console.log('SLIDERS         ', JSON.stringify(await sliders()))
console.log('ANGLES initial  ', JSON.stringify(await contactAngles()))

// The first Tile card's contact-angle slider.
const firstAngleIdx = (await sliders()).find(s => s.label.startsWith('Contact angle')).i

// ── Toggle OFF: only the dragged card moves ─────────────────────────────────
await drag(await slider(firstAngleIdx), -110)
const afterSolo = await contactAngles()
console.log('ANGLES solo     ', JSON.stringify(afterSolo))
console.log('SOLO VERDICT    ', new Set(afterSolo.map(a => a.angle)).size === afterSolo.length
  ? 'PASS — Tile types diverged, so the toggle is what links them'
  : `INCONCLUSIVE — ${JSON.stringify(afterSolo)}`)

// ── Toggle ON: every card moves ─────────────────────────────────────────────
const link = await page.$('label:has-text("Apply to all Tiles") input[type=checkbox]')
console.log('TOGGLE present  ', !!link)
if (link) { await link.check(); await page.waitForTimeout(500) }
console.log('HINT            ', await page.$eval('text=/Linked —/', e => e.textContent.trim()).catch(() => 'none'))

await drag(await slider(firstAngleIdx), 90)
const afterLinked = await contactAngles()
console.log('ANGLES linked   ', JSON.stringify(afterLinked))

const angles = afterLinked.map(a => a.angle)
console.log('VERDICT         ', angles.length > 1 && new Set(angles).size === 1
  ? `PASS — all ${angles.length} Tile types read ${angles[0]}`
  : `FAIL — ${JSON.stringify(afterLinked)}`)
console.log('ERRORS          ', JSON.stringify(errs.slice(0, 5)))
await b.close()
