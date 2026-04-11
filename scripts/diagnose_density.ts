import { TILINGS } from '../src/tilings/index'
import { generateTiling } from '../src/tilings/archimedean'
import { generateTapratsTiling } from '../src/tilings/tapratsTiling'
import { runPIC } from '../src/pic/index'
import type { Polygon } from '../src/types/geometry'
import type { PatternConfig } from '../src/types/pattern'
import { midpoint } from '../src/utils/math'

const viewport = { x: -5, y: -5, width: 10, height: 10 }
const edgeLen = 1.0

function countGaps(polygons: Polygon[]): number {
  // Count edges that are not shared (only appear once)
  const f = 1e3
  const edgeCounts = new Map<string, number>()
  for (const poly of polygons) {
    for (let i = 0; i < poly.sides; i++) {
      const mid = midpoint(poly.vertices[i], poly.vertices[(i + 1) % poly.sides])
      const key = `${Math.round(mid.x * f)},${Math.round(mid.y * f)}`
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
    }
  }
  // Internal unshared edges (not boundary) indicate gaps
  // Boundary edges are expected - they're at the viewport edge
  // Interior unshared edges are suspicious
  let unshared = 0
  for (const c of edgeCounts.values()) if (c === 1) unshared++
  return unshared
}

console.log('Tiling                    | polys | segs | segs/poly | unshared edges | expected segs/poly')
console.log('-'.repeat(100))

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
  const ratio = segments.length / polygons.length
  const unshared = countGaps(polygons)

  // Expected: each polygon with n sides should produce 2n segments (2 per edge: one star arm pair)
  // But shared edges produce segments from both polygons, so expect ~2*avgSides per polygon
  const avgSides = polygons.reduce((s, p) => s + p.sides, 0) / polygons.length
  const expected = avgSides * 2

  const status = ratio < expected * 0.5 ? '⚠ LOW' : ratio < expected * 0.7 ? '⚡ MED' : '✓'

  console.log(
    `${key.padEnd(25)} | ${String(polygons.length).padStart(5)} | ${String(segments.length).padStart(5)} | ${ratio.toFixed(1).padStart(9)} | ${String(unshared).padStart(14)} | ${expected.toFixed(1).padStart(18)} ${status}`
  )
}
