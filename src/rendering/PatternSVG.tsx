import { forwardRef } from 'react'
import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import type { ViewTransform } from '../hooks/usePanZoom'
import type { PanZoomHandlers } from '../hooks/usePanZoom'
import type { LatticeStamp } from '../editor/lattice'
import { TileLayer } from './TileLayer'
import { StrandLayer } from './StrandLayer'
import { ControlPointLayer } from './ControlPointLayer'
import { VoidFillLayer } from './VoidFillLayer'
import type { VoidFill } from '../decoration/resolve'
import type { ColourRecord } from '../types/editor'

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
  /**
   * Lever A periodicity fast-path (flagged). When present, `polygons` +
   * `segments` are ONE fundamental domain and the Composition field is rendered
   * by tiling that domain at these stamp translations via SVG `<use>` — so the
   * heavy TileLayer/StrandLayer render once and the browser clones them. Pure
   * translations only (usePattern guarantees `rotation === 0`).
   */
  compositionStamps?: LatticeStamp[]
  /** Editor-mode interactive overlay (Step 17.3+). Rendered above the tile layer. */
  editorOverlay?: React.ReactNode
  /**
   * Shape **Frame** outline (world space). When present the outline is stroked
   * on top and its nodes drawn. Whether the pattern content is *clipped* to it
   * is controlled separately by `clipToFrame`. Undefined / null ⇒ no Frame.
   */
  frameOutline?: Vec2[] | null
  /**
   * Clip the pattern content (Tiles + Strands) to the Frame outline. True for
   * the Gallery and the Builder's Composition phase (the framed artifact); kept
   * false in the Builder's Design phase so neighbour-preview ghosts + their
   * Strands aren't cut off at the frame edge. The outline/nodes still draw.
   */
  clipToFrame?: boolean
  /**
   * **Frame node** points (seed-`edgeLength`-spaced division points along the
   * Frame outline, incl. corners). Drawn as small dots over the outline.
   */
  frameNodes?: Vec2[] | null
  /**
   * Step 19.2 — Decoration **Void Fill**s (resolved). Drawn behind the Strands
   * (ADR-0005 layer stack). On the periodic fast-path these are the
   * representative fills, rendered INSIDE the cloned fragment so `<use>` tiles
   * them; otherwise they're world-space. Absent / empty ⇒ nothing drawn.
   */
  voidFills?: VoidFill[]
  /**
   * Stage 2 — world-space `instance`-scope Void fills (fast-path only). A
   * single world copy can't render inside the tiled fragment, so when these
   * exist the fragment splits in two `<use>` stacks (fills+tiles, then
   * strands) and the instance fills sandwich between them — keeping them
   * under the Strands like every other fill.
   */
  instanceVoidFills?: VoidFill[]
  /**
   * Step 19 Stage 2 — Decoration **Strand colour** records; StrandLayer
   * resolves each Strand's stroke through the scope ladder. Absent ⇒ the
   * global `config.strand.color`.
   */
  strandRecords?: ColourRecord[]
  /**
   * Stage 2 — lattice translations for StrandLayer's `patch`-orbit reduction
   * (see StrandLayer.orbitStamps).
   */
  orbitStamps?: Vec2[]
}

export const PatternSVG = forwardRef<SVGSVGElement, Props>(function PatternSVG(
  { polygons, segments, config, viewTransform, containerWidth, containerHeight, showTileLayer, showLines, handlers, cpVisible, cpActive, outlineWidth, boundaryOutlines, seedOutlineCount, ghostPolygons, ghostPolygonIds, compositionStamps, editorOverlay, frameOutline, clipToFrame = true, frameNodes, voidFills, instanceVoidFills, strandRecords, orbitStamps },
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
  // Clip only when asked (Gallery / Builder Composition). In Builder Design the
  // frame is a non-clipping overlay so neighbour ghosts + Strands stay visible.
  const clipActive = hasFrame && clipToFrame

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
        {clipActive && (
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
        {/* Pattern content is clipped to the Shape Frame outline only when
            clipping is active (Gallery / Composition); see `clipActive`. */}
        <g clipPath={clipActive ? `url(#${frameClipId})` : undefined}>
          {compositionStamps ? (
            // Lever A periodic fast-path: render one fundamental domain into a
            // <defs> fragment, then tile it with <use> (x/y = pure-translation
            // stamp). TileLayer + StrandLayer render once; the browser clones.
            instanceVoidFills && instanceVoidFills.length > 0 ? (
              // Stage 2 with world-space instance fills: split the fragment so
              // the instance fills can render between the tiled under-layers
              // and the tiled Strands (fills always sit under Strands).
              <>
                <defs>
                  <g id="composition-fragment-under">
                    {voidFills && <VoidFillLayer fills={voidFills} />}
                    <TileLayer polygons={polygons} visible={showTileLayer} outlineWidth={outlineWidth} />
                  </g>
                  <g id="composition-fragment-strands">
                    {showLines && <StrandLayer segments={segments} config={config} strandRecords={strandRecords} orbitStamps={orbitStamps} />}
                  </g>
                </defs>
                {compositionStamps.map((st, i) => (
                  <use key={`u${i}`} href="#composition-fragment-under" x={st.translation.x} y={st.translation.y} />
                ))}
                <VoidFillLayer fills={instanceVoidFills} />
                {compositionStamps.map((st, i) => (
                  <use key={`s${i}`} href="#composition-fragment-strands" x={st.translation.x} y={st.translation.y} />
                ))}
                <ControlPointLayer segments={segments} config={config} visible={cpVisible} active={cpActive} zoom={zoom} />
              </>
            ) : (
              <>
                <defs>
                  <g id="composition-fragment">
                    {/* Representative Decoration Void fills live INSIDE the
                        fragment so <use> tiles them across the whole field. */}
                    {voidFills && <VoidFillLayer fills={voidFills} />}
                    <TileLayer polygons={polygons} visible={showTileLayer} outlineWidth={outlineWidth} />
                    {showLines && <StrandLayer segments={segments} config={config} strandRecords={strandRecords} orbitStamps={orbitStamps} />}
                  </g>
                </defs>
                {compositionStamps.map((st, i) => (
                  <use
                    key={i}
                    href="#composition-fragment"
                    x={st.translation.x}
                    y={st.translation.y}
                  />
                ))}
                <ControlPointLayer segments={segments} config={config} visible={cpVisible} active={cpActive} zoom={zoom} />
              </>
            )
          ) : (
            <>
              {boundaryOutlines && boundaryOutlines.map((outline, i) => {
                // Seed outlines (first `seedOutlineCount` entries when defined) get
                // the prominent solid style so the active Patch reads as the focal
                // area. Ghost outlines (the rest) stay in the original dimmed dash.
                const isSeed = seedOutlineCount === undefined || i < seedOutlineCount
                return <BoundaryOutline key={i} vertices={outline} variant={isSeed ? 'seed' : 'ghost'} />
              })}
              <TileLayer polygons={polygons} visible={showTileLayer} outlineWidth={outlineWidth} />
              {voidFills && <VoidFillLayer fills={voidFills} />}
              {showLines && <StrandLayer segments={segments} config={config} ghostPolygonIds={ghostPolygonIds} strandRecords={strandRecords} orbitStamps={orbitStamps} />}
              <ControlPointLayer
                segments={segments}
                config={config}
                visible={cpVisible}
                active={cpActive}
                zoom={zoom}
              />
            </>
          )}
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
        {hasFrame && frameNodes && frameNodes.map((p, i) => (
          // Frame nodes — kept a constant ~3.5px on screen by dividing by zoom.
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3.5 / zoom}
            fill="var(--accent)"
            fillOpacity={0.9}
            pointerEvents="none"
          />
        ))}
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
