import type { EditorPatch, EditorRegularTile } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { editorBoundaryVertices } from './buildEditorPolygons'

/**
 * Boundary-inward authoring mode — Step 17 v2 (idea memo
 * `project_editor_boundary_inward_mode_idea.md`).
 *
 * Divides each boundary edge into highlighted sections; clicking a section
 * places a regular n-gon flush against that segment with edge length equal
 * to the section length. The first boundary-anchored tile then dictates the
 * patch's edge length for subsequent placements (the conflict with the
 * existing origin tile is resolved in the reducer — sub-step B).
 *
 * Section length is a fraction of the boundary edge length, scaled inversely
 * with boundary size (smaller boundary → fewer, larger targets; larger
 * boundary → more, smaller targets). Section count per edge is the integer
 * closest to `1 / fraction` so each edge is divided evenly.
 */

/** Section fraction at the lower end of the size schedule (small boundaries). */
export const SECTION_FRACTION_AT_MIN_SIZE = 0.30
/** Section fraction at the upper end of the size schedule (large boundaries). */
export const SECTION_FRACTION_AT_MAX_SIZE = 0.10

/** Boundary-size endpoints of the section-fraction schedule (world units). */
export const SECTION_SCHEDULE_MIN_BOUNDARY = 80
export const SECTION_SCHEDULE_MAX_BOUNDARY = 800

export interface BoundarySection {
  /** Which boundary edge this section lives on (0..n-1, CCW around the boundary). */
  edgeIndex: number
  /** Which section along the edge (0 = closest to the edge's CCW start vertex). */
  sectionIndex: number
  /** Section start vertex (along the boundary's CCW traversal). */
  p1: Vec2
  /** Section end vertex (along the boundary's CCW traversal). */
  p2: Vec2
  /** Midpoint — used as the UI anchor for the picker. */
  midpoint: Vec2
  /** Length of this section in world units (= edgeLength / sectionCount). */
  sectionLength: number
}

/**
 * Linear interpolation of the section fraction over the boundary-size schedule.
 * Clamps to the schedule endpoints — boundaries smaller than the schedule min
 * use the min-size fraction; larger than the max use the max-size fraction.
 */
export function sectionFractionForBoundarySize(boundarySize: number): number {
  if (boundarySize <= SECTION_SCHEDULE_MIN_BOUNDARY) return SECTION_FRACTION_AT_MIN_SIZE
  if (boundarySize >= SECTION_SCHEDULE_MAX_BOUNDARY) return SECTION_FRACTION_AT_MAX_SIZE
  const t = (boundarySize - SECTION_SCHEDULE_MIN_BOUNDARY)
    / (SECTION_SCHEDULE_MAX_BOUNDARY - SECTION_SCHEDULE_MIN_BOUNDARY)
  return SECTION_FRACTION_AT_MIN_SIZE
    + (SECTION_FRACTION_AT_MAX_SIZE - SECTION_FRACTION_AT_MIN_SIZE) * t
}

/**
 * Integer section count per boundary edge for the given boundary size.
 * Always ≥ 1 — a boundary always has at least one click target per edge.
 */
export function sectionCountForBoundarySize(boundarySize: number): number {
  const fraction = sectionFractionForBoundarySize(boundarySize)
  return Math.max(1, Math.round(1 / fraction))
}

/**
 * Compute the boundary-section click targets for a patch. Honours
 * `alternateBoundary` via `editorBoundaryVertices`.
 */
export function computeBoundarySections(patch: EditorPatch): BoundarySection[] {
  const verts = editorBoundaryVertices(patch)
  const n = verts.length
  if (n < 3) return []
  const sectionCount = sectionCountForBoundarySize(patch.boundarySize)
  const sectionLength = patch.boundarySize / sectionCount

  const out: BoundarySection[] = []
  for (let edgeIndex = 0; edgeIndex < n; edgeIndex++) {
    const a = verts[edgeIndex]
    const b = verts[(edgeIndex + 1) % n]
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex++) {
      const t0 = sectionIndex / sectionCount
      const t1 = (sectionIndex + 1) / sectionCount
      const p1: Vec2 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }
      const p2: Vec2 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 }
      const midpoint: Vec2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      out.push({ edgeIndex, sectionIndex, p1, p2, midpoint, sectionLength })
    }
  }
  return out
}

/**
 * Place a regular n-gon flush against a boundary section, on the interior
 * side of the boundary. The new tile's edge length equals the section length
 * — this is the "first tile dictates edge length" behaviour from the memo.
 *
 * CCW convention mirrors `placeRegularNGonOnEdge`: the new tile's vertex 0 is
 * `section.p2` and vertex 1 is `section.p1`, since the section runs CCW around
 * the boundary and the new tile sits on the interior (where its own CCW
 * traversal runs opposite to the boundary's at the shared edge).
 */
export function placeRegularNGonOnBoundarySection(
  sides: number,
  section: BoundarySection,
  id: string,
): EditorRegularTile {
  const { p1, p2, sectionLength } = section
  const midX = (p1.x + p2.x) / 2
  const midY = (p1.y + p2.y) / 2
  // Interior direction: from section midpoint toward the boundary centre at
  // the origin. The boundary is always centred on (0, 0) in patch-local coords
  // (see `editorBoundaryVertices`), so the interior is `-midpoint` normalised.
  const ix = -midX
  const iy = -midY
  const ilen = Math.hypot(ix, iy) || 1
  const inX = ix / ilen
  const inY = iy / ilen
  const apothem = sectionLength / (2 * Math.tan(Math.PI / sides))
  const center: Vec2 = { x: midX + inX * apothem, y: midY + inY * apothem }
  const rotation = Math.atan2(p2.y - center.y, p2.x - center.x)
  return {
    id,
    kind: 'regular',
    sides,
    center,
    edgeLength: sectionLength,
    rotation,
    origin: 'placed',
  }
}
