import type { Vec2 } from '../utils/math'
import type { GradientSpec, GradientStop, GroupingScope } from '../types/editor'
import type { PaintVoid } from './resolve'
import { canonicalPose, poseBBox, type StampBBox } from './stamps'

/**
 * Per-shape Void gradients (DECORATION_GRADIENTS_SPEC, #44) — pure helpers
 * shared by the paint handler, the Decoration panel and the focus editor.
 *
 * Geometry lives in the Void's **canonical pose** (`stamps.ts`), so a spec
 * seeded or edited once lands consistently rotated/mirrored on every
 * congruent instance — same replication model as stamp placement.
 */

/** The panel's working gradient (type + stops); geometry is seeded per shape
 * at paint time, in that shape's canonical pose. */
export interface GradientDraft {
  type: GradientSpec['type']
  stops: GradientStop[]
}

/** The Void group last painted in Gradient mode — anchors the panel's
 * focus-editor flow (record looked up live by scope + key). */
export interface GradientSelection {
  void: PaintVoid
  scope: GroupingScope
  key: string
}

/** Default draft stops for a fresh gradient: paint colour → parchment. */
export function defaultGradientStops(colour: string): GradientStop[] {
  return [
    { offset: 0, colour },
    { offset: 1, colour: '#f5ead6' },
  ]
}

/** Canonical-pose bounding box of a Void outline (straight outline preferred
 * by callers). Null for degenerate input. */
export function gradientCanonicalBox(outline: Vec2[]): StampBBox | null {
  const pose = canonicalPose(outline)
  if (!pose) return null
  const box = poseBBox(pose.points)
  return box && box.width > 0 && box.height > 0 ? box : null
}

/** Seed a gradient spec over a Void outline: linear = vertical span of the
 * canonical box, radial = centre + half-diagonal-ish radius. Null when the
 * outline is degenerate. */
export function seedGradientSpec(
  type: GradientSpec['type'],
  stops: GradientStop[],
  outline: Vec2[],
): GradientSpec | null {
  const box = gradientCanonicalBox(outline)
  if (!box) return null
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return type === 'linear'
    ? { type, stops, start: { x: cx, y: box.y }, end: { x: cx, y: box.y + box.height } }
    : { type, stops, centre: { x: cx, y: cy }, radius: Math.max(box.width, box.height) / 2 }
}

/** A world-space axis-aligned bounding box (min/max corners). */
export interface WorldBBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Bounding box of a set of world points, or null when empty/degenerate. */
export function pointsBBox(points: Vec2[]): WorldBBox | null {
  if (points.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!(maxX > minX) || !(maxY > minY)) return null
  return { minX, minY, maxX, maxY }
}

/**
 * Seed the across-frame gradient (#45) over a world bbox: linear = vertical
 * span (top→bottom), radial = centre + half-diagonal radius. Stops seed from
 * the current decoration colour → the canvas background (spec decision 6).
 */
export function seedFrameGradientSpec(
  type: GradientSpec['type'],
  box: WorldBBox,
  colour: string,
  background: string,
): GradientSpec {
  const stops: GradientStop[] = [
    { offset: 0, colour },
    { offset: 1, colour: background },
  ]
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  if (type === 'linear') {
    return { type, stops, start: { x: cx, y: box.minY }, end: { x: cx, y: box.maxY } }
  }
  const radius = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) / 2
  return { type, stops, centre: { x: cx, y: cy }, radius }
}

/** Stops in ascending offset order. **Required before emitting SVG `<stop>`
 * elements** — SVG clamps any stop whose offset is below a previous one, so
 * out-of-order stops (e.g. after dragging one marker past another) render as a
 * collapsed gradient rather than a reordered one. Storage stays in insertion
 * order so the stop bar's selection index is stable across drags; sorting
 * happens only at render/preview time. */
export function sortedStops(stops: GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.offset - b.offset)
}

/** CSS `linear-gradient` preview of a stop set (panel stop bar / swatches). */
export function gradientPreviewCss(stops: GradientStop[]): string {
  return `linear-gradient(90deg, ${sortedStops(stops).map(s => `${s.colour} ${(s.offset * 100).toFixed(1)}%`).join(', ')})`
}
