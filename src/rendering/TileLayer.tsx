import type { Polygon } from '../types/geometry'

interface Props {
  polygons: Polygon[]
  visible: boolean
}

export function TileLayer({ polygons, visible }: Props) {
  if (!visible) return null
  return (
    <g id="tile-layer" opacity={0.45}>
      {polygons.map(poly => (
        <polygon
          key={poly.id}
          points={poly.vertices.map(v => `${v.x},${v.y}`).join(' ')}
          fill="none"
          stroke="#666"
          strokeWidth={0.8}
        />
      ))}
    </g>
  )
}
