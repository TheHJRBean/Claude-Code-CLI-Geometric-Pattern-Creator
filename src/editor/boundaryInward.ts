import type { EditorCell, EditorRegularTile, EditorTile } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { pointInPolygon, pointsEqual } from '../utils/math'
import { editorBoundaryVertices } from './buildEditorPolygons'
import { EDITOR_EPS, tileVertices } from './exposedEdges'
import { regularPolygonVertices } from './regularPolygon'
import { applySym, boundarySymmetries } from './symmetry'
import { overlapsExisting } from './tileOverlap'
import { PICKER_SIDES } from './placement'

/**
 * Boundary-inward authoring mode — Step 17 v2 (idea memo
 * `project_editor_boundary_inward_mode_idea.md`).
 *
 * Divides each Boundary edge into highlighted sections; clicking a section
 * places a regular n-gon flush against that segment. The tile is sized to the
 * Patch's shared seed/lattice edge length (NOT the section length) so every
 * placement method stays one uniform size (user decision 2026-05-31); the
 * section midpoint is just the anchor point along the boundary line, and the
 * placement no longer rescales `patch.edgeLength`.
 *
 * Section length is a fraction of the Boundary edge length, scaled inversely
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
 * Compute the Boundary-section click targets for a Cell. Honours
 * `alternateBoundary` via `editorBoundaryVertices`.
 */
export function computeBoundarySections(cell: EditorCell): BoundarySection[] {
  const verts = editorBoundaryVertices(cell)
  const n = verts.length
  if (n < 3) return []
  const sectionCount = sectionCountForBoundarySize(cell.boundarySize)
  const sectionLength = cell.boundarySize / sectionCount

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
 * side of the boundary. The new tile's edge length is `edgeLength` — the
 * Patch's shared seed/lattice edge — so every placement (vertex / edge /
 * section) stays one uniform size (user decision 2026-05-31). The section
 * midpoint is used only as the anchor point along the boundary line; the
 * tile's base edge of length `edgeLength` is centred on it.
 *
 * CCW convention: vertex 0 sits on the p1 (CCW-start) side of the section,
 * vertex 1 on the p2 side. The boundary is traced CCW around its own
 * interior; the new tile sits inside the boundary, so going CCW around the
 * new tile from a vertex on the shared edge runs in the SAME direction as
 * the boundary's CCW at that edge. (Contrast with `placeRegularNGonOnEdge`,
 * which uses the opposite convention because the new tile there sits OUTSIDE
 * the source tile and the CCW sense flips.)
 */
export function placeRegularNGonOnBoundarySection(
  sides: number,
  section: BoundarySection,
  id: string,
  edgeLength: number,
): EditorRegularTile {
  const { p1, p2 } = section
  const midX = (p1.x + p2.x) / 2
  const midY = (p1.y + p2.y) / 2
  // Unit vector along the boundary edge (p1 → p2) and the inward perpendicular.
  // For a CCW boundary the interior sits to the LEFT of each edge direction,
  // which is the CCW-90° rotation of the edge direction.
  const ex = p2.x - p1.x
  const ey = p2.y - p1.y
  const elen = Math.hypot(ex, ey) || 1
  const dirX = ex / elen
  const dirY = ey / elen
  const inX = -dirY
  const inY = dirX
  // Base edge of length `edgeLength` centred on the section midpoint; vertex 0
  // on the p1 side keeps the CCW convention above.
  const half = edgeLength / 2
  const v0: Vec2 = { x: midX - dirX * half, y: midY - dirY * half }
  const apothem = edgeLength / (2 * Math.tan(Math.PI / sides))
  const center: Vec2 = { x: midX + inX * apothem, y: midY + inY * apothem }
  const rotation = Math.atan2(v0.y - center.y, v0.x - center.x)
  return {
    id,
    kind: 'regular',
    sides,
    center,
    edgeLength,
    rotation,
    source: 'placed',
  }
}

/**
 * Strong-overlap viability for a boundary-section placement.
 *
 * Differs from `placement.isPlacementViable` (which is keyed on an
 * `ExposedEdge`): the boundary section has no source-Tile anchor, so the
 * angle-sum check at endpoints is skipped (section endpoints don't coincide
 * with existing-Tile vertices in any realistic case — the origin Tile is
 * far interior to the Boundary). The strong probe — does any existing Tile's
 * centre fall inside the candidate, or vice versa, or do edges strictly
 * cross — is enough to catch encroachment as the user backfills toward the
 * centre.
 */
export function isBoundarySectionPlacementViable(
  sides: number,
  section: BoundarySection,
  cell: EditorCell,
  edgeLength: number,
): boolean {
  if (sides < 3) return false
  const candidate = placeRegularNGonOnBoundarySection(sides, section, '__probe__', edgeLength)
  const candidateVerts = regularPolygonVertices(
    candidate.sides, candidate.center, candidate.edgeLength, candidate.rotation,
  )
  for (const tile of cell.tiles) {
    const tv = tileVertices(tile)
    const tc = tile.kind === 'regular' ? tile.center : avgCenter(tv)
    if (pointInPolygon(tc, candidateVerts)) return false
    if (pointInPolygon(candidate.center, tv)) return false
  }
  return !overlapsExisting(candidateVerts, cell.tiles.map(t => tileVertices(t)))
}

/** Subset of `PICKER_SIDES` that pass `isBoundarySectionPlacementViable`. */
export function viableSidesForBoundarySection(
  section: BoundarySection,
  cell: EditorCell,
  edgeLength: number,
): number[] {
  return PICKER_SIDES.filter(n => isBoundarySectionPlacementViable(n, section, cell, edgeLength))
}

/**
 * Orbit-symmetric boundary-section placement. Mirrors `placeTilesOnOrbit`'s
 * all-or-nothing semantics: every orbit image must pass viability against
 * the cumulative working state, otherwise the whole placement is rejected
 * (symmetry must never partially break).
 *
 * Orbit image lookup: each subgroup element transforms the picked section's
 * endpoints; the matching boundary section is found by endpoint match against
 * the full section list (within `EDITOR_EPS`). Sections on a fixed axis
 * collapse via centroid dedup (a square section bisected by the vertical
 * mirror coincides with its own image).
 *
 * `symmetryMode='none'` returns the identity-only group → single-section
 * behaviour by default (matches locked decision e).
 */
export function placeTilesOnBoundarySectionOrbit(
  cell: EditorCell,
  picked: BoundarySection,
  sides: number,
  idPrefix: string,
  edgeLength: number,
): EditorTile[] | null {
  if (sides < 3) return null
  const sections = computeBoundarySections(cell)
  const syms = boundarySymmetries(cell.shape, cell.symmetryMode ?? 'none')
  const seenCentroids: Vec2[] = []
  const placements: EditorTile[] = []
  let working: EditorCell = cell
  let placedIndex = 0

  for (const s of syms) {
    const q1 = applySym(s, picked.p1)
    const q2 = applySym(s, picked.p2)
    const match = sections.find(sec =>
      (pointsEqual(sec.p1, q1, EDITOR_EPS) && pointsEqual(sec.p2, q2, EDITOR_EPS))
      || (pointsEqual(sec.p1, q2, EDITOR_EPS) && pointsEqual(sec.p2, q1, EDITOR_EPS)),
    )
    if (!match) continue
    const midpoint = match.midpoint
    if (seenCentroids.some(q => pointsEqual(midpoint, q, EDITOR_EPS))) continue
    seenCentroids.push(midpoint)
    if (!isBoundarySectionPlacementViable(sides, match, working, edgeLength)) return null
    const tile = placeRegularNGonOnBoundarySection(sides, match, `${idPrefix}-${placedIndex}`, edgeLength)
    placements.push(tile)
    working = { ...working, tiles: [...working.tiles, tile] }
    placedIndex++
  }
  return placements.length > 0 ? placements : null
}

function avgCenter(verts: Vec2[]): Vec2 {
  let x = 0, y = 0
  for (const v of verts) { x += v.x; y += v.y }
  return { x: x / verts.length, y: y / verts.length }
}
