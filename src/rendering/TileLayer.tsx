import { memo } from 'react'
import type { Polygon } from '../types/geometry'

interface Props {
  polygons: Polygon[]
  visible: boolean
  /** Stroke weight for the polygon outlines, in viewBox units. */
  outlineWidth?: number
}

// Memoised: PatternSVG re-renders on every pan/zoom frame (live viewTransform →
// viewBox), but the polygon set only changes when the geometry does. Bailing on
// referentially-stable props keeps panning a large field from re-creating
// thousands of <polygon> nodes each frame.
export const TileLayer = memo(function TileLayer({ polygons, visible, outlineWidth = 0.8 }: Props) {
  if (!visible) return null
  return (
    <g id="tile-layer" opacity={0.45}>
      {polygons.map(poly => (
        <polygon
          key={poly.id}
          points={poly.vertices.map(v => `${v.x},${v.y}`).join(' ')}
          fill="none"
          stroke="#666"
          strokeWidth={outlineWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
})
