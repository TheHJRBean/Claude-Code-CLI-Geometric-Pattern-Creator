import { chromium } from 'playwright-core'
const CHROME = '/home/harry/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const b = await chromium.launch({ executablePath: CHROME })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.click('button:has-text("Square-Octagon 4.8.8")'); await page.waitForTimeout(2500)
for (let i = 0; i < 3; i++) { await page.click('button:has-text("−")'); await page.waitForTimeout(250) }

const toClient = (wx, wy) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('svg[data-pattern-canvas]')
  const p = svg.createSVGPoint(); p.x = x; p.y = y
  const c = p.matrixTransform(svg.getScreenCTM()); return { x: c.x, y: c.y }
}, [wx, wy])
const clickWorld = async (x, y) => { const c = await toClient(x, y); await page.mouse.click(c.x, c.y); await page.waitForTimeout(450) }

// Tile polygons + their world centroids, straight off the tile layer.
const tiles = () => page.evaluate(() => {
  const layer = document.querySelector('#tile-layer')
  if (!layer) return []
  return [...layer.querySelectorAll('polygon')].map(p => {
    const pts = p.getAttribute('points').trim().split(/\s+/).map(s => s.split(',').map(Number))
    const n = pts.length
    const cx = pts.reduce((a, q) => a + q[0], 0) / n
    const cy = pts.reduce((a, q) => a + q[1], 0) / n
    return { n, cx: +cx.toFixed(1), cy: +cy.toFixed(1) }
  })
})

const selects = await page.$$('select')
await selects[2].selectOption('full')            // SQUARE Cell → Full
await page.waitForTimeout(700)

await page.click('button:has-text("Construct")'); await page.waitForTimeout(500)
await page.click('button:has-text("Line")'); await page.waitForTimeout(300)
await clickWorld(50, 120.71); await clickWorld(195, 120.71)
await page.waitForTimeout(800)

// Select the drawn Guide (click along it, away from its handles) and turn its
// stamp on — the stamping path is what routes a placement through the host
// Cell's symmetry orbit, which is the #34 regression surface.
await clickWorld(160, 120.71)
await page.waitForTimeout(700)
const beforeToggle = await page.$$eval('input[type=checkbox]', cs => cs.map(c => [c.closest('label')?.textContent?.trim().slice(0, 26) ?? '?', c.checked]))
console.log('GUIDE POPUP CHECKBOXES:', JSON.stringify(beforeToggle))
for (const [label] of beforeToggle) {
  if (/stamp|repeat/i.test(label)) {
    await page.click(`label:has-text("${label}") input[type=checkbox]`)
    await page.waitForTimeout(600)
    break
  }
}
console.log('AFTER TOGGLE:', JSON.stringify(await page.$$eval('input[type=checkbox]', cs => cs.map(c => [c.closest('label')?.textContent?.trim().slice(0, 26) ?? '?', c.checked]))))
console.log('TILES BEFORE:', JSON.stringify(await tiles()))

await page.click('button:has-text("Place")'); await page.waitForTimeout(900)

// Anchor dots live in the vertex-placement layer; read their world positions.
console.log('LAYERS', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('svg[data-pattern-canvas] g[id]')].map(g => ({ id: g.id, kids: g.children.length, tags: [...new Set([...g.querySelectorAll('*')].map(e => e.tagName))].join(',') })))))
const anchors = await page.evaluate(() => {
  const layer = document.querySelector('#editor-vertex-placement-layer')
  if (!layer) return []
  return [...layer.querySelectorAll('rect')].map(r => {
    const x = +r.getAttribute('x'), y = +r.getAttribute('y')
    const w = +r.getAttribute('width'), h = +r.getAttribute('height')
    const t = r.closest('g[transform]')?.getAttribute('transform') || ''
    return { cx: +(x + w / 2).toFixed(1), cy: +(y + h / 2).toFixed(1), fill: r.getAttribute('fill'), transform: t, parent: 'vpl' }
  })
})
const inSquare = anchors.filter(a => Math.hypot(a.cx - 120.71, a.cy - 120.71) < 60)
console.log('ANCHORS total', anchors.length, 'groups', JSON.stringify([...new Set(anchors.map(a => a.parent))]))
console.log('ANCHORS inside the square Cell:', JSON.stringify(inSquare.slice(0, 8)))

if (inSquare.length) {
  const a = inSquare[0]
  await clickWorld(a.cx, a.cy)
  await page.waitForTimeout(900)
  const bodyText = await page.$eval('body', e => e.innerText)
  console.log('PICKER OPEN:', /PLACE AT ANCHOR/i.test(bodyText))
  // Pick the triangle (badged, since the anchor sits on the seed Tile's centre).
  const three = await page.$$('button')
  for (const btn of three) {
    const t = (await btn.textContent()).trim()
    if (t === '3' || t === '⚠3' || t === '⚠ 3') { await btn.click(); break }
  }
  await page.waitForTimeout(700)
  console.log('AFTER SHAPE PICK:', (await page.$eval('body', e => e.innerText)).slice(-260).replace(/\n/g, ' | '))
  await page.screenshot({ path: 'shot-orient.png' })
  // Commit: the picker's own "Place" is the LAST such button (the first is the
  // Tool selector in the sidebar).
  const places = await page.$$('button')
  const placeBtns = []
  for (const btn of places) if ((await btn.textContent()).trim() === 'Place') placeBtns.push(btn)
  console.log('PLACE BUTTONS:', placeBtns.length)
  if (placeBtns.length) { await placeBtns[placeBtns.length - 1].click(); await page.waitForTimeout(800) }
  const accept = await page.$('button:has-text("Accept")')
  if (accept) { await accept.click(); await page.waitForTimeout(1000); console.log('ACCEPTED overlap') }
  else console.log('NO overlap modal (committed directly)')
  await page.waitForTimeout(900)
  const after = await tiles()
  console.log('TILES AFTER:', JSON.stringify(after))
  const tri = after.filter(t => t.n === 3)
  console.log('TRIANGLES:', tri.length)
  const far = tri.filter(t => Math.hypot(t.cx - 120.71, t.cy - 120.71) > 120)
  console.log('TRIANGLES FAR FROM THE SQUARE CELL (the old bug):', JSON.stringify(far))
  await page.screenshot({ path: 'shot-placed.png' })
  await page.screenshot({ path: 'shot-picker.png' })
}
console.log('ERRORS', JSON.stringify(errs.slice(0, 3)))
await b.close()
