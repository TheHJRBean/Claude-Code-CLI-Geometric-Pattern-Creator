/**
 * Gradient stop cap raised 8 → 16 (`GRADIENT_MAX_STOPS`).
 *
 * Drives the Decoration Phase's Gradient target on the 4.8.8 preset: clicks
 * `+ Stop` past the old cap, asserts the readout reaches 16/16 and the button
 * then disables, and — the part that matters — counts the `<stop>` elements
 * the across-frame gradient actually renders into the SVG defs, so this is a
 * statement about the rendered output, not about panel text.
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
await page.click('button:has-text("Decoration")')
await page.waitForTimeout(1200)
await page.click('button:has-text("Gradient")')
await page.waitForTimeout(900)

const readout = () => page.$$eval('span', es =>
  es.map(e => e.textContent.trim()).find(t => /^\d+\/\d+/.test(t)) ?? 'none')
const addDisabled = () => page.$eval('button:has-text("+ Stop")', e => e.disabled)
const renderedStops = () => page.evaluate(() =>
  [...document.querySelectorAll('svg[data-pattern-canvas] linearGradient, svg[data-pattern-canvas] radialGradient')]
    .map(g => g.querySelectorAll('stop').length))

// The across-frame surface, so the stops we add are the ones that render as
// the underlay of every unpainted Void — each surface carries its own draft,
// and switching surfaces mid-run would leave the count behind on the old one.
await page.click('button:has-text("Across frame")')
await page.waitForTimeout(700)
const enable = await page.$('label:has-text("Enable across-frame gradient") input[type=checkbox]')
if (enable && !(await enable.isChecked())) { await enable.check(); await page.waitForTimeout(1200) }

console.log('READOUT initial ', await readout())
console.log('RENDERED initial', JSON.stringify(await renderedStops()))

// Past the OLD cap of 8, then past the new one.
const add = page.locator('button:has-text("+ Stop")')
await add.scrollIntoViewIfNeeded()
for (let i = 0; i < 20; i++) {
  if (await addDisabled()) break
  await add.click()
  await page.waitForTimeout(120)
}
await page.waitForTimeout(1000)

const panel = await readout()
const defs = await renderedStops()
const maxRendered = defs.length ? Math.max(...defs) : 0
console.log('READOUT capped  ', panel)
console.log('+ Stop disabled ', await addDisabled())
console.log('RENDERED STOPS  ', JSON.stringify(defs))
console.log('VERDICT         ', panel.startsWith('16/16') && maxRendered >= 16
  ? `PASS — panel at 16/16 and the rendered gradient def carries ${maxRendered} stops`
  : `FAIL — readout ${panel}, max rendered ${maxRendered}`)
console.log('ERRORS          ', JSON.stringify(errs.slice(0, 5)))
await b.close()
