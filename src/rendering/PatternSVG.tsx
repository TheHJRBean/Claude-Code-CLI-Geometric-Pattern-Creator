import { forwardRef } from 'react'
import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { ViewTransform } from '../hooks/usePanZoom'
import type { PanZoomHandlers } from '../hooks/usePanZoom'
import { TileLayer } from './TileLayer'
import { StrandLayer } from './StrandLayer'
import { ControlPointLayer } from './ControlPointLayer'

interface Props {
  polygons: Polygon[]
  segments: Segment[]
  config: PatternConfig
  viewTransform: ViewTransform
  containerWidth: number
  containerHeight: number
  showTileLayer: boolean
  showLines: boolean
  handlers: PanZoomHandlers
  cpVisible: Record<string, boolean>
  cpActive: Record<string, number>
  outlineWidth?: number
  fillOnHover?: boolean
}

export const PatternSVG = forwardRef<SVGSVGElement, Props>(function PatternSVG(
  { polygons, segments, config, viewTransform, containerWidth, containerHeight, showTileLayer, showLines, handlers, cpVisible, cpActive, outlineWidth, fillOnHover },
  ref
) {
  const { x, y, zoom, rotation } = viewTransform
  const vw = containerWidth / zoom
  const vh = containerHeight / zoom
  const viewBox = `${x} ${y} ${vw} ${vh}`
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
        <TileLayer polygons={polygons} visible={showTileLayer} outlineWidth={outlineWidth} fillOnHover={fillOnHover} />
        {showLines && <StrandLayer segments={segments} config={config} />}
        <ControlPointLayer
          segments={segments}
          config={config}
          visible={cpVisible}
          active={cpActive}
          zoom={zoom}
        />
      </g>
    </svg>
  )
})
