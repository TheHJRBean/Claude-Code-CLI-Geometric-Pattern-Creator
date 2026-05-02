import { forwardRef } from 'react'
import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { ViewTransform } from '../hooks/usePanZoom'
import type { PanZoomHandlers } from '../hooks/usePanZoom'
import type { CompositionRender } from '../hooks/usePattern'
import { TileLayer } from './TileLayer'
import { StrandLayer } from './StrandLayer'
import { ControlPointLayer } from './ControlPointLayer'

interface Props {
  polygons: Polygon[]
  segments: Segment[]
  composition?: CompositionRender
  config: PatternConfig
  viewTransform: ViewTransform
  containerWidth: number
  containerHeight: number
  showTileLayer: boolean
  showLines: boolean
  handlers: PanZoomHandlers
  cpVisible: Record<string, boolean>
  cpActive: Record<string, number>
}

function polygonPoints(poly: Polygon): string {
  return poly.vertices.map(v => `${v.x},${v.y}`).join(' ')
}

export const PatternSVG = forwardRef<SVGSVGElement, Props>(function PatternSVG(
  { polygons, segments, composition, config, viewTransform, containerWidth, containerHeight, showTileLayer, showLines, handlers, cpVisible, cpActive },
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
      {composition && (
        <defs>
          <clipPath id="composition-region" clipPathUnits="userSpaceOnUse">
            <polygon points={polygonPoints(composition.regionPolygon)} />
          </clipPath>
          {/* Background mask = full viewport rect with the region polygon
              punched out via even-odd fill rule. */}
          <clipPath id="composition-background" clipPathUnits="userSpaceOnUse">
            <path
              d={`M ${x} ${y} h ${vw} v ${vh} h ${-vw} Z M ${composition.regionPolygon.vertices.map((v, i) => (i === 0 ? `${v.x} ${v.y}` : `L ${v.x} ${v.y}`)).join(' ')} Z`}
              clipRule="evenodd"
            />
          </clipPath>
        </defs>
      )}
      <g transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
        {composition ? (
          <>
            <g clipPath="url(#composition-background)">
              <TileLayer polygons={composition.backgroundPolygons} visible={showTileLayer} />
              {showLines && <StrandLayer segments={composition.backgroundSegments} config={config} />}
            </g>
            <g clipPath="url(#composition-region)">
              <TileLayer polygons={composition.centrePolygons} visible={showTileLayer} />
              {showLines && <StrandLayer segments={composition.centreSegments} config={config} />}
            </g>
            {composition.frameEnabled && (
              <polygon
                points={polygonPoints(composition.regionPolygon)}
                fill="none"
                stroke={composition.frameColor}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </>
        ) : (
          <>
            <TileLayer polygons={polygons} visible={showTileLayer} />
            {showLines && <StrandLayer segments={segments} config={config} />}
          </>
        )}
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
