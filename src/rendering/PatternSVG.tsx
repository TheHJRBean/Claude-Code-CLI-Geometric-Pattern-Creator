import { forwardRef } from 'react'
import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
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
  /**
   * Builder Patch Boundary outlines (Step 17.2+). Drawn as dashed outlines
   * below Tiles. One per Cell in the Design Phase; one per Cell per lattice
   * stamp in the Composition Phase when the boundary-lattice toggle is on.
   */
  boundaryOutlines?: Vec2[][]
  /**
   * Count of leading `boundaryOutlines` entries that belong to the seed
   * Patch (the rest are neighbour-stamp ghosts). Seed outlines render with
   * a solid stroke + full accent opacity; ghosts keep the dimmed dashed
   * style so the Patch under the user's cursor is the obvious focal area
   * when Show neighbours is on. Undefined → render every outline as a seed.
   */
  seedOutlineCount?: number
  /**
   * Builder neighbour-preview ghost polygons (Step 17.6d). Drawn at low
   * opacity below the main Tile layer; non-interactive.
   */
  ghostPolygons?: Polygon[]
  /**
   * Polygon ids belonging to neighbour-stamp ghosts. When defined, StrandLayer
   * greys out Strands wholly inside the ghost ring; Strands that touch any
   * seed polygon (the cross-boundary ones) stay full colour.
   */
  ghostPolygonIds?: Set<string>
  /** Editor-mode interactive overlay (Step 17.3+). Rendered above the tile layer. */
  editorOverlay?: React.ReactNode
  /**
   * Step 17 Framing — Shape **Frame** outline (world space). When present, the
   * pattern content (Tiles + Strands) is clipped to it and the outline is
   * stroked on top. Undefined / null ⇒ no Frame.
   */
  frameOutline?: Vec2[] | null
}

export const PatternSVG = forwardRef<SVGSVGElement, Props>(function PatternSVG(
  { polygons, segments, config, viewTransform, containerWidth, containerHeight, showTileLayer, showLines, handlers, cpVisible, cpActive, outlineWidth, boundaryOutlines, seedOutlineCount, ghostPolygons, ghostPolygonIds, editorOverlay, frameOutline },
  ref
) {
  const { x, y, zoom, rotation } = viewTransform
  const vw = containerWidth / zoom
  const vh = containerHeight / zoom
  const viewBox = `${x} ${y} ${vw} ${vh}`
  const cx = x + vw / 2
  const cy = y + vh / 2

  const hasFrame = !!frameOutline && frameOutline.length >= 3
  const framePoints = hasFrame ? frameOutline!.map(v => `${v.x},${v.y}`).join(' ') : ''
  const frameClipId = 'pattern-frame-clip'

  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      width={containerWidth}
      height={containerHeight}
      style={{ display: 'block', background: config.strand.background, cursor: 'grab', userSelect: 'none' }}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
    >
      <g transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
        {hasFrame && (
          <defs>
            <clipPath id={frameClipId} clipPathUnits="userSpaceOnUse">
              <polygon points={framePoints} />
            </clipPath>
          </defs>
        )}
        {ghostPolygons && ghostPolygons.length > 0 && (
          <g opacity={0.18} pointerEvents="none">
            <TileLayer polygons={ghostPolygons} visible={showTileLayer} outlineWidth={outlineWidth} />
          </g>
        )}
        {/* Step 17 Framing — pattern content is clipped to the Shape Frame
            outline when one is set. */}
        <g clipPath={hasFrame ? `url(#${frameClipId})` : undefined}>
          {boundaryOutlines && boundaryOutlines.map((outline, i) => {
            // Seed outlines (first `seedOutlineCount` entries when defined) get
            // the prominent solid style so the active Patch reads as the focal
            // area. Ghost outlines (the rest) stay in the original dimmed dash.
            const isSeed = seedOutlineCount === undefined || i < seedOutlineCount
            return <BoundaryOutline key={i} vertices={outline} variant={isSeed ? 'seed' : 'ghost'} />
          })}
          <TileLayer polygons={polygons} visible={showTileLayer} outlineWidth={outlineWidth} />
          {showLines && <StrandLayer segments={segments} config={config} ghostPolygonIds={ghostPolygonIds} />}
          <ControlPointLayer
            segments={segments}
            config={config}
            visible={cpVisible}
            active={cpActive}
            zoom={zoom}
          />
        </g>
        {hasFrame && (
          <polygon
            points={framePoints}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.2}
            strokeOpacity={0.95}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {/* 17.11 — editorOverlay must be the topmost interactive layer so
            vertex dots at neighbour-stamp coordinates aren't blocked by
            strand strokes painted above. ControlPointLayer is already
            pointerEvents="none" so order vs it is purely visual. */}
        {editorOverlay}
      </g>
    </svg>
  )
})

/**
 * Editor-mode patch boundary outline, non-interactive.
 *
 * - `seed` (default): the active Patch's own Cell boundaries — solid stroke
 *   at full accent opacity and slightly heavier weight, so the seed reads
 *   as the focal area when Show neighbours stamps ghost Cells around it.
 * - `ghost`: a neighbour-stamp Cell boundary — keeps the original dashed
 *   dim style.
 */
function BoundaryOutline({ vertices, variant = 'seed' }: { vertices: Vec2[]; variant?: 'seed' | 'ghost' }) {
  if (vertices.length < 3) return null
  const points = vertices.map(v => `${v.x},${v.y}`).join(' ')
  const isSeed = variant === 'seed'
  return (
    <polygon
      points={points}
      fill="none"
      stroke="var(--accent)"
      strokeOpacity={isSeed ? 0.95 : 0.3}
      strokeWidth={isSeed ? 1.8 : 1.0}
      strokeDasharray={isSeed ? undefined : '4 4'}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  )
}
