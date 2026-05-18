import type { BoundarySection } from '../editor/boundaryInward'

/**
 * Step 17.12c — interactive Boundary-section layer rendered above the Tile
 * layer in Design Phase + Place mode (single-cell Patches only, per locked
 * decision b). Sections are click targets that anchor a regular n-gon flush
 * against the chosen portion of the Boundary (see `editor/boundaryInward.ts`
 * and the reducer's `EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION` case).
 *
 * Always-on — boundary-section placement is a standard part of Design Phase,
 * not a separate mode. Rendered alongside `EditorEdgeLayer`; sections are
 * transparent at rest (no visual clutter at the boundary) and accent on
 * hover / selection. Hit-test uses an invisible thick stroke, matching
 * `EditorEdgeLayer`.
 *
 * Sections render *underneath* the edge layer in z-order so a click landing
 * on a coincident Tile edge hits the edge layer first (tile-priority). When
 * the click hits only a section, the section wins.
 */
export interface SectionKey {
  edgeIndex: number
  sectionIndex: number
}

interface Props {
  sections: BoundarySection[]
  selected: SectionKey | null
  onSelect: (section: SectionKey | null) => void
  hovered: SectionKey | null
  onHover: (section: SectionKey | null) => void
}

function sameSection(a: SectionKey | null, s: BoundarySection): boolean {
  return !!a && a.edgeIndex === s.edgeIndex && a.sectionIndex === s.sectionIndex
}

export function EditorBoundaryInwardLayer({ sections, selected, onSelect, hovered, onHover }: Props) {
  return (
    <g id="editor-boundary-inward-layer">
      {sections.map(s => {
        const isSelected = sameSection(selected, s)
        const isHovered = sameSection(hovered, s)
        const stroke = isSelected || isHovered ? 'var(--accent)' : 'transparent'
        const opacity = isSelected ? 1 : isHovered ? 0.85 : 0
        const key = `${s.edgeIndex}#${s.sectionIndex}`
        const sectionKey: SectionKey = { edgeIndex: s.edgeIndex, sectionIndex: s.sectionIndex }
        return (
          <g key={key}>
            <line
              x1={s.p1.x} y1={s.p1.y} x2={s.p2.x} y2={s.p2.y}
              stroke={stroke}
              strokeOpacity={opacity}
              strokeWidth={isSelected ? 3 : 2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <line
              x1={s.p1.x} y1={s.p1.y} x2={s.p2.x} y2={s.p2.y}
              stroke="transparent"
              strokeWidth={14}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'pointer' }}
              onPointerDown={ev => {
                ev.stopPropagation()
                onSelect(sectionKey)
              }}
              onPointerEnter={() => onHover(sectionKey)}
              onPointerLeave={() => onHover(null)}
            />
          </g>
        )
      })}
    </g>
  )
}
