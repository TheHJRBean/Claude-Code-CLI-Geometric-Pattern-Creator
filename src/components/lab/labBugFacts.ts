import type { SelectedEdge } from '../Canvas'
import type { SectionKey } from '../EditorBoundaryInwardLayer'

/**
 * Pure helpers turning the Lab's local UI state into bug-report facts.
 *
 * They live outside `TessellationLabMode` so they can be tested without
 * mounting an 1100-line component, and so the vocabulary mapping below has one
 * home. The internal phase key `'strand'` is the legacy name for what the UI
 * and `CONTEXT.md` both call the **Composition** Phase — a report that said
 * "strand phase" would send a triage session looking for a Phase that doesn't
 * exist.
 */

export type LabPhaseKey = 'design' | 'strand' | 'decoration'

export const PHASE_LABELS: Record<LabPhaseKey, string> = {
  design: 'Design',
  strand: 'Composition',
  decoration: 'Decoration',
}

/**
 * The active Place-mode selection.
 *
 * The host Cell is named whenever it is known: a placement landing in the
 * wrong Cell is a defect class this project has hit more than once, so which
 * Cell the user was aiming at is worth recording verbatim.
 */
export function describeLabSelection(
  edge: SelectedEdge | null,
  section: SectionKey | null,
): string {
  if (edge) {
    const host = edge.hostCellId ? ` in ${edge.hostCellId}` : ''
    return `edge ${edge.edgeIndex} of tile ${edge.tileId}${host}`
  }
  if (section) {
    const host = section.hostCellId ? ` in ${section.hostCellId}` : ''
    return `boundary section ${section.sectionIndex} on edge ${section.edgeIndex}${host}`
  }
  return 'none'
}

export interface LabOverlayFlags {
  showStrands: boolean
  showTiles: boolean
  showGuides: boolean
  showBoundaryLattice: boolean
  showNeighbours: boolean
  showNeighbourBoundaries: boolean
  showNeighbourStrands: boolean
  /** Guides overlay toggles (#30). These default **on**, so unlike the flags
   *  above their diagnostic value is in the OFF state — a "my guides vanished"
   *  report is usually one of these. */
  showDesignGuides: boolean
  showGuideAnchors: boolean
  showNeighbourGuides: boolean
}

/**
 * The on-screen overlays, as a short list of what is *on*.
 *
 * Listing only the enabled ones keeps the fact readable, and the empty case is
 * itself diagnostic — "nothing renders" reports are regularly just Strands and
 * Tiles both switched off.
 */
export function describeLabOverlays(flags: LabOverlayFlags): string {
  const on: string[] = []
  if (flags.showStrands) on.push('strands')
  if (flags.showTiles) on.push('tiles')
  if (flags.showGuides) on.push('guides')
  if (flags.showBoundaryLattice) on.push('boundary lattice')
  if (flags.showNeighbours) on.push('neighbours')
  if (flags.showNeighbourBoundaries) on.push('neighbour boundaries')
  if (flags.showNeighbourStrands) on.push('neighbour strands')
  // Default-on Guide toggles report their OFF state instead — listing them
  // when on would drown the list, and it is the off case that explains a
  // missing overlay.
  const off: string[] = []
  if (!flags.showDesignGuides) off.push('design guides')
  if (!flags.showGuideAnchors) off.push('guide anchors')
  if (!flags.showNeighbourGuides) off.push('neighbour guides')
  const base = on.length ? on.join(', ') : 'none on'
  return off.length ? `${base} — OFF: ${off.join(', ')}` : base
}
