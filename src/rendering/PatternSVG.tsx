import { forwardRef } from 'react'
import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig, StrandLineStyle } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import type { ViewTransform } from '../hooks/usePanZoom'
import type { PanZoomHandlers } from '../hooks/usePanZoom'
import type { LatticeStamp } from '../editor/lattice'
import { TileLayer } from './TileLayer'
import { StrandLayer } from './StrandLayer'
import { ControlPointLayer } from './ControlPointLayer'
import { VoidFillLayer } from './VoidFillLayer'
import { VoidStampLayer } from './VoidStampLayer'
import type { VoidFill } from '../decoration/resolve'
import type { StampPlacement } from '../decoration/stamps'
import type { ColourRecord } from '../types/editor'
import type { CellFrame } from '../decoration/cellScope'

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
   * Clip `editorOverlay` to the Frame outline (only meaningful while a Frame
   * is clipping, i.e. `clipToFrame` + a frame outline). On for the Decoration
   * Paint overlay so highlights/hit-targets respect the frame; off for the
   * Design-phase overlay, whose neighbour-stamp vertex dots must stay
   * clickable outside the frame.
   */
  clipEditorOverlayToFrame?: boolean
  /**
   * Editor overlay rendered ABOVE `editorOverlay` and never Frame-clipped —
   * for authoring scaffolding whose reach must not depend on the Frame (the
   * Morph layer: a Boundary line spans the whole canvas even when the
   * Decoration Paint overlay under it clips to a small Frame).
   */
  editorOverlayUnclipped?: React.ReactNode
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
   * Decorative Frame border stroke (`FrameConfig.stroke`, Decoration
   * styling). When set it REPLACES the accent guide outline; width is in
   * world units so the border scales with the pattern and exports as drawn.
   * `lineStyle` mirrors the Strand vocabulary (solid/double/triple/dashed/
   * dotted).
   */
  frameStroke?: { colour: string; width: number; lineStyle?: StrandLineStyle; innerFill?: string } | null
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
   * Decoration **Void Stamps** — uploaded images clipped into their Voids.
   * Drawn over the Void fills, under the Strands. Same coordinate convention
   * as `voidFills` (fragment-space on the fast path, world-space otherwise).
   */
  voidStamps?: StampPlacement[]
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
  /** Stage 2b — per-Cell symmetry frames for StrandLayer's `cell` rung. */
  cellFrames?: CellFrame[]
  /** Base-fragment strand-identity source for StrandLayer (editor non-fast
   * path) — see `PatternData.strandIdentitySource`. */
  strandIdentitySource?: { baseSegments: Segment[]; stamps: LatticeStamp[] }
}

export const PatternSVG = forwardRef<SVGSVGElement, Props>(function PatternSVG(
  { polygons, segments, config, viewTransform, containerWidth, containerHeight, showTileLayer, showLines, handlers, cpVisible, cpActive, outlineWidth, boundaryOutlines, seedOutlineCount, ghostPolygons, ghostPolygonIds, compositionStamps, editorOverlay, clipEditorOverlayToFrame = false, editorOverlayUnclipped, frameOutline, clipToFrame = true, frameNodes, frameStroke, voidFills, instanceVoidFills, voidStamps, strandRecords, orbitStamps, cellFrames, strandIdentitySource },
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
          <g opacity={0.18} pointerEvents="none" data-export="exclude">
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
                    {/* Tiles under fills, matching the non-fast-path order —
                        Void fills are part of the decorated look and must not
                        be covered by the tile fills/outlines. */}
                    <TileLayer polygons={polygons} visible={showTileLayer} outlineWidth={outlineWidth} />
                    {voidFills && <VoidFillLayer fills={voidFills} />}
                    {voidStamps && <VoidStampLayer placements={voidStamps} idPrefix="void-stamp-frag" />}
                  </g>
                  <g id="composition-fragment-strands">
                    {showLines && <StrandLayer segments={segments} config={config} strandRecords={strandRecords} orbitStamps={orbitStamps} cellFrames={cellFrames} />}
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
                        fragment so <use> tiles them across the whole field.
                        Tiles under fills, matching the non-fast-path order. */}
                    <TileLayer polygons={polygons} visible={showTileLayer} outlineWidth={outlineWidth} />
                    {voidFills && <VoidFillLayer fills={voidFills} />}
                    {voidStamps && <VoidStampLayer placements={voidStamps} idPrefix="void-stamp-frag" />}
                    {showLines && <StrandLayer segments={segments} config={config} strandRecords={strandRecords} orbitStamps={orbitStamps} cellFrames={cellFrames} />}
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
              {boundaryOutlines && boundaryOutlines.length > 0 && (
                // Cell-Boundary guide outlines are authoring scaffolding, not
                // artwork — excluded from exports.
                <g data-export="exclude">
                  {boundaryOutlines.map((outline, i) => {
                    // Seed outlines (first `seedOutlineCount` entries when defined) get
                    // the prominent solid style so the active Patch reads as the focal
                    // area. Ghost outlines (the rest) stay in the original dimmed dash.
                    const isSeed = seedOutlineCount === undefined || i < seedOutlineCount
                    return <BoundaryOutline key={i} vertices={outline} variant={isSeed ? 'seed' : 'ghost'} />
                  })}
                </g>
              )}
              <TileLayer polygons={polygons} visible={showTileLayer} outlineWidth={outlineWidth} />
              {voidFills && <VoidFillLayer fills={voidFills} />}
              {voidStamps && <VoidStampLayer placements={voidStamps} idPrefix="void-stamp-world" />}
              {showLines && <StrandLayer segments={segments} config={config} ghostPolygonIds={ghostPolygonIds} strandRecords={strandRecords} orbitStamps={orbitStamps} cellFrames={cellFrames} identitySource={strandIdentitySource} />}
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
          frameStroke ? (
            // Decorative border stroke — part of the artwork (world-unit
            // width, scales with zoom, included in exports).
            <FrameBorder outline={frameOutline!} points={framePoints} stroke={frameStroke} />
          ) : (
            <polygon
              points={framePoints}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.2}
              strokeOpacity={0.95}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )
        )}
        {hasFrame && frameNodes && frameNodes.length > 0 && (
          // Frame pick-node dots — Design-phase Complete targets, not artwork.
          <g data-export="exclude">
            {frameNodes.map((p, i) => (
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
          </g>
        )}
        {/* 17.11 — editorOverlay must be the topmost interactive layer so
            vertex dots at neighbour-stamp coordinates aren't blocked by
            strand strokes painted above. ControlPointLayer is already
            pointerEvents="none" so order vs it is purely visual.
            With `clipEditorOverlayToFrame` (Decoration Paint mode) the overlay
            clips to the Frame outline like the content below it — SVG clipping
            also removes pointer hit-testing, so hover highlights AND the
            bucket cursor stop at the frame edge (hit-targets extracted from
            the unfiltered field would otherwise highlight outside it). */}
        {editorOverlay && (
          clipActive && clipEditorOverlayToFrame
            ? <g data-export="exclude" clipPath={`url(#${frameClipId})`}>{editorOverlay}</g>
            : <g data-export="exclude">{editorOverlay}</g>
        )}
        {editorOverlayUnclipped && (
          <g data-export="exclude">{editorOverlayUnclipped}</g>
        )}
      </g>
    </svg>
  )
})

/**
 * Decorative Frame border with stroke styles, mirroring the Strand line
 * styles (`StrandLayer`): dashed/dotted are dash arrays scaled to the border
 * width; double/triple cut the stroke's centre out with a mask so the
 * pattern and background show through between the parallel lines (an
 * overdraw would paint over whatever the border straddles).
 */
function FrameBorder({ outline, points, stroke }: {
  outline: Vec2[]
  points: string
  stroke: { colour: string; width: number; lineStyle?: StrandLineStyle; innerFill?: string }
}) {
  const w = stroke.width
  const style = stroke.lineStyle ?? 'solid'
  const masked = style === 'double' || style === 'triple'
  const dashArray = style === 'dashed' ? `${w * 2.5} ${w * 1.5}`
    : style === 'dotted' ? `0.01 ${w * 1.8}` : undefined
  const lineCap = style === 'dashed' ? 'butt' as const : 'round' as const
  // Centre cut width; triple keeps a thin centre line drawn separately.
  const cutWidth = style === 'triple' ? w * 0.65 : w * 0.5
  const centreWidth = w * 0.18
  const maskId = 'frame-stroke-mask'
  let maskRect = null as { x: number; y: number; width: number; height: number } | null
  if (masked) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of outline) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    const m = w * 2
    maskRect = { x: minX - m, y: minY - m, width: maxX - minX + 2 * m, height: maxY - minY + 2 * m }
  }
  return (
    <g pointerEvents="none">
      {maskRect && (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={maskRect.x} y={maskRect.y} width={maskRect.width} height={maskRect.height}>
            <rect x={maskRect.x} y={maskRect.y} width={maskRect.width} height={maskRect.height} fill="white" />
            <polygon points={points} fill="none" stroke="black" strokeWidth={cutWidth} strokeLinejoin="round" />
          </mask>
        </defs>
      )}
      {/* Inner fill for double/triple: cut-width underlay revealed by the
          mask's centre cut instead of the pattern/background. */}
      {masked && stroke.innerFill && (
        <polygon
          points={points}
          fill="none"
          stroke={stroke.innerFill}
          strokeWidth={cutWidth}
          strokeLinejoin="round"
        />
      )}
      <polygon
        points={points}
        fill="none"
        stroke={stroke.colour}
        strokeWidth={w}
        strokeLinejoin="round"
        strokeLinecap={lineCap}
        strokeDasharray={dashArray}
        mask={maskRect ? `url(#${maskId})` : undefined}
      />
      {style === 'triple' && (
        <polygon
          points={points}
          fill="none"
          stroke={stroke.colour}
          strokeWidth={centreWidth}
          strokeLinejoin="round"
        />
      )}
    </g>
  )
}

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
