/**
 * Junction ornaments — headless check against the rendered DOM.
 *
 * Loads the 4.8.8 preset (a tier-1 conversion, so the Lab holds a real Patch
 * and the periodic fast path is otherwise eligible), enters Decoration, and
 * drives the Junctions paint target. Asserts on what the renderer emits:
 *
 *  - the paint overlay marks every crossing while the target is live;
 *  - "Ornament every junction" mints one `<use>` per crossing in
 *    `#junction-ornament-world-layer` — which only exists at all if ornaments
 *    successfully disqualified the `<use>`-tiled fast path;
 *  - shape / hollow reach the `<defs>` geometry and paint;
 *  - a Matching click ornaments one class, not the whole field;
 *  - a non-solid strand style withdraws the ornaments (v1 scope) and says so.
 *
 * Reads the SVG, never localStorage (the Lab writes that on a debounce).
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
await page.waitForTimeout(900)
await page.click('button:has-text("Junctions")')
await page.waitForTimeout(1500)

/** The faint per-crossing markers the Junctions target draws. */
const markers = () => page.evaluate(() =>
  document.querySelectorAll('#decoration-paint-layer circle').length)

/** The rendered ornaments. A dot / star is one shared <defs> path cloned by
 *  <use>; a twinkle is derived from ITS OWN junction's threads, so it is one
 *  <path> per junction outside the defs. */
const ornaments = () => page.evaluate(() => {
  const layer = document.querySelector('#junction-ornament-world-layer')
  if (!layer) return null
  const flares = [...layer.querySelectorAll(':scope > path')].map(p => ({
    corners: (p.getAttribute('d').match(/M/g) ?? []).length,
    curves: (p.getAttribute('d').match(/C/g) ?? []).length,
  }))
  const defs = [...layer.querySelectorAll('defs path')].map(p => ({
    d: p.getAttribute('d').slice(0, 40),
    curves: (p.getAttribute('d').match(/Q/g) ?? []).length,
    lines: (p.getAttribute('d').match(/L/g) ?? []).length,
    fill: p.getAttribute('fill'),
    stroke: p.getAttribute('stroke'),
    strokeWidth: p.getAttribute('stroke-width'),
  }))
  return { uses: layer.querySelectorAll('use').length, defs, flares }
})

/** Is the composition on the periodic fast path? (Ornaments must kill it.) */
const fastPath = () => page.evaluate(() =>
  !!document.querySelector('#composition-fragment, #composition-fragment-strands'))

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
  const frac = Math.min(1, Math.max(0, (value - min) / (max - min)))
  await page.mouse.click(box.x + 8 + (box.width - 16) * frac, box.y + box.height / 2)
  await page.waitForTimeout(250)
  for (let i = 0; i < 80; i++) {
    const v = Number(await el.inputValue())
    if (Math.abs(v - value) < step / 2) break
    await page.keyboard.press(v < value ? 'ArrowRight' : 'ArrowLeft')
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(600)
  return true
}

const crossings = await markers()
console.log('CROSSINGS MARKED', crossings, crossings > 20 ? 'PASS' : 'FAIL')

// ── All: one ornament per crossing ──────────────────────────────────────
await page.click('button:has-text("Ornament every junction")')
await page.waitForTimeout(1200)
const all = await ornaments()
console.log('FAST PATH        ', await fastPath(), '(expect false — ornaments disqualify it)')
console.log('ALL              ', all ? `${all.uses} uses, ${all.defs.length} style(s)` : 'LAYER ABSENT',
  all && all.uses === crossings ? 'PASS' : `FAIL (expect ${crossings})`)
console.log('  dot geometry   ', JSON.stringify(all?.defs?.[0]))

// ── Shape + hollow reach the geometry (the '*' group is live-edited) ────
await page.click('button:has-text("Twinkle")')
await page.waitForTimeout(1500)
const twinkle = await ornaments()
// The twinkle rounds off the corners between the Strands: one path per
// junction, four corners at an ordinary crossing (a thread continues both
// ways, so 2 threads = 4 arms = 4 wedges), each a single tangent curve.
const fourCornered = twinkle?.flares?.filter(f => f.corners === 4 && f.curves === 4).length ?? 0
console.log('TWINKLE          ', `${twinkle?.flares?.length ?? 0} flare paths, ${fourCornered} with 4 rounded corners`,
  twinkle && twinkle.flares.length === crossings && fourCornered > crossings / 2
    ? 'PASS — built from the threads, not stamped'
    : 'FAIL')

// Reach runs the rounding further up each arm.
const firstCorner = () => page.evaluate(() => {
  const p = document.querySelector('#junction-ornament-world-layer > path')
  const m = p.getAttribute('d').match(/^M(-?[\d.e-]+),(-?[\d.e-]+)/)
  return Math.hypot(Number(m[1]), Number(m[2]))
})
const nearReach = await firstCorner()
await setSlider('Reach along the strand', 8)
const farReach = await firstCorner()
console.log('TWINKLE REACH    ', `${nearReach.toFixed(1)} → ${farReach.toFixed(1)}`,
  farReach > nearReach * 1.5 ? 'PASS — runs further up the arms' : 'FAIL')
await setSlider('Reach along the strand', 2.5)

await page.click('button:has-text("Star")')
await page.waitForTimeout(300)
await setSlider('Points', 8)
const star = await ornaments()
console.log('STAR n=8         ', JSON.stringify(star?.defs?.[0]),
  star?.defs?.[0]?.lines === 15 ? 'PASS — 8 tips + 8 waists' : 'FAIL (expect 15 L)')

await page.click('label:has-text("Hollow") input[type=checkbox]')
await page.waitForTimeout(1000)
const hollow = await ornaments()
console.log('HOLLOW           ', JSON.stringify(hollow?.defs?.[0]),
  hollow?.defs?.[0]?.fill === 'none' && hollow?.defs?.[0]?.stroke ? 'PASS — stroked outline' : 'FAIL')

// ── Reach: Single ornaments exactly one crossing, Matching a whole class ─
await page.click('button:has-text("Remove all")')
await page.waitForTimeout(800)
await page.click('button:has-text("Single")')
await page.waitForTimeout(500)
// Click the crossing nearest the canvas centre.
const target = await page.evaluate(() => {
  const svg = document.querySelector('svg[data-pattern-canvas]')
  const r = svg.getBoundingClientRect()
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  let best = null, bestD = Infinity
  for (const c of document.querySelectorAll('#decoration-paint-layer circle')) {
    const box = c.getBoundingClientRect()
    const x = box.left + box.width / 2, y = box.top + box.height / 2
    const d = (x - cx) ** 2 + (y - cy) ** 2
    if (d < bestD) { bestD = d; best = { x, y } }
  }
  return best
})
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(1200)
const single = await ornaments()
console.log('SINGLE           ', single ? `${single.uses} uses of ${crossings} crossings` : 'LAYER ABSENT',
  single && single.uses === 1 ? 'PASS — exactly one crossing' : 'FAIL (expect 1)')

// Same click again: the canvas toggle clears what it placed.
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(1000)
console.log('RE-CLICK         ', (await ornaments()) === null ? 'PASS — cleared' : 'FAIL — still drawn')

await page.click('button:has-text("Matching")')
await page.waitForTimeout(400)
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(1200)
const matching = await ornaments()
console.log('MATCHING         ', matching ? `${matching.uses} uses of ${crossings} crossings` : 'LAYER ABSENT',
  matching && matching.uses > 1 ? 'PASS — a whole congruent class' : 'FAIL')

// The draft edits the group just painted, live.
const beforeSize = matching?.defs?.[0]?.d
await setSlider('Size', 6)
const resized = await ornaments()
console.log('DRAFT SYNC       ', resized?.defs?.[0]?.d,
  resized && resized.defs[0].d !== beforeSize && resized.uses === matching.uses
    ? 'PASS — placed ornaments follow the slider'
    : 'FAIL')

// ── v1 scope: solid strands only ────────────────────────────────────────
// The Strand line-division control lives in the Display section; set it to 2
// and the ornaments must withdraw, with the panel saying why.
await setSlider('Line divisions', 2)
await page.waitForTimeout(1200)
const divided = await ornaments()
const note = await page.evaluate(() =>
  document.body.innerText.includes('solid') && document.body.innerText.includes('Line divisions'))
console.log('DIVIDED STRANDS  ', divided ? `${divided.uses} uses` : 'layer absent',
  divided === null ? 'PASS — withdrawn' : 'FAIL — still drawn')
console.log('  panel says why ', note ? 'PASS' : 'FAIL')

console.log('ERRORS           ', JSON.stringify(errs.slice(0, 5)))
await b.close()
