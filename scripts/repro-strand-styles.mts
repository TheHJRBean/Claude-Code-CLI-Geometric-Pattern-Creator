/* Headless check of the StrandLayer line styles (double/triple via centre-cut
 * mask, dashed/dotted via dasharray) over painted Void fills — mirrors the
 * markup StrandLayer emits. */
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

function strandsMarkup(style: string): string {
  const stroke = '#1a1a2e'
  if (style === 'dashed') return `<path d="${segD}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="butt" stroke-dasharray="${w * 2.5} ${w * 1.5}"/>`
  if (style === 'dotted') return `<path d="${segD}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="0.01 ${w * 1.8}"/>`
  if (style === 'double' || style === 'triple') {
    const cut = style === 'triple' ? w * 0.65 : w * 0.5
    const centre = style === 'triple'
      ? `<path d="${segD}" fill="none" stroke="${stroke}" stroke-width="${w * 0.18}" stroke-linecap="round"/>` : ''
    return `<defs><mask id="m" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${H + 40}">
      <rect x="-20" y="-20" width="${W + 40}" height="${H + 40}" fill="white"/>
      <path d="${segD}" fill="none" stroke="black" stroke-width="${cut}" stroke-linecap="round" stroke-linejoin="round"/>
    </mask></defs>
    <g mask="url(#m)"><path d="${segD}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/></g>${centre}`
  }
  return `<path d="${segD}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`
}

for (const style of ['double', 'triple', 'dashed', 'dotted']) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f5f0e8"/>${fillPaths}${strandsMarkup(style)}</svg>`
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1100 } }).render().asPng()
  writeFileSync(`/tmp/strandstyle-${style}.png`, png)
  console.log(`wrote /tmp/strandstyle-${style}.png`)
}
