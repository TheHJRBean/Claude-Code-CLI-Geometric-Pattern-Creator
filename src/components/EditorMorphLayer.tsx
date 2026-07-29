import { memo } from 'react'
import type { MorphConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import { clipInfiniteLineToBounds } from '../editor/morph'
import { originReach } from '../pic/morph'
import type { WorldBounds } from '../editor/guides'

/**
 * On-canvas Morph overlay (Step 20 slice 2, PATTERN_MORPH_SPEC.md §UI) —
 * modelled on `EditorGuideLayer`. Unlike a Guide (2 degrees of freedom per
 * shape, needing a dedicated handle per anchor), a Morph Origin's draggable
 * DOF is just `position`, so its own stroke doubles as the drag target — no
 * separate handle rect. The Axis point and (Linear-only) Direction arrow tip
 * get small drag-handle glyphs, same pattern as `EditorGuideLayer`'s
 * `dragHandle`.
 *
 * Each Origin also draws its **reach extent** (#48): a dashed, fainter
 * line/ring at `position ± reach` on whichever sides are active, marking
 * where the target values are fully reached. The solid stroke is the Origin
 * itself (base recipe); the dashed one is the far end of the ramp.
 *
 * Passive (`pointerEvents: none`) when `interactive` is false. Shown only
 * in the Composition Phase — Decoration freezes the Morph (field applies,
 * overlay hidden).
 */

/** Origins — teal, distinct from Guides' blue/violet and the accent gold
 *  used for the Axis point / Direction arrow. */
const ORIGIN_COLOUR = '#3f9e8f'

interface Props {
  morph: MorphConfig
  /** Visible world rectangle (padded for rotation) — clips Linear lines. */
  bounds: WorldBounds
  interactive: boolean
  /** Current zoom — converts px glyph sizes into world units. */
  zoom: number
  selectedOriginId: string | null
  onSelectOrigin?: (id: string | null) => void
  /** Handle/Origin drag (screen px; parent converts + projects + dispatches). */
  onDragAxisOrigin?: (screen: Vec2) => void
  onDragDirection?: (screen: Vec2) => void
  onDragOrigin?: (id: string, screen: Vec2) => void
}

const HANDLE_HALF = 5
/** Direction arrow length in screen px (constant on-screen size via `r()`). */
const ARROW_PX = 46

export const EditorMorphLayer = memo(function EditorMorphLayer({
  morph,
  bounds,
  interactive,
  zoom,
  selectedOriginId,
  onSelectOrigin,
  onDragAxisOrigin,
  onDragDirection,
  onDragOrigin,
}: Props) {
  const r = (px: number) => px / zoom

  const screenPos = (e: React.PointerEvent): Vec2 => {
    const svg = (e.target as Element).closest('svg')
    const rect = svg?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }

  const dragHandle = (key: string, p: Vec2, onDrag: ((screen: Vec2) => void) | undefined, colour: string) => (
    <rect
      key={key}
      x={p.x - r(HANDLE_HALF)}
      y={p.y - r(HANDLE_HALF)}
      width={r(HANDLE_HALF * 2)}
      height={r(HANDLE_HALF * 2)}
      fill="var(--bg-base, #08080f)"
      stroke={colour}
      strokeWidth={1.8}
      vectorEffect="non-scaling-stroke"
      style={{ cursor: 'move', touchAction: 'none' }}
      onPointerDown={e => {
        e.stopPropagation()
        ;(e.target as Element).setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        if (!(e.target as Element).hasPointerCapture?.(e.pointerId)) return
        e.stopPropagation()
        onDrag?.(screenPos(e))
      }}
      onPointerUp={e => (e.target as Element).releasePointerCapture?.(e.pointerId)}
    />
  )

  const direction = morph.direction ?? { x: 1, y: 0 }
  const axis = morph.axisOrigin
  const arrowTip = {
    x: axis.x + direction.x * r(ARROW_PX),
    y: axis.y + direction.y * r(ARROW_PX),
  }
  // Small arrowhead — two short strokes back from the tip, perpendicular-ish.
  const arrowBack = { x: -direction.x, y: -direction.y }
  const arrowSide = { x: -direction.y, y: direction.x }
  const headLen = r(7)
  const head = (sign: 1 | -1) => ({
    x: arrowTip.x + headLen * (arrowBack.x * 0.8 + sign * arrowSide.x * 0.6),
    y: arrowTip.y + headLen * (arrowBack.y * 0.8 + sign * arrowSide.y * 0.6),
  })

  /** Positions of an Origin's reach extents — the far ends of its ramp, one
   *  per active side. Resolved through `originReach` so auto-fit (#49) shows
   *  the extents actually meeting the neighbours. Zero reach has no extent to
   *  draw (hard step). */
  const reachExtents = (i: number): number[] => {
    const o = morph.origins[i]
    const out: number[] = []
    if (o.sides !== 'positive') {
      const r = originReach(morph.origins, i, -1)
      if (r > 0) out.push(o.position - r)
    }
    if (o.sides !== 'negative') {
      const r = originReach(morph.origins, i, 1)
      if (r > 0) out.push(o.position + r)
    }
    return out
  }

  const renderOrigin = (o: MorphConfig['origins'][number], oi: number) => {
    const selected = o.id === selectedOriginId
    const width = selected ? 2.4 : 1.4
    const opacity = selected ? 0.95 : 0.5
    // The extent is a read-only annotation — dimmer, dashed, never a hit
    // target (dragging it would be a second way to set `reach`, which the
    // spec keeps on the sliders so the line stays a pure position handle).
    const extentOpacity = selected ? 0.55 : 0.28
    const hit = (
      shape: React.ReactNode,
    ) => (
      interactive
        ? <g
            style={{ cursor: 'pointer' }}
            onPointerDown={e => {
              e.stopPropagation()
              onSelectOrigin?.(o.id)
              ;(e.target as Element).setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              if (!(e.target as Element).hasPointerCapture?.(e.pointerId)) return
              e.stopPropagation()
              onDragOrigin?.(o.id, screenPos(e))
            }}
            onPointerUp={e => (e.target as Element).releasePointerCapture?.(e.pointerId)}
          >
            {shape}
          </g>
        : shape
    )

    if (morph.mode === 'radial') {
      if (!(o.position > 0)) return null
      return (
        <g key={o.id}>
          {reachExtents(oi).map((rad, i) => (
            // An inward extent can fall past the Centre — no ring to draw.
            rad > 0 ? (
              <circle
                key={i}
                cx={axis.x} cy={axis.y} r={rad}
                fill="none" stroke={ORIGIN_COLOUR} strokeWidth={1.2} strokeOpacity={extentOpacity}
                strokeDasharray="5 5" vectorEffect="non-scaling-stroke" pointerEvents="none"
              />
            ) : null
          ))}
          <circle
            cx={axis.x} cy={axis.y} r={o.position}
            fill="none" stroke={ORIGIN_COLOUR} strokeWidth={width} strokeOpacity={opacity}
            vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
          {hit(
            <circle
              cx={axis.x} cy={axis.y} r={o.position}
              fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke"
            />,
          )}
        </g>
      )
    }

    const perp = { x: -direction.y, y: direction.x }
    const lineAt = (position: number) => {
      const point = { x: axis.x + direction.x * position, y: axis.y + direction.y * position }
      return clipInfiniteLineToBounds(point, perp, bounds)
    }
    const span = lineAt(o.position)
    if (!span) return null
    return (
      <g key={o.id}>
        {reachExtents(oi).map((position, i) => {
          const ext = lineAt(position)
          return ext ? (
            <line
              key={i}
              x1={ext.a.x} y1={ext.a.y} x2={ext.b.x} y2={ext.b.y}
              stroke={ORIGIN_COLOUR} strokeWidth={1.2} strokeOpacity={extentOpacity}
              strokeDasharray="5 5" vectorEffect="non-scaling-stroke" pointerEvents="none"
            />
          ) : null
        })}
        <line
          x1={span.a.x} y1={span.a.y} x2={span.b.x} y2={span.b.y}
          stroke={ORIGIN_COLOUR} strokeWidth={width} strokeOpacity={opacity}
          vectorEffect="non-scaling-stroke" pointerEvents="none"
        />
        {hit(
          <line
            x1={span.a.x} y1={span.a.y} x2={span.b.x} y2={span.b.y}
            stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke"
          />,
        )}
      </g>
    )
  }

  return (
    <g id="editor-morph-layer" pointerEvents={interactive ? undefined : 'none'}>
      {morph.origins.map(renderOrigin)}

      {/* Direction arrow (Linear only) — drawn under the Axis handle. */}
      {morph.mode === 'linear' && (
        <g pointerEvents="none">
          <line
            x1={axis.x} y1={axis.y} x2={arrowTip.x} y2={arrowTip.y}
            stroke="var(--accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke"
          />
          <line x1={arrowTip.x} y1={arrowTip.y} x2={head(1).x} y2={head(1).y} stroke="var(--accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          <line x1={arrowTip.x} y1={arrowTip.y} x2={head(-1).x} y2={head(-1).y} stroke="var(--accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {morph.mode === 'linear' && (
        interactive
          ? dragHandle('direction', arrowTip, onDragDirection, 'var(--accent)')
          : <circle cx={arrowTip.x} cy={arrowTip.y} r={r(3.2)} fill="var(--accent)" pointerEvents="none" />
      )}

      {/* Axis / Centre handle. */}
      {interactive
        ? dragHandle('axis-origin', axis, onDragAxisOrigin, 'var(--accent)')
        : <circle cx={axis.x} cy={axis.y} r={r(3.6)} fill="var(--accent)" pointerEvents="none" />}
    </g>
  )
})
