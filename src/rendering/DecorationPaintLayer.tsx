import { useState } from 'react'
import type { Vec2 } from '../utils/math'
import type { VoidRegion } from '../decoration/voids'

/**
 * Step 19.3 — Decoration **Paint mode** canvas overlay. Renders one transparent
 * hit-target per **Void**; hovering one faintly highlights its whole **congruent
 * group** (every Void sharing the signature) in the active colour so the user
 * sees the blast radius, and clicking **Fill**s that group (`onPaint(signature)`).
 *
 * Rendered topmost (via PatternSVG's overlay slot) and uses `onPointerDown` so
 * the click beats the pan handler and the strand strokes painted below.
 *
 * Hover-highlight is live here (Void counts are small — tens per view). The
 * spec's perf-gated "highlight on first click instead" fallback is a future
 * refinement if large fields jank.
 */
export function DecorationPaintLayer({
  voids,
  activeColor,
  onPaint,
}: {
  voids: VoidRegion[]
  activeColor: string
  onPaint: (signature: string) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  return (
    <g id="decoration-paint-layer">
      {hovered !== null && voids.filter(v => v.signature === hovered).map((v, i) => (
        <path
          key={`hl-${i}`}
          d={polygonPath(v.polygon)}
          fill={activeColor}
          fillOpacity={0.35}
          stroke={activeColor}
          strokeOpacity={0.95}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))}
      {voids.map((v, i) => (
        <path
          key={i}
          d={polygonPath(v.polygon)}
          fill="transparent"
          stroke="none"
          style={{ cursor: BUCKET_CURSOR }}
          onPointerEnter={() => setHovered(v.signature)}
          onPointerLeave={() => setHovered(h => (h === v.signature ? null : h))}
          onPointerDown={e => { e.stopPropagation(); onPaint(v.signature) }}
        />
      ))}
    </g>
  )
}

function polygonPath(poly: Vec2[]): string {
  if (poly.length < 3) return ''
  return `M${poly.map(p => `${p.x},${p.y}`).join('L')}Z`
}

/** A small paint-bucket cursor so the user sees they're in Paint mode. */
const BUCKET_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M11 3l8 8-7 7-8-8z' fill='%23d4af37' stroke='%23222' stroke-width='1.2' stroke-linejoin='round'/><path d='M19.5 13c.9 1.6 1.7 2.6 1.7 3.6a1.7 1.7 0 11-3.4 0c0-1 .8-2 1.7-3.6z' fill='%23d4af37' stroke='%23222' stroke-width='1'/></svg>\") 3 20, pointer"
