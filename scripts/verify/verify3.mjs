import { chromium } from 'playwright-core'
import fs from 'node:fs'
const CHROME = '/home/harry/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const OUT = process.cwd() + '/dl3'
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ executablePath: CHROME })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const downloads = []
page.on('download', async d => { const n = d.suggestedFilename(); await d.saveAs(`${OUT}/${downloads.length}-${n}`); downloads.push(n) })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const saveAs = async name => {
  await page.click('button:has-text("Save")')
  await page.waitForTimeout(600)
  const input = await page.$('input[type=text]')
  if (input) { await input.fill(name); await page.keyboard.press('Enter') }
  await page.waitForTimeout(900)
}
const exportSvg = async () => {
  await page.click('.export-menu__trigger'); await page.waitForSelector('.export-menu__panel')
  await page.click('.export-menu__item:has-text("Export SVG")'); await page.waitForTimeout(1400)
}

// ── Seed the library with two named saves (needed for the >1 filter gate) ────
await page.click('button:has-text("Trihexagonal 3.6.3.6")'); await page.waitForTimeout(2200)
await saveAs('Kagome study')
await page.click('button:has-text("Square-Octagon 4.8.8")'); await page.waitForTimeout(2200)
await saveAs('Octagon Star')
await page.click('button:has-text("Kepler\'s Star (4.4.4.4 @ 67.5°)")'); await page.waitForTimeout(2200)
await saveAs('Kepler test')

// ── From-scratch Patch designates nothing ⇒ the generic default ──────────────
await page.click('button:has-text("Editor")').catch(() => {})
await page.waitForTimeout(500)
const newPatch = await page.$('button:has-text("New patch")')
if (newPatch) { await newPatch.click(); await page.waitForTimeout(2000) }
else console.log('NOTE: no "New patch" button in this state')
await exportSvg()
console.log('DOWNLOADS', JSON.stringify(downloads))

// ── Gallery name filter ─────────────────────────────────────────────────────
await page.click('.top-bar button:has-text("GALLERY"), button:has-text("Gallery")')
await page.waitForTimeout(2000)
const state = async () => ({
  subtitle: await page.$eval('.gallery-browser__subtitle', e => e.textContent.trim()).catch(() => 'none'),
  cards: await page.$$eval('.gallery-card__name, .gallery-card', es => es.length),
  names: await page.$$eval('.gallery-card', es => es.map(e => e.textContent.trim().split('\n')[0]).slice(0, 8)).catch(() => []),
  hasSearch: !!(await page.$('.gallery-browser__search-input')),
  empty: await page.$eval('.gallery-browser__empty', e => e.textContent.trim()).catch(() => null),
})
console.log('GALLERY initial', JSON.stringify(await state()))
const type = async q => { await page.fill('.gallery-browser__search-input', q); await page.waitForTimeout(500) }
await type('kagome');   console.log('filter "kagome"   ', JSON.stringify(await state()))
await type('K');        console.log('filter "K"        ', JSON.stringify(await state()))
await type('star 8');   console.log('filter "star 8"   ', JSON.stringify(await state()))
await type('nonesuch'); console.log('filter "nonesuch" ', JSON.stringify(await state()))
const clear = await page.$('.gallery-browser__empty-cta')
if (clear) { await clear.click(); await page.waitForTimeout(500) }
console.log('after Clear      ', JSON.stringify(await state()))
console.log('ERRORS', JSON.stringify(errs.slice(0, 5)))
await b.close()
