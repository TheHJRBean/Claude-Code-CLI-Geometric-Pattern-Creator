import type { Vec2 } from '../utils/math'
import { centroid, dist, pointInPolygon, pointsEqual } from '../utils/math'
import type { EditorCell, EditorRegularTile, EditorTile } from '../types/editor'
import { EDITOR_EPS, tileVertices } from './exposedEdges'
import { editorBoundaryVertices } from './buildEditorPolygons'
import { regularPolygonVertices } from './regularPolygon'
import { placedTileOverlaps } from './tileOverlap'

/**
 * Step 17.13 — vertex placement (sub-step A: geometry foundation).
 *
 * Sibling to edge placement (`placement.ts`) and boundary-section placement
 * (`boundaryInward.ts`). A vertex placement anchors one corner of a regular
 * n-gon at an exposed Cell corner (or an inward-only Boundary corner) and
 * chooses an orientation from the discrete set of viable rotations that keep
 * the new Tile inside the open angular sector around the vertex.
 *
 * **Layer scope** — pure geometry + viability. No reducer / UI wiring (see
 * 17.13b for the reducer and 17.13c for the picker UI).
 *
 * **Locked design decisions** (this conversation, 2026-05-18):
 *   - Always-on in Design Phase + Place mode (mirrors 17.12 boundary-inward).
 *   - Boundary corners are selectable but placement is **inward-only** — the
 *     new Tile may not extend past the Boundary polygon.
 *   - Orientation arrows snap between **viable positions** (flush-CW,
 *     centred-in-sector, flush-CCW per open sector). No continuous rotation.
 *   - Symmetry orbit propagates like edge placement (see 17.13b).
 */

/* ── Types ─────────────────────────────────────────────────────────────── */

/**
 * Stable identifier for a vertex, used to round-trip a click through the
 * reducer payload. Built from rounded coordinates so two clicks on the same
 * physical vertex resolve to the same key after the floating-point trig
 * jitter that builds up across Tile rotations.
 */
export type VertexKey = string

const VERTEX_KEY_DECIMALS = 4

export function vertexKeyOf(p: Vec2): VertexKey {
  const r = Math.pow(10, VERTEX_KEY_DECIMALS)
  return `${Math.round(p.x * r) / r},${Math.round(p.y * r) / r}`
}

/** One Tile's incidence at a vertex — kept so the picker can resolve a
 *  "host" tile for the orientation reference (closest-tile-to-click). */
export interface IncidentTile {
  tileId: string
  /** Vertex index within the owning Tile. */
  vertexIndex: number
  /** Interior angle of the Tile at this vertex, radians. */
  interiorAngle: number
  /** Outgoing edge angle in radians — direction CCW along the Tile boundary
   *  (from this vertex to next-CCW vertex). The Tile's interior wedge at the
   *  vertex spans CCW from `outAngle` for `interiorAngle`. */
  outAngle: number
}

/** One angular sector around a vertex that no existing Tile or boundary
 *  exterior occupies. Stored in radians; `sweep > 0` always. The sector
 *  occupies the CCW arc [startAngle, startAngle + sweep]; startAngle is in
 *  [0, 2π) but startAngle + sweep may exceed 2π (no normalisation). */
export interface OpenSector {
  startAngle: number
  sweep: number
}

/** A corner where a regular n-gon could be anchored. */
export interface ExposedVertex {
  /** Position in cell-local coords. */
  p: Vec2
  /** Stable key for round-tripping through the reducer. */
  key: VertexKey
  /** Tiles that already touch this corner. Empty when the vertex is a
   *  free Boundary corner with no Tile yet anchored to it. */
  incidentTiles: IncidentTile[]
  /** Set when this corner is a Boundary polygon corner (index into the
   *  Boundary's CCW vertex array). When present, the available wedge is
   *  clipped to the Boundary's inward side. */
  boundaryCornerIndex?: number
  /** Open angular sectors around the vertex — at least one is present (we
   *  drop fully-occupied vertices from `computeExposedVertices`). */
  openSectors: OpenSector[]
}

/** One viable orientation for a candidate n-gon at a vertex. */
export interface VertexOrientation {
  /** Index of the open sector this orientation lives in. */
  sectorIndex: number
  /** Outgoing-edge angle of the new Tile at this vertex (radians). The new
   *  Tile's edge 0→1 leaves the vertex at this angle; its interior wedge at
   *  the vertex spans CCW from `rotation` for `(sides-2)π/sides`. */
  rotation: number
  /** Tag identifying the snap kind — used by the picker to label arrows. */
  kind: 'flush-cw' | 'centred' | 'flush-ccw'
  /** True when this orientation's body overlaps an existing Tile. The
   *  orientation is still offered (flexible placement) but the picker badges
   *  it and the commit dispatches with `force: true`. Sector-fit failures are
   *  NOT included here — those orientations aren't emitted at all. */
  overlaps: boolean
}

/* ── Angle helpers ─────────────────────────────────────────────────────── */

const TAU = 2 * Math.PI

/** Normalise to [0, 2π). */
function norm(a: number): number {
  let x = a % TAU
  if (x < 0) x += TAU
  return x
}

/** CCW sweep from `from` to `to` in [0, 2π). */
function ccwSweep(from: number, to: number): number {
  return norm(to - from)
}

/* ── Tile incidence ────────────────────────────────────────────────────── */

/** Interior angle of `tile` at its vertex with index `i`. */
function tileInteriorAngleAt(tile: EditorTile, verts: Vec2[], i: number): number {
  if (tile.kind === 'regular') return ((tile.sides - 2) * Math.PI) / tile.sides
  const n = verts.length
  const prev = verts[(i - 1 + n) % n]
  const next = verts[(i + 1) % n]
  const v1x = prev.x - verts[i].x
  const v1y = prev.y - verts[i].y
  const v2x = next.x - verts[i].x
  const v2y = next.y - verts[i].y
  const cosA = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))
  return Math.acos(Math.max(-1, Math.min(1, cosA)))
}

/** Outgoing edge angle of `tile` at vertex `i` — direction from `verts[i]`
 *  to `verts[(i+1) % n]` (CCW along the Tile boundary). */
function tileOutAngleAt(verts: Vec2[], i: number): number {
  const n = verts.length
  const next = verts[(i + 1) % n]
  return Math.atan2(next.y - verts[i].y, next.x - verts[i].x)
}

/* ── Open sector computation ───────────────────────────────────────────── */

/**
 * Subtract a Tile's interior wedge from a list of remaining open sectors.
 * Wedge spans CCW from `start` for `sweep`. Returns the surviving open
 * sectors (may split a sector in two if the wedge sits in its interior).
 *
 * Both inputs and outputs use the same convention: `startAngle` in [0, 2π),
 * `sweep` > 0 (may extend past 2π — we work in the "unrolled" arithmetic).
 */
function subtractWedge(open: OpenSector[], wedgeStart: number, wedgeSweep: number): OpenSector[] {
  const result: OpenSector[] = []
  const ws = norm(wedgeStart)
  const we = ws + wedgeSweep
  for (const sec of open) {
    const ss = sec.startAngle
    const se = ss + sec.sweep
    // Convert wedge into the same "unrolled" frame as the sector.
    // The sector lives in [ss, se]; the wedge may sit anywhere on the circle.
    // Try both representations of the wedge (ws,we) and (ws + 2π, we + 2π)
    // and intersect with the sector.
    const candidates: Array<[number, number]> = [
      [ws, we],
      [ws + TAU, we + TAU],
      [ws - TAU, we - TAU],
    ]
    let surviving: Array<[number, number]> = [[ss, se]]
    for (const [a, b] of candidates) {
      const next: Array<[number, number]> = []
      for (const [s, e] of surviving) {
        const overlapStart = Math.max(s, a)
        const overlapEnd = Math.min(e, b)
        if (overlapEnd - overlapStart > EDITOR_EPS) {
          // Wedge overlaps this sub-sector — split.
          if (overlapStart - s > EDITOR_EPS) next.push([s, overlapStart])
          if (e - overlapEnd > EDITOR_EPS) next.push([overlapEnd, e])
        } else {
          next.push([s, e])
        }
      }
      surviving = next
    }
    for (const [s, e] of surviving) {
      result.push({ startAngle: norm(s), sweep: e - s })
    }
  }
  return result
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Compute every Cell corner that could anchor a new Tile via vertex
 * placement. Walks Tile corners and Boundary corners; groups coincident
 * points; builds the open angular sectors around each.
 *
 * Boundary corners with no incident Tile still appear — anchoring at the
 * corner of an empty Cell is a natural seed move. Their open sectors are
 * clipped to the Boundary's inward wedge (the new Tile must not extend
 * outside the Boundary polygon).
 */
export function computeExposedVertices(cell: EditorCell): ExposedVertex[] {
  const tiles = cell.tiles
  const vertsByTile = tiles.map(tileVertices)
  const boundaryVerts = editorBoundaryVertices(cell)

  // Phase 1 — collect every (point, incident-tile-record) pair.
  interface Group {
    p: Vec2
    incidents: IncidentTile[]
    boundaryCornerIndex?: number
  }
  const groups: Group[] = []

  const findOrCreateGroup = (p: Vec2): Group => {
    for (const g of groups) {
      if (pointsEqual(g.p, p, EDITOR_EPS)) return g
    }
    const g: Group = { p, incidents: [] }
    groups.push(g)
    return g
  }

  for (let ti = 0; ti < tiles.length; ti++) {
    const verts = vertsByTile[ti]
    for (let vi = 0; vi < verts.length; vi++) {
      const g = findOrCreateGroup(verts[vi])
      g.incidents.push({
        tileId: tiles[ti].id,
        vertexIndex: vi,
        interiorAngle: tileInteriorAngleAt(tiles[ti], verts, vi),
        outAngle: tileOutAngleAt(verts, vi),
      })
    }
  }

  for (let bi = 0; bi < boundaryVerts.length; bi++) {
    const g = findOrCreateGroup(boundaryVerts[bi])
    g.boundaryCornerIndex = bi
  }

  // Phase 2 — build open sectors per group.
  const exposed: ExposedVertex[] = []
  for (const g of groups) {
    let openSectors: OpenSector[]
    if (g.boundaryCornerIndex !== undefined) {
      // Boundary corner — start from the inward wedge.
      const bi = g.boundaryCornerIndex
      const n = boundaryVerts.length
      const next = boundaryVerts[(bi + 1) % n]
      const prev = boundaryVerts[(bi - 1 + n) % n]
      const outAngle = Math.atan2(next.y - g.p.y, next.x - g.p.x)
      const inReversedAngle = Math.atan2(prev.y - g.p.y, prev.x - g.p.x)
      // Boundary polygon is CCW (regularPolygonVertices is CCW). Interior is
      // on the left of the CCW traversal — i.e., the wedge swept CCW from
      // `outAngle` to `inReversedAngle`. For a regular n-gon Boundary this
      // sweep equals the polygon's interior angle (n-2)π/n.
      const sweep = ccwSweep(outAngle, inReversedAngle)
      openSectors = [{ startAngle: norm(outAngle), sweep }]
    } else {
      openSectors = [{ startAngle: 0, sweep: TAU }]
    }

    // Subtract each incident Tile's interior wedge.
    for (const inc of g.incidents) {
      openSectors = subtractWedge(openSectors, inc.outAngle, inc.interiorAngle)
    }

    // Drop sectors below an epsilon sweep — these are degenerate slivers
    // from floating-point error around fully-shared corners.
    openSectors = openSectors.filter(s => s.sweep > EDITOR_EPS * 10)
    if (openSectors.length === 0) continue

    exposed.push({
      p: g.p,
      key: vertexKeyOf(g.p),
      incidentTiles: g.incidents,
      boundaryCornerIndex: g.boundaryCornerIndex,
      openSectors,
    })
  }

  return exposed
}

/**
 * Place a regular n-gon so that its vertex 0 sits at `vertex.p` and its
 * edge 0→1 leaves at angle `rotation` (radians, world frame).
 *
 * The Tile's CCW vertex order means its interior wedge at vertex 0 spans
 * CCW from `rotation` for `(n-2)π/n` — the caller picks `rotation` to land
 * the wedge inside one of `vertex.openSectors`.
 */
export function placeRegularNGonOnVertex(
  sides: number,
  edgeLength: number,
  vertex: ExposedVertex,
  rotation: number,
  id: string,
): EditorRegularTile {
  const n = Math.max(3, Math.floor(sides))
  const R = edgeLength / (2 * Math.sin(Math.PI / n))
  // Chord 0→1 makes angle `rotation` from vertex 0. Vertex 0 sits at angle
  // `tileRotation` from the centre (regularPolygonVertices convention).
  // The chord 0→1 direction is perpendicular (CCW) to the centre-to-chord-
  // midpoint direction, which is at angle `tileRotation + π/n`. So:
  //   rotation = tileRotation + π/n + π/2
  // ⇒ tileRotation = rotation - π/n - π/2.
  const tileRotation = rotation - Math.PI / n - Math.PI / 2
  const center: Vec2 = {
    x: vertex.p.x - R * Math.cos(tileRotation),
    y: vertex.p.y - R * Math.sin(tileRotation),
  }
  return {
    id,
    kind: 'regular',
    sides: n,
    center,
    edgeLength,
    rotation: tileRotation,
    source: 'placed',
  }
}

/**
 * Does a candidate Tile with `sides` at orientation `rotation` fit at
 * `vertex` without overlapping any existing Tile body? The angle-sum gate
 * is already enforced by `vertexPlacementOrientations` (which only emits
 * orientations whose wedge fits in an open sector), so this is the body-
 * overlap probe — mirrors `isPlacementViable`'s second half.
 */
export function isVertexPlacementViable(
  vertex: ExposedVertex,
  sides: number,
  rotation: number,
  edgeLength: number,
  cell: EditorCell,
): boolean {
  if (sides < 3) return false
  const candidate = placeRegularNGonOnVertex(sides, edgeLength, vertex, rotation, '__probe__')
  const candidateVerts = regularPolygonVertices(
    candidate.sides,
    candidate.center,
    candidate.edgeLength,
    candidate.rotation,
  )
  // Shared body-overlap probe (centre-containment + edge-cross/vertex-intrusion,
  // identical across the edge + boundary-section validators).
  if (placedTileOverlaps(candidateVerts, candidate.center, cell.tiles)) return false
  // Boundary corner — verify the candidate centre lies inside the Boundary
  // polygon (inward-only constraint). For interior vertices this is always
  // true given the open-sector gate so we skip it.
  if (vertex.boundaryCornerIndex !== undefined) {
    const boundaryVerts = editorBoundaryVertices(cell)
    if (!pointInPolygon(candidate.center, boundaryVerts)) return false
  }
  return true
}

/**
 * Enumerate the viable snap orientations for a candidate n-gon at `vertex`.
 *
 * Per open sector: flush-CW (new Tile's first edge coincides with the CW
 * end of the sector), centred-in-sector (only when the sector strictly
 * exceeds the candidate's interior angle), and flush-CCW. When a sector
 * exactly fits the candidate (sweep ≈ interiorAngle), the three snaps
 * collapse to one (kind = 'centred').
 *
 * Flexible-placement model (2026-06-01): orientations whose body overlaps an
 * existing Tile are STILL emitted, tagged `overlaps: true`, so the user can
 * place them through a skippable warning. Only orientations whose sector is
 * too narrow to contain the candidate's interior angle are omitted (there is
 * no sensible rotation to offer there). Callers wanting overlap-free
 * orientations filter on `!o.overlaps`.
 *
 * The picker arrows (17.13c) cycle through this array in order.
 */
export function vertexPlacementOrientations(
  vertex: ExposedVertex,
  sides: number,
  edgeLength: number,
  cell: EditorCell,
): VertexOrientation[] {
  if (sides < 3) return []
  const interior = ((sides - 2) * Math.PI) / sides
  const result: VertexOrientation[] = []

  for (let si = 0; si < vertex.openSectors.length; si++) {
    const sec = vertex.openSectors[si]
    // Strict fit margin — sliver fits from floating-point noise (e.g.
    // sweep === interior + 1e-12) shouldn't get split into flush-CW /
    // centred / flush-CCW; collapse them to one.
    if (sec.sweep < interior - EDITOR_EPS) continue

    const fits = sec.sweep - interior
    const candidates: Array<Omit<VertexOrientation, 'overlaps'>> = []
    if (fits < EDITOR_EPS * 10) {
      candidates.push({ sectorIndex: si, rotation: sec.startAngle, kind: 'centred' })
    } else {
      candidates.push({ sectorIndex: si, rotation: sec.startAngle, kind: 'flush-cw' })
      candidates.push({ sectorIndex: si, rotation: sec.startAngle + fits / 2, kind: 'centred' })
      candidates.push({ sectorIndex: si, rotation: sec.startAngle + fits, kind: 'flush-ccw' })
    }
    for (const c of candidates) {
      const overlaps = !isVertexPlacementViable(vertex, sides, c.rotation, edgeLength, cell)
      result.push({ ...c, overlaps })
    }
  }
  return result
}

/** Subset of `pickerSides` that produce at least one overlap-free orientation
 *  at `vertex` — the "clean" set. Sizes that can only be placed with an
 *  overlap warning are excluded here (see `placeableSidesForVertex`). */
export function viableSidesForVertex(
  vertex: ExposedVertex,
  edgeLength: number,
  cell: EditorCell,
  pickerSides: readonly number[],
): number[] {
  return pickerSides.filter(n =>
    vertexPlacementOrientations(vertex, n, edgeLength, cell).some(o => !o.overlaps),
  )
}

/** Subset of `pickerSides` that produce at least one orientation at all
 *  (overlapping or not). The picker shows these; sizes in this set but NOT in
 *  `viableSidesForVertex` are the force-with-warning candidates. Sizes absent
 *  here have no angularly-fitting sector and stay disabled. */
export function placeableSidesForVertex(
  vertex: ExposedVertex,
  edgeLength: number,
  cell: EditorCell,
  pickerSides: readonly number[],
): number[] {
  return pickerSides.filter(n =>
    vertexPlacementOrientations(vertex, n, edgeLength, cell).length > 0,
  )
}

/**
 * Disambiguate which incident Tile is the "host" for the orientation
 * reference — used by the picker to show rotation relative to the Tile the
 * user visually clicked on. Returns the incident Tile whose body centre is
 * closest to `clickPoint`. Falls back to the first incident when no click
 * point is available, and to `null` when the vertex has no incident Tiles
 * (an empty Cell's Boundary corner).
 */
export function hostTileForClick(
  vertex: ExposedVertex,
  cell: EditorCell,
  clickPoint: Vec2 | null,
): IncidentTile | null {
  if (vertex.incidentTiles.length === 0) return null
  if (!clickPoint || vertex.incidentTiles.length === 1) return vertex.incidentTiles[0]
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < vertex.incidentTiles.length; i++) {
    const inc = vertex.incidentTiles[i]
    const tile = cell.tiles.find(t => t.id === inc.tileId)
    if (!tile) continue
    const c = tile.kind === 'regular' ? tile.center : centroid(tileVertices(tile))
    const d = dist(c, clickPoint)
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return vertex.incidentTiles[bestIdx]
}
