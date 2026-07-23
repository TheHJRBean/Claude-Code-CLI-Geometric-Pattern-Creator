import { memo } from 'react'
import type { FrameGradient } from '../types/editor'
import type { Vec2 } from '../utils/math'

/**
 * On-canvas handles for the across-frame gradient (#45, DECORATION_GRADIENTS_SPEC
 * slice 2) — modelled on `EditorMorphLayer`. The gradient's geometry lives in
 * world coordinates, so its handles sit directly on the field:
 * - **Linear**: a start and an end handle joined by the gradient axis line.
 * - **Radial**: a centre handle and a rim (radius) handle joined by the ring.
 *
 * Passive (`pointerEvents: none`) when `interactive` is false. Shown only while
 * the Gradient paint target is active with an enabled frame gradient
 * (Decoration Phase). Screen-space glyph sizes are converted to world units via
 * `zoom`, exactly like the Morph layer; drags hand screen coords to the parent,
 * which projects to world + dispatches.
 */

const HANDLE_HALF = 5
/** Frame-gradient default: distinct from Guides (blue/violet), Morph (teal)
 * and the accent gold. The strand gradient (#46) reuses this layer with its
 * own `colour` so the two world-space gradient handle sets read apart. */
const GRADIENT_COLOUR = '#c77dff'

interface Props {
  gradient: FrameGradient
  interactive: boolean
  /** Current zoom — converts px glyph sizes into world units. */
  zoom: number
  /** Handle/axis colour. Defaults to the frame-gradient purple. */
  colour?: string
  /** Handle drags (screen px; parent converts + dispatches). */
  onDragLinear?: (which: 'start' | 'end', screen: Vec2) => void
  onDragRadialCentre?: (screen: Vec2) => void
  onDragRadialRadius?: (screen: Vec2) => void
}

export const EditorFrameGradientLayer = memo(function EditorFrameGradientLayer({
  gradient,
  interactive,
  zoom,
  colour = GRADIENT_COLOUR,
  onDragLinear,
  onDragRadialCentre,
  onDragRadialRadius,
}: Props) {
  const r = (px: number) => px / zoom

  const screenPos = (e: React.PointerEvent): Vec2 => {
    const svg = (e.target as Element).closest('svg')
    const rect = svg?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }

  const dragHandle = (key: string, p: Vec2, onDrag: ((screen: Vec2) => void) | undefined) =>
    interactive
      ? (
        <rect
          key={key}
          x={p.x - r(HANDLE_HALF)} y={p.y - r(HANDLE_HALF)}
          width={r(HANDLE_HALF * 2)} height={r(HANDLE_HALF * 2)}
          fill="var(--bg-base, #08080f)" stroke={colour} strokeWidth={1.8}
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
      : <circle key={key} cx={p.x} cy={p.y} r={r(3.2)} fill={colour} pointerEvents="none" />

  return (
    <g id="editor-frame-gradient-layer" pointerEvents={interactive ? undefined : 'none'}>
      {gradient.type === 'linear' ? (
        <>
          <line
            x1={gradient.start.x} y1={gradient.start.y} x2={gradient.end.x} y2={gradient.end.y}
            stroke={colour} strokeWidth={1.6} strokeOpacity={0.85}
            strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
          {dragHandle('start', gradient.start, s => onDragLinear?.('start', s))}
          {dragHandle('end', gradient.end, s => onDragLinear?.('end', s))}
        </>
      ) : (
        <>
          <circle
            cx={gradient.centre.x} cy={gradient.centre.y} r={gradient.radius}
            fill="none" stroke={colour} strokeWidth={1.6} strokeOpacity={0.85}
            strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
          <line
            x1={gradient.centre.x} y1={gradient.centre.y}
            x2={gradient.centre.x + gradient.radius} y2={gradient.centre.y}
            stroke={colour} strokeWidth={1.2} strokeOpacity={0.6}
            vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
          {dragHandle('centre', gradient.centre, onDragRadialCentre)}
          {dragHandle('radius', { x: gradient.centre.x + gradient.radius, y: gradient.centre.y }, onDragRadialRadius)}
        </>
      )}
    </g>
  )
})
