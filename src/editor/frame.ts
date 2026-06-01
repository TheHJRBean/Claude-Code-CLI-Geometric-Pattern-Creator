import type { Vec2 } from '../utils/math'
import type { EditorIrregularTile, EditorRegularTile, FrameConfig, FrameShape } from '../types/editor'
import { ensureCCW } from './complete'

/**
 * Step 17 Framing — Shape **Frame** outline geometry.
 *
 * Computes the world-space outline polygon for a `'shape'`-type Frame
 * (square / hexagon / octagon), centred on `frame.origin` (default world
 * origin), scaled by `size`, stretched by `aspect`, and rotated by
 * `rotation`. The polygon is the clip region the Composition is wrapped in,
 * and (slice 4+) the boundary that **Frame nodes** are walked along.
 *
 * n-ring Frames are handled elsewhere (they derive their outline from the
 * Patch-stamp shells, not a parametric shape) — `frameOutlinePolygon`
 * returns `null` for them.
 */

const SHAPE_SIDES: Record<FrameShape, number> = { square: 4, hexagon: 6, octagon: 8 }

/**
 * Per-shape base phase (radians) so each shape sits "upright" at
 * `rotation = 0`: a square with axis-aligned edges, a flat-top hexagon, and
 * an axis-aligned octagon (stop-sign orientation).
 */
const SHAPE_PHASE: Record<FrameShape, number> = {
  square: Math.PI / 4,
  hexagon: 0,
  octagon: Math.PI / 8,
}

/** Default Shape-Frame size (circumradius in world units). */
export const DEFAULT_FRAME_SIZE = 400
export const MIN_FRAME_SIZE = 80
/** Generous world-unit ceiling for the Frame circumradius. The Gallery sizes
 * the Frame in whole repeat units capped at `MAX_FRAME_UNITS`; this px ceiling
 * just needs enough headroom that the top unit never clamps (which would make
 * the unit slider snap back). 8000 = 16 units of a 500-unit repeat. */
export const MAX_FRAME_SIZE = 8000
/** Maximum Frame size in tiling repeat units (the Gallery unit-sizing cap). */
export const MAX_FRAME_UNITS = 16

/** √2 rectangle aspect — A-series, paper-friendly. */
export const SQRT2 = Math.SQRT2

/**
 * World-space outline polygon (CCW) for a Shape Frame, or `null` for n-ring
 * Frames / unknown shapes. `size` is the circumradius before aspect; `aspect`
 * stretches width (x); `rotation` turns the whole outline about `origin`.
 */
export function frameOutlinePolygon(frame: FrameConfig): Vec2[] | null {
  if (frame.type !== 'shape') return null
  const shape = frame.shape ?? 'square'
  const n = SHAPE_SIDES[shape]
  const R = frame.size ?? DEFAULT_FRAME_SIZE
  const aspect = frame.aspect ?? 1
  const rot = frame.rotation ?? 0
  const ox = frame.origin?.x ?? 0
  const oy = frame.origin?.y ?? 0
  const phase = SHAPE_PHASE[shape]
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = phase + (2 * Math.PI * i) / n
    // Base vertex on the unit circle, scaled by R; aspect stretches width.
    const px = R * aspect * Math.cos(a)
    const py = R * Math.sin(a)
    // Apply the user rotation about the origin.
    out.push({ x: ox + (px * cos - py * sin), y: oy + (px * sin + py * cos) })
  }
  return out
}

/**
 * One placement target along a Frame's edge: the segment between two adjacent
 * **Frame nodes**. Full sections have length `edgeLength`; the trailing `stub`
 * on each edge (< `edgeLength`) is what the irregular Complete fallback
 * absorbs (slice 5). Mirrors `boundaryInward.ts`'s `BoundarySection` shape so
 * the completion code can share placement logic — the difference is purely the
 * spacing rule (absolute `edgeLength` here vs. the fraction schedule there).
 */
export interface FrameSection {
  /** Index of the outline edge this section lies on. */
  edgeIndex: number
  /** Index of the section within its edge, from the start corner. */
  sectionIndex: number
  /** Section start node (corner-ward). */
  p1: Vec2
  /** Section end node. */
  p2: Vec2
  /** Section midpoint. */
  midpoint: Vec2
  /** Length in world units (`edgeLength` for full sections, < it for a stub). */
  length: number
  /** True for the trailing remainder section that doesn't fit a full node span. */
  isStub: boolean
}

/**
 * Walk each edge of a Frame `outline`, placing **Frame nodes** every exact
 * `edgeLength`, **centred on the edge**: the full sections are centred about
 * the edge midpoint and the remainder is split into two equal `isStub`
 * half-sections, one at each corner. Centring keeps the node pattern symmetric
 * about every edge's midpoint (and under the frame's own symmetry), so nodes
 * grow symmetrically as the frame is resized rather than sliding toward one
 * corner. Stubs (the < edgeLength remainders) are reserved for the irregular
 * Complete fallback. Returns sections edge by edge, CCW.
 */
export function computeFrameSections(outline: Vec2[], edgeLength: number): FrameSection[] {
  const sections: FrameSection[] = []
  if (outline.length < 3 || edgeLength <= 0) return sections
  const eps = edgeLength * 1e-3
  const n = outline.length
  for (let i = 0; i < n; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const edgeLen = Math.hypot(dx, dy)
    if (edgeLen <= eps) continue
    const ux = dx / edgeLen
    const uy = dy / edgeLen
    const at = (d: number): Vec2 => ({ x: a.x + ux * d, y: a.y + uy * d })
    const push = (d1: number, d2: number, isStub: boolean) => {
      const p1 = at(d1)
      const p2 = at(d2)
      sections.push({
        edgeIndex: i,
        sectionIndex: sections.length, // overwritten below to be per-edge
        p1,
        p2,
        midpoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        length: d2 - d1,
        isStub,
      })
    }
    const full = Math.floor(edgeLen / edgeLength)
    const half = (edgeLen - full * edgeLength) / 2 // half-stub at each corner
    const start = sections.length
    // Leading half-stub (toward corner `a`).
    if (half > eps) push(0, half, true)
    // Full, centred sections.
    for (let k = 0; k < full; k++) push(half + k * edgeLength, half + (k + 1) * edgeLength, false)
    // Trailing half-stub (toward corner `b`).
    if (half > eps) push(half + full * edgeLength, edgeLen, true)
    // Re-index sectionIndex per edge (0..m-1).
    for (let s = start; s < sections.length; s++) sections[s].sectionIndex = s - start
  }
  return sections
}

/**
 * The distinct **Frame node** points (section start corners) for rendering.
 * Because the outline is closed, every node appears as some section's `p1`.
 */
export function frameNodePoints(sections: FrameSection[]): Vec2[] {
  return sections.map(s => s.p1)
}

/**
 * Build a regular n-gon flush against a **Frame section**, on the interior
 * (inward, toward the Frame centre) side, with one edge coincident with the
 * section. Edge length = the section length (= seed `edgeLength` for full
 * sections), so the placed Tile tessellates with the interior pattern.
 *
 * Mirrors `boundaryInward.ts::placeRegularNGonOnBoundarySection` — the Frame
 * outline is CCW, so the interior sits to the LEFT of each `p1 → p2` edge, and
 * the inward normal is the CCW-90° rotation of the edge direction. Tiles are
 * tagged `source: 'completed'` (frame-scoped completion, ADR-0004).
 */
export function placeRegularNGonOnFrameSection(
  sides: number,
  section: FrameSection,
  id: string,
): EditorRegularTile {
  const { p1, p2, length } = section
  const midX = (p1.x + p2.x) / 2
  const midY = (p1.y + p2.y) / 2
  const ex = p2.x - p1.x
  const ey = p2.y - p1.y
  const elen = Math.hypot(ex, ey) || 1
  // Inward (interior) normal: CCW-90° rotation of the edge direction.
  const inX = -ey / elen
  const inY = ex / elen
  const apothem = length / (2 * Math.tan(Math.PI / sides))
  const center: Vec2 = { x: midX + inX * apothem, y: midY + inY * apothem }
  const rotation = Math.atan2(p1.y - center.y, p1.x - center.x)
  return {
    id,
    kind: 'regular',
    sides,
    center,
    edgeLength: length,
    rotation,
    source: 'completed',
  }
}

/**
 * Step 17 Framing slice 9 — the irregular **stub** fallback.
 *
 * `computeFrameSections` covers each Frame edge with full `edgeLength`
 * sections (filled by `placeRegularNGonOnFrameSection`) and leaves the
 * < edgeLength remainder as two equal half-stubs, one at each corner. At
 * every Frame corner the two incident half-stubs + the corner form a
 * triangular notch `[B, C, A]` — the only part of the frame edge not covered
 * by a full-section Tile — where:
 *   - `C` = the corner vertex,
 *   - `A` = the inner end of the leading half-stub on the outgoing edge
 *           (coincides exactly with the first full-section Tile's base vertex),
 *   - `B` = the inner end of the trailing half-stub on the incoming edge
 *           (coincides with the last full-section Tile's base vertex there).
 *
 * Filling those notches tiles the pattern cleanly out to each corner. The
 * fills are irregular Tiles tagged `source: 'completed'` (frame-scoped,
 * world space, ADR-0004) — the same data model as `complete.ts`'s irregular
 * gap fallback, so PIC runs over them via their tile-type Figure recipe.
 *
 * Corners where either half-stub vanishes (the edge divides evenly, so the
 * notch collapses to a degenerate sliver) are skipped.
 */
export function frameCornerStubTiles(
  outline: Vec2[],
  edgeLength: number,
  idPrefix = 'frame-stub',
): EditorIrregularTile[] {
  const tiles: EditorIrregularTile[] = []
  if (outline.length < 3 || edgeLength <= 0) return tiles
  const sections = computeFrameSections(outline, edgeLength)
  const n = outline.length
  const eps = edgeLength * 1e-3
  const near = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.y - q.y) <= eps
  for (let i = 0; i < n; i++) {
    const C = outline[i]
    const prevEdge = (i - 1 + n) % n
    // Leading half-stub on edge i starts at corner C; its p2 is the inner end A.
    const lead = sections.find(s => s.edgeIndex === i && s.isStub && near(s.p1, C))
    // Trailing half-stub on the previous edge ends at corner C; its p1 is B.
    const trail = sections.find(s => s.edgeIndex === prevEdge && s.isStub && near(s.p2, C))
    if (!lead || !trail) continue
    const A = lead.p2
    const B = trail.p1
    // Reject degenerate slivers (near-collinear B, C, A).
    const area = Math.abs((B.x - C.x) * (A.y - C.y) - (B.y - C.y) * (A.x - C.x)) / 2
    if (area <= eps * edgeLength) continue
    tiles.push({
      id: `${idPrefix}-${i}`,
      kind: 'irregular',
      vertices: ensureCCW([B, C, A]),
      source: 'completed',
    })
  }
  return tiles
}
