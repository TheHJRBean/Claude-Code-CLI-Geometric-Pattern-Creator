/* Headless check of the StrandLayer `'lines'` style — parallel lines carved
 * out of the stroke by the alternating mask bands — over painted Void fills.
 * Calls the production `strandStyleAttrs`, so the only thing mirrored here is
 * the markup StrandLayer emits around it. */
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { TILINGS } from '../src/tilings/index'
import { generateTiling } from '../src/tilings/archimedean'
import { runPIC } from '../src/pic/index'
import { extractVoids } from '../src/decoration/voids'
import { strandStyleAttrs } from '../src/rendering/strandStyle'
import type { PatternConfig } from '../src/types/pattern'

const OUT = process.env.OUT_DIR ?? '/tmp'

const config: PatternConfig = {
  tiling: { type: 'square', scale: 100 },
  figures: { 4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 } },
  strand: { width: 6, color: '#1a1a2e', background: '#f5f0e8' },
}

const W = 500, H = 360
const polygons = generateTiling(TILINGS['square'], { x: 0, y: 0, width: W, height: H }, 100)
const segments = runPIC(polygons, config)
const bound = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]
const voids = extractVoids(segments, bound)

const palette = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad']
const sigColour = new Map<string, string>()
for (const v of voids) {
  if (!sigColour.has(v.signature)) sigColour.set(v.signature, palette[sigColour.size % palette.length])
}
const fillPaths = voids.map(v =>
  `<path d="M${v.polygon.map(p => `${p.x},${p.y}`).join('L')}Z" fill="${sigColour.get(v.signature)}"/>`,
).join('')

const w = config.strand.width
const segD = segments.map(s => `M${s.from.x},${s.from.y}L${s.to.x},${s.to.y}`).join('')

function strandsMarkup(count: number, ratio: number, innerFill?: string): string {
  const stroke = '#1a1a2e'
  const { masked, maskBands, innerFillWidth } =
    strandStyleAttrs(count <= 1 ? 'solid' : 'lines', w, ratio, count)
  if (!masked) return `<path d="${segD}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`
  const bands = maskBands.map((band, b) =>
    `<path d="${segD}" fill="none" stroke="${b % 2 === 0 ? 'black' : 'white'}" stroke-width="${band}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ).join('')
  const under = innerFill
    ? `<path d="${segD}" fill="none" stroke="${innerFill}" stroke-width="${innerFillWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
    : ''
  return `<defs><mask id="m" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${H + 40}">
    <rect x="-20" y="-20" width="${W + 40}" height="${H + 40}" fill="white"/>${bands}
  </mask></defs>${under}
  <g mask="url(#m)"><path d="${segD}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/></g>`
}

const cases: { name: string; count: number; ratio: number; innerFill?: string }[] = [
  { name: '2-classic', count: 2, ratio: 0.5 },   // the withdrawn `double`
  { name: '2-equal', count: 2, ratio: 1 },
  { name: '3-equal', count: 3, ratio: 1 },
  { name: '4-thin', count: 4, ratio: 0.4 },
  { name: '5-equal', count: 5, ratio: 1 },
  { name: '10-thick', count: 10, ratio: 3 },
  { name: '4-innerfill', count: 4, ratio: 1, innerFill: '#f2d94e' },
]

for (const c of cases) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f5f0e8"/>${fillPaths}${strandsMarkup(c.count, c.ratio, c.innerFill)}</svg>`
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1100 } }).render().asPng()
  writeFileSync(`${OUT}/strandstyle-${c.name}.png`, png)
  console.log(`wrote ${OUT}/strandstyle-${c.name}.png`)
}
