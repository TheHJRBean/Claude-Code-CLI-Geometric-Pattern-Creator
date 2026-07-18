import { memo } from 'react'
import type { MorphConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import { clipInfiniteLineToBounds } from '../editor/morph'
import type { WorldBounds } from '../editor/guides'

/**
 * On-canvas Morph overlay (Step 20 slice 2, PATTERN_MORPH_SPEC.md §UI) —
 * modelled on `EditorGuideLayer`. Unlike a Guide (2 degrees of freedom per
 * shape, needing a dedicated handle per anchor), a Morph Boundary has
 * exactly one DOF (`position`), so its own stroke doubles as the drag
 * target — no separate handle rect. The Origin and (Linear-only) Direction
 * arrow tip get small drag-handle glyphs, same pattern as
 * `EditorGuideLayer`'s `dragHandle`.
 *
 * Passive (`pointerEvents: none`) when `interactive` is false. Shown only
 * in the Composition Phase — Decoration freezes the Morph (field applies,
 * overlay hidden).
 */

/** Boundaries — teal, distinct from Guides' blue/violet and the accent gold
 *  used for Origin/Direction. */
const BOUNDARY_COLOUR = '#3f9e8f'

interface Props {
  morph: MorphConfig
  /** Visible world rectangle (padded for rotation) — clips Linear lines. */
  bounds: WorldBounds
  interactive: boolean
  /** Current zoom — converts px glyph sizes into world units. */
  zoom: number
  selectedBoundaryId: string | null
  onSelectBoundary?: (id: string | null) => void
  /** Handle/Boundary drag (screen px; parent converts + projects + dispatches). */
  onDragOrigin?: (screen: Vec2) => void
  onDragDirection?: (screen: Vec2) => void
  onDragBoundary?: (id: string, screen: Vec2) => void
}

const HANDLE_HALF = 5
/** Direction arrow length in screen px (constant on-screen size via `r()`). */
const ARROW_PX = 46

export const EditorMorphLayer = memo(function EditorMorphLayer({
  morph,
  bounds,
  interactive,
  zoom,
  selectedBoundaryId,
  onSelectBoundary,
  onDragOrigin,
  onDragDirection,
  onDragBoundary,
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
  const arrowTip = {
    x: morph.origin.x + direction.x * r(ARROW_PX),
    y: morph.origin.y + direction.y * r(ARROW_PX),
  }
  // Small arrowhead — two short strokes back from the tip, perpendicular-ish.
  const arrowBack = { x: -direction.x, y: -direction.y }
  const arrowSide = { x: -direction.y, y: direction.x }
  const headLen = r(7)
  const head = (sign: 1 | -1) => ({
    x: arrowTip.x + headLen * (arrowBack.x * 0.8 + sign * arrowSide.x * 0.6),
    y: arrowTip.y + headLen * (arrowBack.y * 0.8 + sign * arrowSide.y * 0.6),
  })

  const renderBoundary = (b: MorphConfig['boundaries'][number]) => {
    const selected = b.id === selectedBoundaryId
    const width = selected ? 2.4 : 1.4
    const opacity = selected ? 0.95 : 0.5
    const hit = (
      shape: React.ReactNode,
    ) => (
      interactive
        ? <g
            style={{ cursor: 'pointer' }}
            onPointerDown={e => {
              e.stopPropagation()
              onSelectBoundary?.(b.id)
              ;(e.target as Element).setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              if (!(e.target as Element).hasPointerCapture?.(e.pointerId)) return
              e.stopPropagation()
              onDragBoundary?.(b.id, screenPos(e))
            }}
            onPointerUp={e => (e.target as Element).releasePointerCapture?.(e.pointerId)}
          >
            {shape}
          </g>
        : shape
    )

    if (morph.mode === 'radial') {
      if (!(b.position > 0)) return null
      return (
        <g key={b.id}>
          <circle
            cx={morph.origin.x} cy={morph.origin.y} r={b.position}
            fill="none" stroke={BOUNDARY_COLOUR} strokeWidth={width} strokeOpacity={opacity}
            vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
          {hit(
            <circle
              cx={morph.origin.x} cy={morph.origin.y} r={b.position}
              fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke"
            />,
          )}
        </g>
      )
    }

    const point = { x: morph.origin.x + direction.x * b.position, y: morph.origin.y + direction.y * b.position }
    const perp = { x: -direction.y, y: direction.x }
    const span = clipInfiniteLineToBounds(point, perp, bounds)
    if (!span) return null
    return (
      <g key={b.id}>
        <line
          x1={span.a.x} y1={span.a.y} x2={span.b.x} y2={span.b.y}
          stroke={BOUNDARY_COLOUR} strokeWidth={width} strokeOpacity={opacity}
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
      {morph.boundaries.map(renderBoundary)}

      {/* Direction arrow (Linear only) — drawn under the Origin handle. */}
      {morph.mode === 'linear' && (
        <g pointerEvents="none">
          <line
            x1={morph.origin.x} y1={morph.origin.y} x2={arrowTip.x} y2={arrowTip.y}
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

      {/* Origin / Centre handle. */}
      {interactive
        ? dragHandle('origin', morph.origin, onDragOrigin, 'var(--accent)')
        : <circle cx={morph.origin.x} cy={morph.origin.y} r={r(3.6)} fill="var(--accent)" pointerEvents="none" />}
    </g>
  )
})
