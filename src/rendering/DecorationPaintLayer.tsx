import { useState } from 'react'
import type { Vec2 } from '../utils/math'
import type { Segment } from '../types/geometry'
import type { VoidRegion } from '../decoration/voids'

export type PaintTarget = 'off' | 'voids' | 'strands'

/**
 * Step 19.3 — Decoration **Paint mode** canvas overlay. A manual **Paint target**
 * (Off · Voids · Strands) decides what is clickable so Voids and Strands never
 * fight over the cursor (and Off lets the user pan freely):
 *
 * - **Voids**: one transparent hit-target per Void; hovering one faintly
 *   highlights its whole **congruent group** in the active colour and a click
 *   **Fill**s the group (`onPaintVoid(signature)`).
 * - **Strands**: thick transparent hit-targets over every Ray; hovering any
 *   highlights *all* Strands (one Congruent group in Stage 1) and a click
 *   colours them (`onPaintStrands()`).
 *
 * Rendered topmost (PatternSVG's overlay slot) and uses `onPointerDown` so the
 * click beats the pan handler and the strokes painted below.
 */
export function DecorationPaintLayer({
  target,
  voids,
  segments,
  activeColor,
  zoom,
  onPaintVoid,
  onPaintStrands,
}: {
  target: PaintTarget
  voids: VoidRegion[]
  segments: Segment[]
  activeColor: string
  zoom: number
  onPaintVoid: (signature: string) => void
  onPaintStrands: () => void
}) {
  const [hoveredSig, setHoveredSig] = useState<string | null>(null)
  const [hoverStrands, setHoverStrands] = useState(false)

  if (target === 'voids') {
    return (
      <g id="decoration-paint-layer">
        {hoveredSig !== null && voids.filter(v => v.signature === hoveredSig).map((v, i) => (
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
            onPointerEnter={() => setHoveredSig(v.signature)}
            onPointerLeave={() => setHoveredSig(h => (h === v.signature ? null : h))}
            onPointerDown={e => { e.stopPropagation(); onPaintVoid(v.signature) }}
          />
        ))}
      </g>
    )
  }

  if (target === 'strands') {
    // Constant ~10px screen hit width regardless of zoom.
    const hitWidth = 10 / zoom
    return (
      <g id="decoration-paint-layer">
        {hoverStrands && segments.map((s, i) => (
          <line
            key={`hl-${i}`}
            x1={s.from.x} y1={s.from.y} x2={s.to.x} y2={s.to.y}
            stroke={activeColor}
            strokeOpacity={0.9}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
        {segments.map((s, i) => (
          <line
            key={i}
            x1={s.from.x} y1={s.from.y} x2={s.to.x} y2={s.to.y}
            stroke="transparent"
            strokeWidth={hitWidth}
            strokeLinecap="round"
            style={{ cursor: BUCKET_CURSOR }}
            onPointerEnter={() => setHoverStrands(true)}
            onPointerLeave={() => setHoverStrands(false)}
            onPointerDown={e => { e.stopPropagation(); onPaintStrands() }}
          />
        ))}
      </g>
    )
  }

  return null
}

function polygonPath(poly: Vec2[]): string {
  if (poly.length < 3) return ''
  return `M${poly.map(p => `${p.x},${p.y}`).join('L')}Z`
}

/** A small paint-bucket cursor so the user sees they're in Paint mode. */
const BUCKET_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M11 3l8 8-7 7-8-8z' fill='%23d4af37' stroke='%23222' stroke-width='1.2' stroke-linejoin='round'/><path d='M19.5 13c.9 1.6 1.7 2.6 1.7 3.6a1.7 1.7 0 11-3.4 0c0-1 .8-2 1.7-3.6z' fill='%23d4af37' stroke='%23222' stroke-width='1'/></svg>\") 3 20, pointer"
