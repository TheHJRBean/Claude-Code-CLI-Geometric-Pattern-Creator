import type { Segment } from '../types/geometry'
import type { LacingConfig } from '../types/pattern'

interface Props {
  segments: Segment[]
  lacing: LacingConfig
}

export function StrandLayer({ segments, lacing }: Props) {
  if (segments.length === 0) return null

  const { strandWidth, gapWidth, strandColor, gapColor } = lacing
  const gapStrokeW = strandWidth + gapWidth * 2
  // Inset gap strokes from each endpoint so they don't create breaks
  // at shared vertices. Half the gap stroke width keeps the butt end
  // well clear of the junction while still covering mid-segment crossings.
  const inset = gapStrokeW * 0.5

  return (
    <g id="strand-layer">
      {segments.map((seg, i) => {
        let gapEl: React.ReactNode = null

        if (lacing.enabled) {
          const dx = seg.to.x - seg.from.x
          const dy = seg.to.y - seg.from.y
          const len = Math.sqrt(dx * dx + dy * dy)

          // Only render gap if the segment is long enough after insetting
          if (len > inset * 2.5) {
            const nx = dx / len
            const ny = dy / len
            gapEl = (
              <line
                x1={seg.from.x + nx * inset} y1={seg.from.y + ny * inset}
                x2={seg.to.x - nx * inset}   y2={seg.to.y - ny * inset}
                stroke={gapColor}
                strokeWidth={gapStrokeW}
                strokeLinecap="butt"
              />
            )
          }
        }

        return (
          <g key={i}>
            {gapEl}
            <line
              x1={seg.from.x} y1={seg.from.y}
              x2={seg.to.x}   y2={seg.to.y}
              stroke={strandColor}
              strokeWidth={strandWidth}
              strokeLinecap="round"
            />
          </g>
        )
      })}
    </g>
  )
}
