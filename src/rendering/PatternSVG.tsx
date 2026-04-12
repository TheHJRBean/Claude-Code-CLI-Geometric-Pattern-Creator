import { forwardRef } from 'react'
import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { ViewTransform } from '../hooks/usePanZoom'
import type { PanZoomHandlers } from '../hooks/usePanZoom'
import { TileLayer } from './TileLayer'
import { StrandLayer } from './StrandLayer'

interface Props {
  polygons: Polygon[]
  segments: Segment[]
  config: PatternConfig
  viewTransform: ViewTransform
  containerWidth: number
  containerHeight: number
  showTileLayer: boolean
  handlers: PanZoomHandlers
}

export const PatternSVG = forwardRef<SVGSVGElement, Props>(function PatternSVG(
  { polygons, segments, config, viewTransform, containerWidth, containerHeight, showTileLayer, handlers },
  ref
) {
  const { x, y, zoom } = viewTransform
  const vw = containerWidth / zoom
  const vh = containerHeight / zoom
  const viewBox = `${x} ${y} ${vw} ${vh}`

  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      width={containerWidth}
      height={containerHeight}
      style={{ display: 'block', background: config.lacing.gapColor, cursor: 'grab', userSelect: 'none' }}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
    >
      <TileLayer polygons={polygons} visible={showTileLayer} />
      <StrandLayer segments={segments} config={config} />
    </svg>
  )
})
