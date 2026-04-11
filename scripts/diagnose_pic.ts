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

  // Check for anomalously long segments
  const lengths = segments.map(s => {
    const dx = s.to.x - s.from.x
    const dy = s.to.y - s.from.y
    return Math.sqrt(dx * dx + dy * dy)
  })
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const maxLen = Math.max(...lengths)
  const long = lengths.filter(l => l > avgLen * 3).length

  console.log(
    `${key.padEnd(25)} | ${String(polygons.length).padStart(4)} polys | ${String(segments.length).padStart(5)} segs | avg=${avgLen.toFixed(3)} max=${maxLen.toFixed(3)} | ${long} anomalous (>3x avg)`
  )
}
