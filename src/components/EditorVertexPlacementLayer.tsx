import type { ExposedVertex } from '../editor/vertexPlacement'
import type { VertexKey } from '../editor/vertexPlacement'

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
  selectedKey: VertexKey | null
  onSelect: (vertex: ExposedVertex | null, clickPoint: { x: number; y: number } | null) => void
  hoveredKey: VertexKey | null
  onHover: (key: VertexKey | null) => void
}

const DOT_HALF = 5
const HIT_HALF = 11

export function EditorVertexPlacementLayer({
  vertices, selectedKey, onSelect, hoveredKey, onHover,
}: Props) {
  return (
    <g id="editor-vertex-placement-layer">
      {vertices.map(v => {
        const isSelected = v.key === selectedKey
        const isHovered = v.key === hoveredKey
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
          <g key={v.key}>
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
              onPointerEnter={() => onHover(v.key)}
              onPointerLeave={() => onHover(null)}
            />
          </g>
        )
      })}
    </g>
  )
}
