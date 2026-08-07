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

// ── Same colour as strand, with NO strand paint ─────────────────────────
// The common case, and the one that was broken: nothing has been painted, so
// there are no strand records — but the Strands are still a colour, the
// global one, and an ornament told to match must take it. It used to fall
// back to its own colour until you had painted a Strand, which read as the
// option doing nothing at all.
await page.click('label:has-text("Same colour as strand") input')
await page.waitForTimeout(1400)
const unpainted = await page.evaluate(() => {
  const orn = document.querySelector('#junction-ornament-world-layer defs path')
  const strand = document.querySelector('#strand-layer path')
  const norm = c => (c ?? '').trim().toLowerCase()
  return { ornament: norm(orn?.getAttribute('fill')), strand: norm(strand?.getAttribute('stroke')) }
})
console.log('MATCH UNPAINTED  ', JSON.stringify(unpainted),
  unpainted.strand && unpainted.ornament === unpainted.strand
    ? 'PASS — takes the global strand colour'
    : 'FAIL — ornament ignored the unpainted Strands')
await page.click('label:has-text("Same colour as strand") input')
await page.waitForTimeout(800)

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
// Reach is in WORLD units, so the far end of the slider has to be far — a
// twinkle on a big Tile is the whole reason it stopped being strand widths.
const nearReach = await firstCorner()
await setSlider('Reach along the strand', 80)
const farReach = await firstCorner()
console.log('TWINKLE REACH    ', `${nearReach.toFixed(1)} → ${farReach.toFixed(1)}`,
  farReach > nearReach * 1.5 && farReach > 60 ? 'PASS — runs far up the arms' : 'FAIL')
await setSlider('Reach along the strand', 12)

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

// ── Same colour as strand + under/over ──────────────────────────────────
// Restore a solid stroke first (the divided-strand check above withdrew the
// ornaments), then paint every Strand and check the ornaments follow.
await setSlider('Line divisions', 1)
await page.waitForTimeout(800)
await page.click('button:has-text("Strands")')
await page.waitForTimeout(600)
const setColour = async hex => page.evaluate(c => {
  const el = [...document.querySelectorAll('input[type=color]')][0]
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, c)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}, hex)
await setColour('#2e7d32')
await page.waitForTimeout(400)
await page.click('button:has-text("Colour all strands")')
await page.waitForTimeout(1200)

await page.click('button:has-text("Junctions")')
await page.waitForTimeout(800)
await page.click('button:has-text("Remove all")')
await page.waitForTimeout(600)
await page.click('label:has-text("Same colour as strand") input')
await page.waitForTimeout(400)
await page.click('button:has-text("Under strands")')
await page.waitForTimeout(400)
await page.click('button:has-text("Ornament every junction")')
await page.waitForTimeout(1500)

const layers = () => page.evaluate(() => {
  const svg = document.querySelector('svg[data-pattern-canvas]')
  const under = document.querySelector('#junction-ornament-under-layer')
  const over = document.querySelector('#junction-ornament-world-layer')
  // A HOLLOW ornament carries its colour on the stroke and `fill="none"` —
  // reading `fill` alone reports "none" and looks like the colour never
  // resolved.
  const colourOf = layer => {
    const el = layer?.querySelector('path')
    if (!el) return null
    const fill = el.getAttribute('fill')
    return fill && fill !== 'none' ? fill : el.getAttribute('stroke')
  }
  const drawn = layer => (layer ? layer.querySelectorAll(':scope > path, :scope > use').length : 0)
  return {
    under: drawn(under),
    over: drawn(over),
    colour: colourOf(under) ?? colourOf(over),
    // DOM order decides what covers what.
    order: [...svg.querySelectorAll('g[id]')].map(g => g.id)
      .filter(id => id.includes('junction') || id === 'strand-layer'),
  }
})
const under = await layers()
console.log('MATCH + UNDER    ', JSON.stringify(under),
  under.under > 0 && under.over === 0 && under.colour === '#2e7d32'
    && under.order[0].includes('under')
    ? 'PASS — strand colour, drawn first'
    : 'FAIL')

await page.click('button:has-text("Over strands")')
await page.waitForTimeout(1400)
const over = await layers()
console.log('OVER             ', JSON.stringify(over.order),
  over.over > 0 && over.under === 0 && over.order[0] === 'strand-layer'
    ? 'PASS — drawn after the Strands'
    : 'FAIL')

// Repainting the Strands must carry the ornaments with it.
await page.click('button:has-text("Strands")')
await page.waitForTimeout(600)
await setColour('#8e24aa')
await page.waitForTimeout(400)
await page.click('button:has-text("Update strand colour"), button:has-text("Colour all strands")')
await page.waitForTimeout(1500)
const repainted = (await layers()).colour
console.log('FOLLOWS REPAINT  ', repainted, repainted === '#8e24aa' ? 'PASS' : 'FAIL')

// …and hiding them takes the ornaments too, or they would float.
await page.click('button:has-text("Remove strand colour")')
await page.waitForTimeout(1500)
console.log('HIDDEN STRANDS   ', await page.evaluate(() => !!document.querySelector('#junction-ornament-world-layer'))
  ? 'FAIL — ornaments left floating' : 'PASS — gone with the strands')

// ── An ASYMMETRIC field: the twinkle follows the bend ───────────────────
// Cairo pentagonal's threads kink ~15° at their contact points. That makes
// the four arms of a crossing NOT antiparallel — and the discriminating
// signal: a twinkle built from the real arms is not point-symmetric, while
// one rebuilt as ±through-direction always is, whatever the field does.
// (The geometry itself is pinned by `src/strand/junctionArms.test.ts`.)
const twinkleSymmetry = async () => page.evaluate(() => {
  const layer = document.querySelector('#junction-ornament-world-layer')
  if (!layer) return null
  const paths = [...layer.querySelectorAll(':scope > path')]
  const num = '-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?'
  let symmetric = 0
  for (const p of paths.slice(0, 200)) {
    const starts = [...p.getAttribute('d').matchAll(new RegExp(`M(${num}),(${num})`, 'g'))]
      .map(m => ({ x: Number(m[1]), y: Number(m[2]) }))
    const paired = starts.every(a =>
      starts.some(b => Math.hypot(b.x + a.x, b.y + a.y) < Math.hypot(a.x, a.y) * 0.02))
    if (paired) symmetric++
  }
  return { sampled: Math.min(paths.length, 200), symmetric, total: paths.length }
})

const straight = await twinkleSymmetry()

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.click('button:has-text("Cairo")')
await page.waitForTimeout(2500)
await page.click('button:has-text("Decoration")')
await page.waitForTimeout(900)
await page.click('button:has-text("Junctions")')
await page.waitForTimeout(1500)
const cairoCrossings = await markers()
await page.click('button:has-text("Twinkle")')
await page.waitForTimeout(400)
await page.click('button:has-text("Ornament every junction")')
await page.waitForTimeout(2000)
const bent = await twinkleSymmetry()
console.log('CAIRO ORNAMENTS  ', bent ? `${bent.total} of ${cairoCrossings} crossings` : 'LAYER ABSENT',
  bent && bent.total === cairoCrossings ? 'PASS — a legacy asymmetric substrate' : 'FAIL')
console.log('CAIRO BENT ARMS  ', bent && `${bent.symmetric}/${bent.sampled} point-symmetric`,
  bent && bent.symmetric < bent.sampled * 0.2
    ? 'PASS — the fillets follow the kink, not ±through-direction'
    : 'FAIL — twinkles are still point-symmetric on a bent field')

// ── The panel adopts the ornaments already on screen ────────────────────
// The records are pattern data, the selection is session state — so after a
// reload (or opening a saved pattern) there are ornaments on the canvas with
// nothing bound to the panel, and every control edits a draft that only
// matters on the NEXT canvas click. That reads exactly as the ornament
// ignoring the UI. Arriving at the target must re-bind to the last record and
// load its style, so the sliders show what is actually being drawn.
const firstFlare = () => page.evaluate(() =>
  document.querySelector('#junction-ornament-world-layer > path')?.getAttribute('d')?.slice(0, 40) ?? null)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
await page.click('button:has-text("Decoration")')
await page.waitForTimeout(900)
await page.click('button:has-text("Junctions")')
await page.waitForTimeout(1800)
const adopted = await page.evaluate(() => ({
  editingNote: document.body.innerText.includes('Editing the ornaments you last placed'),
  shape: [...document.querySelectorAll('button')]
    .filter(b => ['Dot', 'Star', 'Twinkle'].includes(b.textContent.trim()))
    .find(b => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)')?.textContent?.trim() ?? null,
}))
const beforeAdoptEdit = await firstFlare()
await setSlider('Reach along the strand', 60)
const afterAdoptEdit = await firstFlare()
console.log('ADOPTS ON RELOAD ', JSON.stringify(adopted),
  adopted.editingNote && adopted.shape === 'Twinkle' ? 'PASS — re-bound to what is drawn' : 'FAIL')
console.log('  controls live  ', `${beforeAdoptEdit} → ${afterAdoptEdit}`,
  afterAdoptEdit && afterAdoptEdit !== beforeAdoptEdit ? 'PASS' : 'FAIL — the panel is inert')

// "New ornament" must still detach — the adoption cannot re-bind what the
// user just asked to be free of.
await page.click('button:has-text("New ornament")')
await page.waitForTimeout(600)
const detached = await page.evaluate(() => ({
  editingNote: document.body.innerText.includes('Editing the ornaments you last placed'),
  says: document.body.innerText.includes('these settings apply to the next crossing you click'),
}))
console.log('NEW ORNAMENT     ', JSON.stringify(detached),
  !detached.editingNote && detached.says ? 'PASS — detached, and says so' : 'FAIL')

console.log('ERRORS           ', JSON.stringify(errs.slice(0, 5)))
await b.close()
