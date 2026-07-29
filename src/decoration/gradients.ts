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
  /** Linear axis angle (degrees) the next paint seeds at — the per-shape
   *  gradient has no geometry until it lands on a Void, so the angle has to
   *  ride on the draft. Absent ⇒ `DEFAULT_GRADIENT_ANGLE_DEG` (the original
   *  top→bottom seed), which keeps pre-existing drafts painting identically.
   *  Measured in the shape's CANONICAL POSE, not on screen — see
   *  `seedGradientSpec`. Ignored for radial. */
  angleDeg?: number
}

/** Seed angle for a linear gradient: 90° = top→bottom in screen convention. */
export const DEFAULT_GRADIENT_ANGLE_DEG = 90

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

/**
 * Seed a gradient spec over a Void outline: linear = an axis across the
 * canonical box at `angleDeg` (default 90° — the original top→bottom span),
 * radial = centre + half-diagonal-ish radius. Null when the outline is
 * degenerate.
 *
 * **The angle is in canonical-pose space, not screen space.** Void gradient
 * geometry is stored in each shape's canonical pose so one spec replicates
 * consistently onto every congruent instance (rotated/mirrored copies
 * included) — the same replication model as stamp placement. So 45° here means
 * 45° relative to the shape's own canonical frame, which is what keeps the
 * group looking coherent; it is not 45° on screen for a rotated instance.
 */
export function seedGradientSpec(
  type: GradientSpec['type'],
  stops: GradientStop[],
  outline: Vec2[],
  angleDeg: number = DEFAULT_GRADIENT_ANGLE_DEG,
): GradientSpec | null {
  const box = gradientCanonicalBox(outline)
  if (!box) return null
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  if (type !== 'linear') {
    return { type, stops, centre: { x: cx, y: cy }, radius: Math.max(box.width, box.height) / 2 }
  }
  const { start, end } = bboxAxisAtAngle(
    { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height },
    angleDeg,
  )
  return { type, stops, start, end }
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

/** Any degree value folded into [0, 360). */
export function normaliseAngleDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/**
 * The angle (degrees, [0, 360)) of a linear gradient's start→end axis. Screen
 * convention: 0° points right (→), 90° down (↓).
 *
 * **Exact, not rounded** — the panel controls allow fractional degrees, and
 * rounding here would quantise the value a drag or a typed 37.5° round-trips
 * through. Round at the point of display; compare with `angleDeltaDeg`, never
 * with `===` (an axis built at 45° reads back as 44.99999999999999).
 */
export function axisAngleDeg(start: Vec2, end: Vec2): number {
  return normaliseAngleDeg((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI)
}

/** Smallest separation between two angles, 0–180° — wrap-aware, so 359° and 1°
 *  are 2° apart. Use for "is this preset the current angle?" tests. */
export function angleDeltaDeg(a: number, b: number): number {
  const d = normaliseAngleDeg(a - b)
  return d > 180 ? 360 - d : d
}

/** Nearest multiple of `stepDeg` (e.g. 15° while a modifier is held). A
 *  non-positive step is a no-op beyond normalising. */
export function snapAngleDeg(deg: number, stepDeg: number): number {
  if (!(stepDeg > 0)) return normaliseAngleDeg(deg)
  return normaliseAngleDeg(Math.round(deg / stepDeg) * stepDeg)
}

/**
 * Spin a linear axis to `angleDeg` **about its own midpoint**, keeping its
 * length — so setting an angle re-aims a hand-placed axis instead of throwing
 * its extent away (`bboxAxisAtAngle` is the deliberate re-span, wired to the
 * separate Fit control).
 *
 * A zero-length axis has no extent to preserve and is returned unchanged;
 * there is no direction to rotate and inventing a length here would be a
 * silent geometry change.
 */
export function rotateAxisTo(start: Vec2, end: Vec2, angleDeg: number): { start: Vec2; end: Vec2 } {
  const half = Math.hypot(end.x - start.x, end.y - start.y) / 2
  if (!(half > 0)) return { start, end }
  const cx = (start.x + end.x) / 2
  const cy = (start.y + end.y) / 2
  const t = (angleDeg * Math.PI) / 180
  const dx = Math.cos(t) * half
  const dy = Math.sin(t) * half
  return { start: { x: cx - dx, y: cy - dy }, end: { x: cx + dx, y: cy + dy } }
}

/**
 * Constrain a dragged endpoint to the nearest `stepDeg` direction from
 * `anchor` (the endpoint that isn't moving), keeping the drag's distance.
 * Backs Shift-to-snap on the gradient axis handles. A drag landing exactly on
 * the anchor has no direction and passes through untouched.
 */
export function snapPointToAngle(anchor: Vec2, p: Vec2, stepDeg: number): Vec2 {
  const dist = Math.hypot(p.x - anchor.x, p.y - anchor.y)
  if (!(dist > 0)) return p
  const t = (snapAngleDeg(axisAngleDeg(anchor, p), stepDeg) * Math.PI) / 180
  return { x: anchor.x + Math.cos(t) * dist, y: anchor.y + Math.sin(t) * dist }
}

/** Snap step (degrees) applied while a gradient axis handle is dragged with
 *  Shift held — matches the Guides angle-snap idiom. */
export const GRADIENT_ANGLE_SNAP_DEG = 15

/**
 * Linear-gradient axis through a world bbox centre at `angleDeg`, extended to
 * where it exits the nearer pair of bbox sides — so 0° spans the width
 * (left→right), 90° the height (top→bottom), and diagonals reach the corners.
 * Backs the precise-angle presets + numeric entry: any angle gives a
 * full-frame-spanning wash. Screen convention: 0°→ right, 90°→ down.
 */
export function bboxAxisAtAngle(box: WorldBBox, angleDeg: number): { start: Vec2; end: Vec2 } {
  const t = (angleDeg * Math.PI) / 180
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const hw = (box.maxX - box.minX) / 2 || 1
  const hh = (box.maxY - box.minY) / 2 || 1
  const dx = Math.cos(t)
  const dy = Math.sin(t)
  const tx = Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity
  const ty = Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity
  const half = Math.min(tx, ty)
  return {
    start: { x: cx - half * dx, y: cy - half * dy },
    end: { x: cx + half * dx, y: cy + half * dy },
  }
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

/**
 * Redistribute stops at even intervals spanning the full 0..1 range, keeping
 * their current left-to-right order (n stops → 0, 1/(n-1), … 1). Backs the stop
 * bar's `≡ Even` button, which tidies a hand-dragged set in one click.
 *
 * **Storage order is preserved**: each stop keeps its array index and only its
 * `offset` changes, so the caller's selected-stop index still points at the same
 * colour (same contract as `sortedStops` — see its note on why storage stays in
 * insertion order). Ranking uses a stable sort, so stops sharing an offset keep
 * their relative order rather than swapping. Fewer than 2 stops is returned
 * unchanged (nothing to space, and 1/(n-1) would divide by zero).
 */
/**
 * Switch a gradient's direction by mirroring every stop end-for-end
 * (`offset → 1 − offset`). Backs the stop bar's `⇄ Reverse` button.
 *
 * Works for **both** gradient types without touching their geometry: a linear
 * gradient runs the other way along the same axis, and a radial one swaps its
 * inner and outer colours. Keeping the axis fixed is what makes this safe to
 * apply to the world-space frame / strand gradients, whose start & end are also
 * draggable on-canvas handles — reversing the geometry instead would teleport
 * the handles. As with `evenlySpacedStops`, each stop keeps its array index
 * (only `offset` changes) so the caller's selected stop stays selected.
 */
export function reversedStops(stops: GradientStop[]): GradientStop[] {
  return stops.map(s => ({ ...s, offset: 1 - s.offset }))
}

export function evenlySpacedStops(stops: GradientStop[]): GradientStop[] {
  if (stops.length < 2) return stops
  const step = 1 / (stops.length - 1)
  const out = stops.slice()
  stops
    .map((s, index) => ({ index, offset: s.offset }))
    .sort((a, b) => a.offset - b.offset)
    .forEach(({ index }, rank) => {
      out[index] = { ...stops[index], offset: rank * step }
    })
  return out
}
