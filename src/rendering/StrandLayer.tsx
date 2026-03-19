import type { Segment } from '../types/geometry'
import type { LacingConfig } from '../types/pattern'

interface Props {
  segments: Segment[]
  lacing: LacingConfig
}

export function StrandLayer({ segments, lacing }: Props) {
  if (segments.length === 0) return null

  const { strandWidth, gapWidth, strandColor, gapColor } = lacing

  // Each segment renders its gap knock-out then its strand as a unit.
  // Later segments paint on top of earlier ones, so a later segment's
  // gap erases the earlier strand at crossings → visible over/under.
  return (
    <g id="strand-layer">
      {segments.map((seg, i) => (
        <g key={i}>
          {lacing.enabled && (
            <line
              x1={seg.from.x} y1={seg.from.y}
              x2={seg.to.x} y2={seg.to.y}
              stroke={gapColor}
              strokeWidth={strandWidth + gapWidth * 2}
              strokeLinecap="round"
            />
          )}
          <line
            x1={seg.from.x} y1={seg.from.y}
            x2={seg.to.x} y2={seg.to.y}
            stroke={strandColor}
            strokeWidth={strandWidth}
            strokeLinecap="round"
          />
        </g>
      ))}
    </g>
  )
}
