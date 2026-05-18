import type { BoundarySection } from '../editor/boundaryInward'

/**
 * Step 17.12c — interactive Boundary-section layer rendered above the Tile
 * layer when the active Cell has `boundaryInward` on and the Builder is in
 * Place mode. Sections are click targets that anchor a regular n-gon flush
 * against the chosen portion of the Boundary (see `editor/boundaryInward.ts`
 * and the reducer's `EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION` case).
 *
 * Additive per locked decision a: the standard exposed-edge layer renders in
 * parallel so the user keeps the centre-out flow alongside boundary-inward.
 * Hit-test uses an invisible thick stroke, matching `EditorEdgeLayer`.
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
        const stroke = isSelected || isHovered
          ? 'var(--accent)'
          : 'var(--accent)'
        const opacity = isSelected ? 1 : isHovered ? 0.85 : 0.45
        const key = `${s.edgeIndex}#${s.sectionIndex}`
        const sectionKey: SectionKey = { edgeIndex: s.edgeIndex, sectionIndex: s.sectionIndex }
        return (
          <g key={key}>
            {/* Visible section highlight — dashed accent when idle so it
                doesn't compete with the solid edge layer below, solid on
                hover / selection. */}
            <line
              x1={s.p1.x} y1={s.p1.y} x2={s.p2.x} y2={s.p2.y}
              stroke={stroke}
              strokeOpacity={opacity}
              strokeWidth={isSelected ? 3 : 2}
              strokeLinecap="round"
              strokeDasharray={isSelected || isHovered ? undefined : '4 4'}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {/* Hit area. */}
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
