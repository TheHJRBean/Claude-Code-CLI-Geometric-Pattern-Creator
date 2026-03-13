import type { Segment } from '../types/geometry'
import type { LacingConfig } from '../types/pattern'

interface Props {
  segments: Segment[]
  lacing: LacingConfig
}

export function StrandLayer({ segments, lacing }: Props) {
  if (segments.length === 0) return null

  const { strandWidth, gapWidth, strandColor, gapColor } = lacing

  return (
    <g id="strand-layer">
      {/* Pass 1: gap knock-out (thick background stroke) */}
      {lacing.enabled && segments.map((seg, i) => (
        <line
          key={`gap-${i}`}
          x1={seg.from.x} y1={seg.from.y}
          x2={seg.to.x} y2={seg.to.y}
          stroke={gapColor}
          strokeWidth={strandWidth + gapWidth * 2}
          strokeLinecap="round"
        />
      ))}
      {/* Pass 2: colored strands */}
      {segments.map((seg, i) => (
        <line
          key={`strand-${i}`}
          x1={seg.from.x} y1={seg.from.y}
          x2={seg.to.x} y2={seg.to.y}
          stroke={strandColor}
          strokeWidth={strandWidth}
          strokeLinecap="round"
        />
      ))}
    </g>
  )
}
