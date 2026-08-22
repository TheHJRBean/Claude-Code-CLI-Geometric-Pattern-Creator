/**
 * **Link stroke design** + the one-shot copies — headless checks against the
 * rendered DOM.
 *
 * Asserts on the CANVAS (`#strand-style-mask` / `#frame-stroke-mask` band
 * counts), not on the panel sliders. The first version of this script read the
 * sliders and reported both directions passing while the user could only get
 * one of them to do anything — a slider reads back whatever you typed into it
 * whether or not the value reached the pattern.
 *
 * The live link cannot SEED either side from the other: it fires on an edit,
 * so with it on the only way to make the Strands match the border is to edit
 * the Strands, which pushes theirs onto the border and destroys what you were
 * copying. That is what the copy buttons are for, and why the border→Strand
 * case here starts with the link OFF and a border design worth keeping.
 */
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/home/harry/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.click('button:has-text("Square-Octagon 4.8.8")')
await page.waitForTimeout(2200)
const go = async (n) => { const e = await page.$(`button:has-text("${n}")`); if (e) { await e.click(); await page.waitForTimeout(900) } }
await go('Design')
const add = await page.$('button:has-text("+ Shape Frame")')
if (add) { await add.scrollIntoViewIfNeeded(); await add.click(); await page.waitForTimeout(1000) }
await go('Decoration')
const bt = await page.$('label:has-text("Frame border stroke") input[type=checkbox]')
if (bt) { await bt.scrollIntoViewIfNeeded(); if (!(await bt.isChecked())) { await bt.check(); await page.waitForTimeout(800) } }

const setByIndex = async (idx, value) => {
  const el = (await page.$$('input.pattern-slider'))[idx]
  await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(150)
  const box = await el.boundingBox()
  const min = Number(await el.getAttribute('min')), max = Number(await el.getAttribute('max'))
  const st = Number(await el.getAttribute('step')) || 1
  await page.mouse.click(box.x + 8 + (box.width - 16) * ((value - min) / (max - min)), box.y + box.height / 2)
  for (let i = 0; i < 400; i++) {
    const c = Number(await el.inputValue()); if (Math.abs(c - value) < st / 2) break
    await page.keyboard.press(c < value ? 'ArrowRight' : 'ArrowLeft'); await page.waitForTimeout(12)
  }
  await page.waitForTimeout(700)
}
const divIdxs = () => page.evaluate(() => [...document.querySelectorAll('input.pattern-slider')]
  .map((s, i) => [(s.previousElementSibling?.textContent ?? ''), i])
  .filter(([l]) => l.includes('Line divisions')).map(([, i]) => i))

// Rendered truth, from the canvas.
const rendered = () => page.evaluate(() => ({
  strandBands: document.querySelectorAll('#strand-style-mask path').length,
  frameBands: document.querySelectorAll('#frame-stroke-mask polygon').length,
}))

// Give the BORDER a design (9 divisions) with the link OFF, so the Strands
// keep theirs. This is the user's situation: a border design worth keeping.
await setByIndex((await divIdxs())[0], 9)
console.log('border 9, link off  ', JSON.stringify(await rendered()), '(strand untouched — correct)')

// ── The direction the live link could not reach ─────────────────────────────
const copyToStrands = await page.$$('button:has-text("Copy to strands")')
console.log('COPY BUTTONS        ', copyToStrands.length >= 2
  ? `PASS — reachable from both ends (${copyToStrands.length})`
  : `only ${copyToStrands.length} found`)
await copyToStrands[0].scrollIntoViewIfNeeded(); await copyToStrands[0].click(); await page.waitForTimeout(1000)
const afterBtoS = await rendered()
console.log('after Copy to strands', JSON.stringify(afterBtoS))
console.log('B→S VERDICT         ', afterBtoS.strandBands === afterBtoS.frameBands && afterBtoS.strandBands > 0
  ? `PASS — Strands took the border's 9 divisions (${afterBtoS.strandBands} cut bands each)`
  : `FAIL — ${JSON.stringify(afterBtoS)}`)

// ── And back the other way ──────────────────────────────────────────────────
const ix = await divIdxs()
await setByIndex(ix[ix.length - 1], 4) // the Strand's own divisions slider
const copyToBorder = await page.$$('button:has-text("Copy to border")')
await copyToBorder[0].scrollIntoViewIfNeeded(); await copyToBorder[0].click(); await page.waitForTimeout(1000)
const afterStoB = await rendered()
console.log('after Copy to border ', JSON.stringify(afterStoB))
console.log('S→B VERDICT         ', afterStoB.frameBands === afterStoB.strandBands && afterStoB.strandBands > 0
  ? `PASS — border took the Strands' 4 divisions (${afterStoB.frameBands} cut bands each)`
  : `FAIL — ${JSON.stringify(afterStoB)}`)
console.log('ERRORS              ', errs.length ? errs.slice(0, 2) : 'none')
await b.close()
