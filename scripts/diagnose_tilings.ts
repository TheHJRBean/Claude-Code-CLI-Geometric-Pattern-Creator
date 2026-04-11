import { TILINGS } from '../src/tilings/index'
import { generateTiling } from '../src/tilings/archimedean'
import { generateTapratsTiling } from '../src/tilings/tapratsTiling'
import type { Polygon } from '../src/types/geometry'
import { midpoint } from '../src/utils/math'

const viewport = { x: -10, y: -10, width: 20, height: 20 }
const edgeLen = 1.0

function edgeSharing(polygons: Polygon[]): { total: number; shared: number; pct: string } {
  const f = 1e3
  const counts = new Map<string, number>()
  let total = 0
  for (const poly of polygons) {
    for (let i = 0; i < poly.sides; i++) {
      const mid = midpoint(poly.vertices[i], poly.vertices[(i + 1) % poly.sides])
      const key = `${Math.round(mid.x * f)},${Math.round(mid.y * f)}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      total++
    }
  }
  let shared = 0
  for (const c of counts.values()) if (c >= 2) shared += c
  return { total, shared, pct: (shared / total * 100).toFixed(1) + '%' }
}

function sideBreakdown(polygons: Polygon[]): string {
  const counts = new Map<number, number>()
  for (const p of polygons) counts.set(p.sides, (counts.get(p.sides) ?? 0) + 1)
  return [...counts.entries()].sort((a,b) => a[0]-b[0]).map(([s,c]) => `${s}-gon:${c}`).join(' ')
}

for (const [key, def] of Object.entries(TILINGS)) {
  let polygons: Polygon[]
  if (def.category === 'rosette-patch') {
    polygons = generateTapratsTiling(key, viewport, edgeLen)
  } else {
    polygons = generateTiling(def, viewport, edgeLen)
  }
  const es = edgeSharing(polygons)
  console.log(`${key.padEnd(25)} | ${String(polygons.length).padStart(5)} polys | ${es.pct.padStart(6)} shared | ${sideBreakdown(polygons)}`)
}
