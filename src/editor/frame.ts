import type { Vec2 } from '../utils/math'
import type { EditorRegularTile, FrameConfig, FrameShape } from '../types/editor'

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
export const MAX_FRAME_SIZE = 1600

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
 * Walk each edge of a Frame `outline` from its start corner, dropping a
 * **Frame node** every exact `edgeLength`. Returns the sections (segments
 * between adjacent nodes) edge by edge, CCW. The trailing remainder on each
 * edge becomes one `isStub` section (omitted if negligibly short).
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
    const full = Math.floor(edgeLen / edgeLength)
    let si = 0
    for (let k = 0; k < full; k++) {
      const d1 = k * edgeLength
      const d2 = (k + 1) * edgeLength
      const p1 = { x: a.x + ux * d1, y: a.y + uy * d1 }
      const p2 = { x: a.x + ux * d2, y: a.y + uy * d2 }
      sections.push({
        edgeIndex: i,
        sectionIndex: si++,
        p1,
        p2,
        midpoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        length: edgeLength,
        isStub: false,
      })
    }
    const remainder = edgeLen - full * edgeLength
    if (remainder > eps) {
      const d1 = full * edgeLength
      const p1 = { x: a.x + ux * d1, y: a.y + uy * d1 }
      const p2 = { x: b.x, y: b.y }
      sections.push({
        edgeIndex: i,
        sectionIndex: si++,
        p1,
        p2,
        midpoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        length: remainder,
        isStub: true,
      })
    }
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
