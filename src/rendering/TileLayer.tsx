import { useState } from 'react'
import type { Polygon } from '../types/geometry'

interface Props {
  polygons: Polygon[]
  visible: boolean
  /** Stroke weight for the polygon outlines, in viewBox units. */
  outlineWidth?: number
  /** When true, hovering a polygon fills it with the accent colour. */
  fillOnHover?: boolean
}

export function TileLayer({ polygons, visible, outlineWidth = 0.8, fillOnHover = false }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  if (!visible) return null
  return (
    <g id="tile-layer" opacity={0.45}>
      {polygons.map(poly => {
        const hovered = fillOnHover && hoverId === poly.id
        return (
          <polygon
            key={poly.id}
            points={poly.vertices.map(v => `${v.x},${v.y}`).join(' ')}
            fill={hovered ? 'var(--accent)' : 'none'}
            fillOpacity={hovered ? 0.25 : undefined}
            stroke="#666"
            strokeWidth={outlineWidth}
            vectorEffect="non-scaling-stroke"
            onMouseEnter={fillOnHover ? () => setHoverId(poly.id) : undefined}
            onMouseLeave={fillOnHover ? () => setHoverId(null) : undefined}
            style={fillOnHover ? { cursor: 'crosshair' } : undefined}
          />
        )
      })}
    </g>
  )
}
