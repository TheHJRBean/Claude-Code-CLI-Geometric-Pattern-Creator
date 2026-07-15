import { memo } from 'react'
import type { EditorGuide, EditorGuideCircle, EditorGuideLine } from '../types/editor'
import type { Vec2 } from '../utils/math'
import {
  guideCircleDivisionPoints,
  guideCircleManualPoints,
  guideCircleRadiusPoint,
  guideCircleTickPoints,
  guideColour,
  guideIntersections,
  guideLineSpan,
  guideManualAnchorPoints,
  guideTickPoints,
  type SnapPoint,
  type WorldBounds,
} from '../editor/guides'

/**
 * Guides layer (CONSTRUCTION_GUIDES_SPEC.md) — renders every Guide (lines +
 * circles / divided circles) with the fixed stamp/static system colours, plus
 * passive Anchor dots (endpoints, ticks, manual, divisions, intersections —
 * slice 3 makes them pickable; here they're display-only).
 *
 * In Construct mode (`interactive`) the layer also carries:
 * - the in-progress draft preview (line or circle) + snap-target marker;
 * - a wide invisible hit stroke per Guide (onPointerDown — see
 *   `feedback_editor_svg_overlay_events`) for select/popup;
 * - drag handles on the selected Guide (line endpoints; circle centre + rim).
 *
 * Empty-canvas clicks (the draw gesture) are NOT captured here: `usePanZoom`
 * pointer-captures the `<svg>` on pointerdown, retargeting the subsequent up
 * away from any in-layer capture rect. The Canvas instead wraps the svg-level
 * handlers with click-slop detection and feeds world points in via the draft
 * props.
 *
 * Outside Construct mode it renders passively — `pointerEvents: none`.
 */
export type GuideHandle = 'start' | 'end' | 'center' | 'radius'

interface Props {
  guides: EditorGuide[]
  /** Default tick spacing (`patch.edgeLength`). */
  patchEdgeLength: number
  /** Visible world rectangle (padded for rotation) — clips extended lines. */
  bounds: WorldBounds
  /** Construct mode: selection + endpoint drag are live. */
  interactive: boolean
  /** Current zoom — converts px glyph sizes into world units. */
  zoom: number
  /** Two-click draft: the committed first point, or null. */
  draftStart: Vec2 | null
  /** Live (already snapped) cursor position for the draft preview. */
  draftCursor: Vec2 | null
  /** Whether the in-progress draft is a line or a circle. */
  draftTool: 'line' | 'circle'
  /** The snap candidate the cursor is currently locked to, for the marker. */
  snapTarget: SnapPoint | null
  selectedGuideId: string | null
  /** Click on a Guide's stroke → select (opens the popup). */
  onSelectGuide?: (id: string | null) => void
  /** Handle drag (screen px; parent converts + snaps + dispatches). */
  onDragHandle?: (id: string, handle: GuideHandle, screen: Vec2) => void
}

const HANDLE_HALF = 5

export const EditorGuideLayer = memo(function EditorGuideLayer({
  guides,
  patchEdgeLength,
  bounds,
  interactive,
  zoom,
  draftStart,
  draftCursor,
  draftTool,
  snapTarget,
  selectedGuideId,
  onSelectGuide,
  onDragHandle,
}: Props) {
  // Anchor dot radius in world units so dots stay a constant screen size.
  const r = (px: number) => px / zoom

  const intersections = guideIntersections(guides)

  /** Screen-px position of a pointer event relative to the SVG container. */
  const screenPos = (e: React.PointerEvent): Vec2 => {
    const svg = (e.target as Element).closest('svg')
    const rect = svg?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }

  /** A square drag handle over an Anchor (selected Guides, Construct only). */
  const dragHandle = (id: string, handle: GuideHandle, p: Vec2, colour: string) => (
    <rect
      key={handle}
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
        onDragHandle?.(id, handle, screenPos(e))
      }}
      onPointerUp={e => (e.target as Element).releasePointerCapture?.(e.pointerId)}
    />
  )

  const renderLine = (g: EditorGuideLine) => {
    const span = guideLineSpan(g, bounds)
    if (!span) return null
    const colour = guideColour(g)
    const selected = g.id === selectedGuideId
    const ticks = guideTickPoints(g, patchEdgeLength)
    const manual = guideManualAnchorPoints(g)
    return (
      <g key={g.id}>
        {/* Extended portions — dashed, lower opacity, under the solid segment. */}
        {g.extend !== 'none' && (
          <line
            x1={span.a.x} y1={span.a.y} x2={span.b.x} y2={span.b.y}
            stroke={colour} strokeWidth={1.1} strokeOpacity={0.45}
            strokeDasharray="6 5" vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
        )}
        {/* The drawn segment. */}
        <line
          x1={g.start.x} y1={g.start.y} x2={g.end.x} y2={g.end.y}
          stroke={colour} strokeWidth={selected ? 2.4 : 1.6} strokeOpacity={selected ? 1 : 0.85}
          vectorEffect="non-scaling-stroke" pointerEvents="none"
        />
        {/* Wide invisible hit stroke over the full span — select/popup. */}
        {interactive && (
          <line
            x1={span.a.x} y1={span.a.y} x2={span.b.x} y2={span.b.y}
            stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke"
            style={{ cursor: 'pointer' }}
            onPointerDown={e => { e.stopPropagation(); onSelectGuide?.(g.id) }}
          />
        )}
        {/* Passive Anchor dots. */}
        {ticks.map((t, i) => (
          <circle key={`t${i}`} cx={t.x} cy={t.y} r={r(2)} fill={colour} fillOpacity={0.8} pointerEvents="none" />
        ))}
        {manual.map((m, i) => (
          <circle key={`m${i}`} cx={m.x} cy={m.y} r={r(3.5)} fill="none" stroke={colour} strokeWidth={1.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {([['start', g.start], ['end', g.end]] as const).map(([which, p]) =>
          interactive && selected
            ? dragHandle(g.id, which, p, colour)
            : <circle key={which} cx={p.x} cy={p.y} r={r(2.8)} fill={colour} pointerEvents="none" />,
        )}
      </g>
    )
  }

  const renderCircle = (g: EditorGuideCircle) => {
    if (!(g.radius > 0)) return null
    const colour = guideColour(g)
    const selected = g.id === selectedGuideId
    const ticks = guideCircleTickPoints(g, patchEdgeLength)
    const divisions = guideCircleDivisionPoints(g)
    const manual = guideCircleManualPoints(g)
    const radiusPoint = guideCircleRadiusPoint(g)
    return (
      <g key={g.id}>
        {/* The circle. */}
        <circle
          cx={g.center.x} cy={g.center.y} r={g.radius}
          fill="none" stroke={colour}
          strokeWidth={selected ? 2.4 : 1.6} strokeOpacity={selected ? 1 : 0.85}
          vectorEffect="non-scaling-stroke" pointerEvents="none"
        />
        {/* Wide invisible hit ring — select/popup on the rim. */}
        {interactive && (
          <circle
            cx={g.center.x} cy={g.center.y} r={g.radius}
            fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke"
            style={{ cursor: 'pointer' }}
            onPointerDown={e => { e.stopPropagation(); onSelectGuide?.(g.id) }}
          />
        )}
        {/* Division Anchors — the rosette scaffold; drawn as small filled dots
            plus faint radial spokes from centre for legibility. */}
        {divisions.map((d, i) => (
          <g key={`d${i}`} pointerEvents="none">
            <line x1={g.center.x} y1={g.center.y} x2={d.x} y2={d.y} stroke={colour} strokeWidth={0.8} strokeOpacity={0.28} vectorEffect="non-scaling-stroke" />
            <circle cx={d.x} cy={d.y} r={r(2.6)} fill={colour} fillOpacity={0.9} />
          </g>
        ))}
        {/* Arc-spaced tick Anchors. */}
        {ticks.map((t, i) => (
          <circle key={`t${i}`} cx={t.x} cy={t.y} r={r(2)} fill={colour} fillOpacity={0.8} pointerEvents="none" />
        ))}
        {manual.map((m, i) => (
          <circle key={`m${i}`} cx={m.x} cy={m.y} r={r(3.5)} fill="none" stroke={colour} strokeWidth={1.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {/* Centre Anchor (drag handle when selected). */}
        {interactive && selected
          ? dragHandle(g.id, 'center', g.center, colour)
          : <circle cx={g.center.x} cy={g.center.y} r={r(2.8)} fill={colour} pointerEvents="none" />}
        {/* Radius handle (drag = resize + rotate). Passive dot otherwise. */}
        {interactive && selected
          ? dragHandle(g.id, 'radius', radiusPoint, colour)
          : <circle cx={radiusPoint.x} cy={radiusPoint.y} r={r(2.8)} fill="none" stroke={colour} strokeWidth={1.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      </g>
    )
  }

  return (
    <g id="editor-guide-layer" pointerEvents={interactive ? undefined : 'none'}>

      {guides.map(g => (g.kind === 'circle' ? renderCircle(g) : renderLine(g)))}

      {/* Guide×Guide intersection Anchors — passive × glyphs. */}
      {intersections.map((p, i) => (
        <g key={`x${i}`} pointerEvents="none" stroke="var(--text-muted)" strokeWidth={1.2} strokeOpacity={0.75}>
          <line x1={p.x - r(3)} y1={p.y - r(3)} x2={p.x + r(3)} y2={p.y + r(3)} vectorEffect="non-scaling-stroke" />
          <line x1={p.x - r(3)} y1={p.y + r(3)} x2={p.x + r(3)} y2={p.y - r(3)} vectorEffect="non-scaling-stroke" />
        </g>
      ))}

      {/* In-progress draft: first-point marker + preview (line or circle). */}
      {interactive && draftStart && (
        <circle cx={draftStart.x} cy={draftStart.y} r={r(4)} fill="none" stroke="var(--accent)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      )}
      {interactive && draftStart && draftCursor && draftTool === 'line' && (
        <line
          x1={draftStart.x} y1={draftStart.y} x2={draftCursor.x} y2={draftCursor.y}
          stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="5 4" strokeOpacity={0.9}
          vectorEffect="non-scaling-stroke" pointerEvents="none"
        />
      )}
      {interactive && draftStart && draftCursor && draftTool === 'circle' && (
        <g pointerEvents="none" stroke="var(--accent)" vectorEffect="non-scaling-stroke">
          <circle
            cx={draftStart.x} cy={draftStart.y}
            r={Math.hypot(draftCursor.x - draftStart.x, draftCursor.y - draftStart.y)}
            fill="none" strokeWidth={1.4} strokeDasharray="5 4" strokeOpacity={0.9} vectorEffect="non-scaling-stroke"
          />
          <line x1={draftStart.x} y1={draftStart.y} x2={draftCursor.x} y2={draftCursor.y} strokeWidth={1} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {/* Snap-target marker — ring over the candidate the cursor locked to. */}
      {interactive && snapTarget && (
        <circle
          cx={snapTarget.p.x} cy={snapTarget.p.y} r={r(7)}
          fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeOpacity={0.9}
          vectorEffect="non-scaling-stroke" pointerEvents="none"
        />
      )}
    </g>
  )
})
