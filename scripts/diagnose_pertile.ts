import { TILINGS } from '../src/tilings/index'
import { generateTiling } from '../src/tilings/archimedean'
import { generateTapratsTiling } from '../src/tilings/tapratsTiling'
import { runPIC } from '../src/pic/index'
import type { Polygon } from '../src/types/geometry'
import type { PatternConfig } from '../src/types/pattern'

const viewport = { x: -5, y: -5, width: 10, height: 10 }
const edgeLen = 1.0

for (const [key, def] of Object.entries(TILINGS)) {
  let polygons: Polygon[]
  if (def.category === 'rosette-patch') {
    polygons = generateTapratsTiling(key, viewport, edgeLen)
  } else {
    polygons = generateTiling(def, viewport, edgeLen)
  }

  const config: PatternConfig = {
    tiling: { type: key, scale: edgeLen },
    figures: { ...def.defaultConfig.figures } as any,
    lacing: { enabled: false, width: 3, gap: 2, crossings: 'alternating' as const },
  }

  const segments = runPIC(polygons, config)

  // Count segments per polygon, grouped by polygon sides
  const segsByPolyId = new Map<string, number>()
  for (const s of segments) {
    segsByPolyId.set(s.polygonId, (segsByPolyId.get(s.polygonId) ?? 0) + 1)
  }

  const polysBySides = new Map<number, Polygon[]>()
  for (const p of polygons) {
    const list = polysBySides.get(p.sides) ?? []
    list.push(p)
    polysBySides.set(p.sides, list)
  }

  const details: string[] = []
  for (const [sides, polys] of [...polysBySides.entries()].sort((a, b) => a[0] - b[0])) {
    const segsPerPoly = polys.map(p => segsByPolyId.get(p.id) ?? 0)
    const zeros = segsPerPoly.filter(s => s === 0).length
    const avg = segsPerPoly.reduce((a, b) => a + b, 0) / segsPerPoly.length
    const expected = sides * 2
    const pct = (avg / expected * 100).toFixed(0)
    const warn = zeros > polys.length * 0.1 ? ` ⚠ ${zeros} empty` : ''
    details.push(`${sides}-gon: ${polys.length} polys, ${avg.toFixed(1)} segs/poly (${pct}% of ${expected})${warn}`)
  }

  console.log(`\n${key}:`)
  for (const d of details) console.log(`  ${d}`)
}
