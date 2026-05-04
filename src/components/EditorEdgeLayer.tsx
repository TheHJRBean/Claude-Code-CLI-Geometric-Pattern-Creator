import type { ExposedEdge } from '../editor/exposedEdges'

/**
 * Step 17.3 — interactive edge layer rendered above the tile layer when an
 * editor patch is active. Hover highlights an exposed edge; click selects
 * it (the parent then opens a viable-polygon picker at the edge midpoint).
 *
 * Per Q10, every exposed edge is always live in Design mode. Non-conforming
 * edges (length ≠ patch's global edgeLength) are rendered dashed and inert.
 *
 * Hit-testing uses an invisible thick stroke so the user can hover/click the
 * edge without pixel-perfect aim. Pointer events on edges stop propagation
 * so the SVG-level pan handler doesn't kick in.
 */
interface Props {
  edges: ExposedEdge[]
  selected: { tileId: string; edgeIndex: number } | null
  onSelect: (edge: { tileId: string; edgeIndex: number } | null) => void
  hovered: { tileId: string; edgeIndex: number } | null
  onHover: (edge: { tileId: string; edgeIndex: number } | null) => void
}

export function EditorEdgeLayer({ edges, selected, onSelect, hovered, onHover }: Props) {
  return (
    <g id="editor-edge-layer">
      {edges.map(e => {
        const isSelected = selected?.tileId === e.tileId && selected.edgeIndex === e.edgeIndex
        const isHovered = hovered?.tileId === e.tileId && hovered.edgeIndex === e.edgeIndex
        const stroke = !e.conforming
          ? 'var(--text-muted)'
          : isSelected
            ? 'var(--accent)'
            : isHovered
              ? 'var(--accent)'
              : 'transparent'
        const opacity = !e.conforming ? 0.55 : isSelected ? 1 : isHovered ? 0.75 : 1
        return (
          <g key={`${e.tileId}#${e.edgeIndex}`}>
            {/* Visible edge — only rendered when interesting, otherwise the polygon's
                own outline already handles drawing. */}
            <line
              x1={e.p1.x} y1={e.p1.y} x2={e.p2.x} y2={e.p2.y}
              stroke={stroke}
              strokeOpacity={opacity}
              strokeWidth={isSelected ? 2.4 : 1.6}
              strokeDasharray={!e.conforming ? '3 3' : undefined}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {/* Hit area — invisible thick stroke. Inert when non-conforming. */}
            {e.conforming && (
              <line
                x1={e.p1.x} y1={e.p1.y} x2={e.p2.x} y2={e.p2.y}
                stroke="transparent"
                strokeWidth={12}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'pointer' }}
                onPointerDown={ev => {
                  ev.stopPropagation()
                  onSelect({ tileId: e.tileId, edgeIndex: e.edgeIndex })
                }}
                onPointerEnter={() => onHover({ tileId: e.tileId, edgeIndex: e.edgeIndex })}
                onPointerLeave={() => onHover(null)}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}
