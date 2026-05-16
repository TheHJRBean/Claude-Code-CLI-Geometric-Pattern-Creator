import type { ExposedEdge } from '../editor/exposedEdges'

/**
 * Step 17.3 — interactive edge layer rendered above the Tile layer when a
 * Builder Patch is active. Hover highlights an exposed edge; click selects
 * it (the parent then opens a viable-polygon picker at the edge midpoint).
 *
 * Per Q10, every exposed edge is always live in the Design Phase. Non-
 * conforming edges (length ≠ Patch's shared edgeLength) are rendered dashed;
 * per Decision 14a they refuse polygon placement, but as of 17.5 they're
 * still clickable so the user can delete the owning completed Tile through
 * the picker's empty-state + Delete button.
 *
 * Hit-testing uses an invisible thick stroke so the user can hover/click the
 * edge without pixel-perfect aim. Pointer events on edges stop propagation
 * so the SVG-level pan handler doesn't kick in.
 */
interface EdgeKey {
  tileId: string
  edgeIndex: number
  hostCellId?: string
}

interface Props {
  edges: ExposedEdge[]
  selected: EdgeKey | null
  onSelect: (edge: EdgeKey | null) => void
  hovered: EdgeKey | null
  onHover: (edge: EdgeKey | null) => void
}

function sameEdge(a: EdgeKey | null | undefined, e: ExposedEdge): boolean {
  if (!a) return false
  return a.tileId === e.tileId
    && a.edgeIndex === e.edgeIndex
    && (a.hostCellId ?? null) === (e.hostCellId ?? null)
}

export function EditorEdgeLayer({ edges, selected, onSelect, hovered, onHover }: Props) {
  return (
    <g id="editor-edge-layer">
      {edges.map(e => {
        const isSelected = sameEdge(selected, e)
        const isHovered = sameEdge(hovered, e)
        const stroke = isSelected || isHovered
          ? 'var(--accent)'
          : !e.conforming
            ? 'var(--text-muted)'
            : 'transparent'
        const opacity = isSelected ? 1 : isHovered ? 0.75 : !e.conforming ? 0.55 : 1
        const key = e.hostCellId
          ? `${e.hostCellId}/${e.tileId}#${e.edgeIndex}`
          : `${e.tileId}#${e.edgeIndex}`
        const edgeKey: EdgeKey = {
          tileId: e.tileId,
          edgeIndex: e.edgeIndex,
          hostCellId: e.hostCellId,
        }
        return (
          <g key={key}>
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
            {/* Hit area — invisible thick stroke. Non-conforming edges still
                accept clicks so the user can reach the Delete button on a
                completed-tile edge (no polygon placement, picker empty state). */}
            <line
              x1={e.p1.x} y1={e.p1.y} x2={e.p2.x} y2={e.p2.y}
              stroke="transparent"
              strokeWidth={12}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'pointer' }}
              onPointerDown={ev => {
                ev.stopPropagation()
                onSelect(edgeKey)
              }}
              onPointerEnter={() => onHover(edgeKey)}
              onPointerLeave={() => onHover(null)}
            />
          </g>
        )
      })}
    </g>
  )
}
