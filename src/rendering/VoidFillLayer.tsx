import { memo } from 'react'
import type { Vec2 } from '../utils/math'
import type { VoidFill } from '../decoration/resolve'

/**
 * Step 19.2 — Decoration **Void Fill** layer. Paints each resolved Void as a
 * filled polygon. Drawn *behind* the Strands (ADR-0005 layer stack:
 * background → Void fills → Strands), so the strand lines stay crisp on top.
 * Unfilled Voids draw nothing and show the canvas background through.
 */
export const VoidFillLayer = memo(function VoidFillLayer({ fills }: { fills: VoidFill[] }) {
  if (fills.length === 0) return null
  return (
    <g id="void-fill-layer">
      {fills.map((f, i) => (
        <path key={i} d={polygonPath(f.polygon)} fill={f.colour} stroke="none" />
      ))}
    </g>
  )
})

function polygonPath(poly: Vec2[]): string {
  if (poly.length < 3) return ''
  return `M${poly.map(p => `${p.x},${p.y}`).join('L')}Z`
}
