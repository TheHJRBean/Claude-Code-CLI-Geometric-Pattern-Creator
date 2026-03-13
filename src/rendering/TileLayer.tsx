import type { Polygon } from '../types/geometry'

interface Props {
  polygons: Polygon[]
  visible: boolean
}

export function TileLayer({ polygons, visible }: Props) {
  if (!visible) return null
  return (
    <g id="tile-layer" opacity={0.15}>
      {polygons.map(poly => (
        <polygon
          key={poly.id}
          points={poly.vertices.map(v => `${v.x},${v.y}`).join(' ')}
          fill="none"
          stroke="#888"
          strokeWidth={0.5}
        />
      ))}
    </g>
  )
}
