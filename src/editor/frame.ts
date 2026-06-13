import type { Vec2 } from '../utils/math'
import type { FrameConfig, FrameShape } from '../types/editor'

/**
 * Step 17 Framing — Shape **Frame** outline geometry.
 *
 * Computes the world-space outline polygon for a `'shape'`-type Frame
 * (square / pentagon / hexagon / octagon), centred on `frame.origin` (default world
 * origin), scaled by `size`, stretched by `aspect`, and rotated by
 * `rotation`. The polygon is the clip region the Composition is wrapped in,
 * and (slice 4+) the boundary that **Frame nodes** are walked along.
 *
 * n-ring Frames are handled elsewhere (they derive their outline from the
 * Patch-stamp shells, not a parametric shape) — `frameOutlinePolygon`
 * returns `null` for them.
 */

const SHAPE_SIDES: Record<FrameShape, number> = { square: 4, pentagon: 5, hexagon: 6, octagon: 8 }

/**
 * Per-shape base phase (radians) so each shape sits "upright" at
 * `rotation = 0`: a square with axis-aligned edges, a point-up pentagon (one
 * vertex at the top, flat base), a flat-top hexagon, and an axis-aligned
 * octagon (stop-sign orientation). The vertex loop uses screen coords (y
 * down), so a vertex points up at angle −π/2.
 */
const SHAPE_PHASE: Record<FrameShape, number> = {
  square: Math.PI / 4,
  pentagon: -Math.PI / 2,
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

/** Slider model for sizing the Gallery Frame in whole tiling **repeat units**. */
export interface FrameUnitModel {
  /** Smallest whole unit whose px ≥ MIN_FRAME_SIZE (≥ 1). */
  min: number
  /** Largest whole unit, capped at MAX_FRAME_UNITS and at the px ceiling so the
   *  top unit's px (units × repeat) never exceeds MAX_FRAME_SIZE — otherwise
   *  `frameUnitsToPx`'s clamp would round it back and freeze the slider. */
  max: number
  /** The current `sizePx` expressed (and clamped) in whole units. */
  units: number
}

/**
 * Derive the unit-slider bounds + current value from the live tiling repeat
 * length and the stored frame size (px). One unit = one lattice translate; the
 * frame's `size` stays stored in px so world geometry/validation are unchanged
 * — the slider just snaps to integer multiples of the repeat. Pulled out of
 * `Sidebar` so the clamp logic (whose edges previously froze the slider) is
 * unit-testable. `repeat` is assumed > 0 (callers fall back to the tiling
 * scale, which is always positive).
 */
export function frameUnitModel(repeat: number, sizePx: number): FrameUnitModel {
  const min = Math.max(1, Math.ceil(MIN_FRAME_SIZE / repeat))
  const max = Math.max(min, Math.min(MAX_FRAME_UNITS, Math.floor(MAX_FRAME_SIZE / repeat)))
  const units = Math.min(max, Math.max(min, Math.round(sizePx / repeat)))
  return { min, max, units }
}

/** Convert a whole-unit frame size back to px, clamped to the px range. */
export function frameUnitsToPx(units: number, repeat: number): number {
  return Math.min(MAX_FRAME_SIZE, Math.max(MIN_FRAME_SIZE, units * repeat))
}

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
