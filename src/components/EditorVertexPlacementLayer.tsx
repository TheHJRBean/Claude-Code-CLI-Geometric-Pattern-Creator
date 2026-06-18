import { memo } from 'react'
import type { ExposedVertex } from '../editor/vertexPlacement'

/** Composite identity for a vertex across a multi-cell Patch — Cell-local keys
 *  can collide between Cells, so selection/hover are tracked by host Cell + key. */
export function vertexUid(v: { hostCellId?: string; key: string }): string {
  return `${v.hostCellId ?? ''}#${v.key}`
}

/**
 * Step 17.13c — interactive vertex layer for Design Phase + Place mode
 * (single-cell only). Renders one clickable dot per exposed Cell vertex
 * (and inward-only Boundary corners). Click selects the vertex; the
 * `EditorPickerOverlay` in vertex mode then handles shape + orientation.
 *
 * Distinct from `EditorVertexLayer` (Complete-mode multi-pick). Always-on
 * in Place mode, in parallel with `EditorEdgeLayer` and
 * `EditorBoundaryInwardLayer` — vertex dots, edge highlights, and section
 * highlights all coexist (locked decision a, mirroring 17.12c).
 *
 * Diamond glyph for vertex dots disambiguates them from the round dots
 * used by `EditorVertexLayer` in Complete mode and the boundary-section
 * line highlights. Boundary corners get a dashed outline so the user can
 * tell at a glance that placement there is constrained to inward-only.
 *
 * Renders LAST in the editor overlay so vertex dots sit above edges /
 * sections in SVG z-order (vertex clicks should win when overlapping an
 * edge midpoint).
 */
interface Props {
  vertices: ExposedVertex[]
  /** Composite uid (`vertexUid`) of the selected vertex, or null. */
  selectedKey: string | null
  onSelect: (vertex: ExposedVertex | null, clickPoint: { x: number; y: number } | null) => void
  /** Composite uid (`vertexUid`) of the hovered vertex, or null. */
  hoveredKey: string | null
  onHover: (key: string | null) => void
}

const DOT_HALF = 5
const HIT_HALF = 11

// Memoised alongside the other editor overlay layers (see EditorEdgeLayer) so
// pan/zoom frames don't re-create every diamond glyph. Bails on stable props —
// `vertices` is memoised in Canvas; `onSelect` is a useCallback there.
export const EditorVertexPlacementLayer = memo(function EditorVertexPlacementLayer({
  vertices, selectedKey, onSelect, hoveredKey, onHover,
}: Props) {
  return (
    <g id="editor-vertex-placement-layer">
      {vertices.map(v => {
        const uid = vertexUid(v)
        const isSelected = uid === selectedKey
        const isHovered = uid === hoveredKey
        const isBoundary = v.boundaryCornerIndex !== undefined
        const stroke = isSelected || isHovered ? 'var(--accent)' : 'var(--accent)'
        const fill = isSelected
          ? 'var(--accent)'
          : isHovered
            ? 'var(--accent-bg, rgba(230,201,122,0.18))'
            : isBoundary
              ? 'transparent'
              : 'var(--bg)'
        const strokeOpacity = isSelected || isHovered ? 1 : 0.85
        return (
          <g key={uid}>
            {/* Diamond glyph — rotated square outline, distinct from
                Complete-mode round dots. */}
            <rect
              x={v.p.x - DOT_HALF}
              y={v.p.y - DOT_HALF}
              width={DOT_HALF * 2}
              height={DOT_HALF * 2}
              transform={`rotate(45 ${v.p.x} ${v.p.y})`}
              fill={fill}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={isSelected ? 2.2 : 1.6}
              strokeDasharray={isBoundary && !isSelected ? '2 2' : undefined}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {/* Hit area — larger transparent diamond. */}
            <rect
              x={v.p.x - HIT_HALF}
              y={v.p.y - HIT_HALF}
              width={HIT_HALF * 2}
              height={HIT_HALF * 2}
              transform={`rotate(45 ${v.p.x} ${v.p.y})`}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onPointerDown={ev => {
                ev.stopPropagation()
                // Pass the click point so the parent can resolve a "host
                // tile" for the orientation reference (closest-tile-to-click,
                // locked decision).
                const pt = { x: v.p.x, y: v.p.y }
                onSelect(v, pt)
              }}
              onPointerEnter={() => onHover(uid)}
              onPointerLeave={() => onHover(null)}
            />
          </g>
        )
      })}
    </g>
  )
})
