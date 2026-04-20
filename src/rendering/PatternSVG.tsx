import { forwardRef } from 'react'
import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { ViewTransform } from '../hooks/usePanZoom'
import type { PanZoomHandlers } from '../hooks/usePanZoom'
import { TileLayer } from './TileLayer'
import { StrandLayer } from './StrandLayer'
import { ControlPointLayer, type ActiveCurvePoint } from './ControlPointLayer'

interface Props {
  polygons: Polygon[]
  segments: Segment[]
  config: PatternConfig
  viewTransform: ViewTransform
  containerWidth: number
  containerHeight: number
  showTileLayer: boolean
  handlers: PanZoomHandlers
  activeCurvePoint: ActiveCurvePoint | null
}

export const PatternSVG = forwardRef<SVGSVGElement, Props>(function PatternSVG(
  { polygons, segments, config, viewTransform, containerWidth, containerHeight, showTileLayer, handlers, activeCurvePoint },
  ref
) {
  const { x, y, zoom, rotation } = viewTransform
  const vw = containerWidth / zoom
  const vh = containerHeight / zoom
  const viewBox = `${x} ${y} ${vw} ${vh}`
  // Rotate around the center of the current viewport
  const cx = x + vw / 2
  const cy = y + vh / 2

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
      <g transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
        <TileLayer polygons={polygons} visible={showTileLayer} />
        <StrandLayer segments={segments} config={config} />
        <ControlPointLayer
          segments={segments}
          config={config}
          active={activeCurvePoint}
          zoom={zoom}
        />
      </g>
    </svg>
  )
})
