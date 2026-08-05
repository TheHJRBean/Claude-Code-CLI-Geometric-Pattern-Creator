import { chromium } from 'playwright-core'
import fs from 'node:fs'
const CHROME = '/home/harry/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const OUT = process.cwd() + '/dl2'
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })

const b = await chromium.launch({ executablePath: CHROME })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const downloads = []
page.on('download', async d => {
  const name = d.suggestedFilename()
  const path = `${OUT}/${downloads.length}-${name}`
  await d.saveAs(path); downloads.push({ name, path })
})
page.on('dialog', async dlg => { await dlg.accept('Kagome study') })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const exportSvg = async () => {
  await page.click('.export-menu__trigger')
  await page.waitForSelector('.export-menu__panel')
  await page.click('.export-menu__item:has-text("Export SVG")')
  await page.waitForTimeout(1500)
}

// ── A. A real Composition field, opaque ──────────────────────────────────────
await page.click('button:has-text("Trihexagonal 3.6.3.6")')
await page.waitForTimeout(2500)
await page.click('button:has-text("Composition")')
await page.waitForTimeout(2500)
const liveBg = await page.$eval('svg[data-pattern-canvas]', s => getComputedStyle(s).backgroundColor)
console.log('LIVE CANVAS BG', liveBg)
await exportSvg()

// ── B. Saved-library name wins over the preset label ─────────────────────────
await page.click('button:has-text("Save")')
await page.waitForTimeout(800)
// Save As may use the in-app TextPromptModal rather than window.prompt.
const modal = await page.$('input[type=text]')
if (modal) {
  await modal.fill('Kagome study')
  const confirm = await page.$('.text-prompt-modal button:has-text("Save"), [role=dialog] button:has-text("Save")')
  if (confirm) await confirm.click()
  else await page.keyboard.press('Enter')
}
await page.waitForTimeout(1200)
await exportSvg()

console.log('DOWNLOADS', JSON.stringify(downloads.map(d => d.name)))
console.log('ERRORS', JSON.stringify(errs.slice(0, 5)))
await b.close()

for (const d of downloads) {
  const s = fs.readFileSync(d.path, 'utf8')
  const rect = s.match(/<rect[^>]*data-export-background="true"[^>]*\/>/)
  const counts = {}
  for (const m of s.matchAll(/<([a-z]+)[\s/>]/g)) counts[m[1]] = (counts[m[1]] || 0) + 1
  console.log(`\nFILE ${d.path.split('/').pop()}  bytes=${s.length}`)
  console.log('  bgRect =', rect ? rect[0].slice(0, 110) : 'NONE')
  console.log('  first-drawn =', s.slice(s.indexOf('>') + 1, s.indexOf('>') + 40))
  console.log('  elements =', JSON.stringify(counts))
}
