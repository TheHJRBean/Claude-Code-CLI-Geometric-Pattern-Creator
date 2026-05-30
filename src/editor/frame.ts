import type { Vec2 } from '../utils/math'
import type { FrameConfig, FrameShape } from '../types/editor'

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
