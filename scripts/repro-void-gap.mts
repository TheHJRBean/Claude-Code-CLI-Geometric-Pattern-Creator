/* Headless repro: do Void fills touch when strand paint is "removed"?
 * Renders three variants of the same field:
 *   A — fills + strands in the global colour (state after "Remove strand colour")
 *   B — fills only (strands not drawn)
 *   C — fills + strands painted gold (overlay)
 */
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { TILINGS } from '../src/tilings/index'
import { generateTiling } from '../src/tilings/archimedean'
import { runPIC } from '../src/pic/index'
import { extractVoids } from '../src/decoration/voids'
import type { PatternConfig } from '../src/types/pattern'

const config: PatternConfig = {
  tiling: { type: 'square', scale: 100 },
  figures: { 4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 } },
  strand: { width: 4, color: '#1a1a2e', background: '#f5f0e8' },
}

const W = 700, H = 500
const viewport = { x: 0, y: 0, width: W, height: H }
const polygons = generateTiling(TILINGS['square'], viewport, 100)
const segments = runPIC(polygons, config)
const bound = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]
const voids = extractVoids(segments, bound)
console.log(`polygons=${polygons.length} segments=${segments.length} voids=${voids.length}`)

const palette = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085']
const sigColour = new Map<string, string>()
for (const v of voids) {
  if (!sigColour.has(v.signature)) sigColour.set(v.signature, palette[sigColour.size % palette.length])
}

const fillPaths = voids.map(v =>
  `<path d="M${v.polygon.map(p => `${p.x},${p.y}`).join('L')}Z" fill="${sigColour.get(v.signature)}" stroke="none"/>`,
).join('\n')

const strandPaths = (colour: string) => segments.map(s =>
  `<line x1="${s.from.x}" y1="${s.from.y}" x2="${s.to.x}" y2="${s.to.y}" stroke="${colour}" stroke-width="4" stroke-linecap="round"/>`,
).join('\n')

function render(name: string, body: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f5f0e8"/>${body}</svg>`
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1400 } }).render().asPng()
  writeFileSync(`/tmp/voidgap-${name}.png`, png)
  console.log(`wrote /tmp/voidgap-${name}.png`)
}

render('A-global-strand', fillPaths + strandPaths('#1a1a2e'))
render('B-no-strand', fillPaths)
render('C-painted-strand', fillPaths + strandPaths('#d4af37'))
