import type { EditorGuide, EditorGuideLine, EditorPatch } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { add, sub, scale, dot, cross, len, normalize, midpoint, dist, degToRad } from '../utils/math'
import { applyCellTransform } from './patchSelectable'
import { tileVertices } from './exposedEdges'
import { editorBoundaryVertices } from './buildEditorPolygons'

/**
 * Guides (CONSTRUCTION_GUIDES_SPEC.md, ADR-0008) — pure geometry for the
 * Design-Phase **Construct** mode: snap-point collection, angle snapping,
 * extend clipping, tick + intersection Anchors. No React; consumed by the
 * Canvas guide layer and unit-tested directly.
 */

/* ── Fixed system colours (spec Decision 2) ────────────────────────────────
 * Colour IS the stamp indicator in v1 — one colour for stamping Guides, one
 * for non-stamping. Deliberately outside the pattern palette (sandstone /
 * gold accent) and the overlay palette (accent gold dots, amber warning,
 * danger red) so Guides never read as artwork or as an existing overlay. */

/** Non-stamping (one-off, world-space) Guides — cool slate blue. */
export const GUIDE_COLOUR_STATIC = '#4a7fb5'
/** Stamping (Patch-relative, repeats under the Lattice) Guides — violet. */
export const GUIDE_COLOUR_STAMP = '#9a5bd2'

export function guideColour(guide: EditorGuide): string {
  return guide.stamp ? GUIDE_COLOUR_STAMP : GUIDE_COLOUR_STATIC
}

/** Angle-snap step presets offered in the Construct toolbar (spec Decision 7).
 *  15° default; 36° / 72° serve five-fold / Girih layouts; the n-fold custom
 *  entry derives a step of 180/n at pick time. */
export const ANGLE_STEP_PRESETS = [15, 30, 36, 45, 72] as const
export const DEFAULT_ANGLE_STEP = 15

/* ── Snap points ────────────────────────────────────────────────────────── */

/** Where a snap candidate came from — drives the snap-marker glyph. */
export type SnapKind = 'tile-vertex' | 'edge-midpoint' | 'boundary-corner' | 'guide-anchor'

export interface SnapPoint {
  p: Vec2
  kind: SnapKind
  /** Direction (radians) of the Tile edge this point lies on, when the point
   *  is an edge midpoint — feeds the angle-snap reference set so
   *  perpendicular / continuation come free (spec Decision 7). */
  edgeAngle?: number
}

/**
 * Collect the snap-while-drawing candidate set in Patch-local world coords
 * (spec Decision 7): every Tile vertex, every Tile edge midpoint, every
 * Cell-Boundary corner, plus existing Guide Anchors (endpoints, ticks,
 * manual) and Guide×Guide intersections.
 */
export function collectSnapPoints(patch: EditorPatch, patchRot: number): SnapPoint[] {
  const out: SnapPoint[] = []
  for (const cell of patch.cells) {
    for (const tile of cell.tiles) {
      const verts = tileVertices(tile).map(v => applyCellTransform(v, cell, patchRot))
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i]
        const b = verts[(i + 1) % verts.length]
        out.push({ p: a, kind: 'tile-vertex' })
        out.push({
          p: midpoint(a, b),
          kind: 'edge-midpoint',
          edgeAngle: Math.atan2(b.y - a.y, b.x - a.x),
        })
      }
    }
    for (const v of editorBoundaryVertices(cell)) {
      out.push({ p: applyCellTransform(v, cell, patchRot), kind: 'boundary-corner' })
    }
  }
  const guides = patch.guides ?? []
  for (const g of guides) {
    for (const p of guideAnchorPoints(g, patch.edgeLength)) {
      out.push({ p, kind: 'guide-anchor' })
    }
  }
  for (const p of guideIntersections(guides)) {
    out.push({ p, kind: 'guide-anchor' })
  }
  return out
}

/** Nearest snap candidate within `tolerance` (world units), or null. */
export function snapToPoint(p: Vec2, candidates: SnapPoint[], tolerance: number): SnapPoint | null {
  let best: SnapPoint | null = null
  let bestD = tolerance
  for (const c of candidates) {
    const d = dist(p, c.p)
    if (d <= bestD) {
      best = c
      bestD = d
    }
  }
  return best
}

/* ── Angle snap ─────────────────────────────────────────────────────────── */

/**
 * Snap the free endpoint of an in-progress Guide line to the nearest allowed
 * direction through `start` (spec Decision 7). Allowed directions are
 * multiples of `stepDeg` measured from each reference angle — always the
 * horizontal, plus the direction of any edge the line starts on
 * (`startEdgeAngle`, set when the start point snapped to an edge midpoint) so
 * continuation and perpendicular come free. The snapped endpoint preserves
 * the cursor's projected distance along the chosen direction.
 */
export function snapAngle(
  start: Vec2,
  cursor: Vec2,
  stepDeg: number,
  startEdgeAngle?: number,
): Vec2 {
  const v = sub(cursor, start)
  const r = len(v)
  if (r < 1e-9) return cursor
  const raw = Math.atan2(v.y, v.x)
  const step = degToRad(stepDeg)
  const references = startEdgeAngle === undefined ? [0] : [0, startEdgeAngle]
  let bestAngle = raw
  let bestDelta = Infinity
  for (const ref of references) {
    const snapped = ref + Math.round((raw - ref) / step) * step
    const delta = Math.abs(angleDiff(snapped, raw))
    if (delta < bestDelta) {
      bestDelta = delta
      bestAngle = snapped
    }
  }
  // Preserve the cursor's projection onto the snapped direction so the line
  // doesn't lengthen as it rotates to the snap.
  const dir = { x: Math.cos(bestAngle), y: Math.sin(bestAngle) }
  const along = Math.max(dot(v, dir), 0)
  return add(start, scale(dir, along === 0 ? r : along))
}

/** Signed smallest difference between two angles, in (-π, π]. */
function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return d
}

/** Angle of a Guide line's start→end direction, degrees in [0, 360). */
export function guideLineAngleDeg(g: EditorGuideLine): number {
  const v = sub(g.end, g.start)
  const deg = (Math.atan2(v.y, v.x) * 180) / Math.PI
  return (deg % 360 + 360) % 360
}

/** Rotate a Guide line's end about its start to the given angle (degrees),
 *  preserving segment length — the popup's typed-angle correction. */
export function withGuideLineAngle(g: EditorGuideLine, angleDeg: number): Pick<EditorGuideLine, 'end'> {
  const r = dist(g.start, g.end)
  const rad = degToRad(angleDeg)
  return { end: add(g.start, { x: r * Math.cos(rad), y: r * Math.sin(rad) }) }
}

/* ── Extend clipping ────────────────────────────────────────────────────── */

export interface WorldBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * The renderable span of a Guide line: the drawn segment, extended per
 * `extend` out to `bounds` (the visible world rectangle, padded by the caller
 * to cover view rotation). Returns null when the extended line misses the
 * bounds entirely — nothing to draw.
 */
export function guideLineSpan(g: EditorGuideLine, bounds: WorldBounds): { a: Vec2; b: Vec2 } | null {
  if (g.extend === 'none') return { a: g.start, b: g.end }
  const d = sub(g.end, g.start)
  if (len(d) < 1e-9) return { a: g.start, b: g.end }
  // Parametric span: t=0 at start, t=1 at end. Clip the infinite line to the
  // bounds, then intersect with the extend-allowed t-range.
  const range = clipLineToBounds(g.start, d, bounds)
  if (!range) return g.extend === 'both' ? null : { a: g.start, b: g.end }
  let [t0, t1] = range
  if (g.extend === 'end') t0 = Math.max(t0, 0)
  if (g.extend === 'start') t1 = Math.min(t1, 1)
  // Always include the drawn segment itself so a segment outside the view
  // (caller culls those) never inverts the span.
  t0 = Math.min(t0, 0)
  t1 = Math.max(t1, 1)
  return { a: add(g.start, scale(d, t0)), b: add(g.start, scale(d, t1)) }
}

/** Liang–Barsky clip of the parametric line p = origin + t·d to `bounds`.
 *  Returns the [tMin, tMax] range inside, or null when it misses. */
function clipLineToBounds(origin: Vec2, d: Vec2, bounds: WorldBounds): [number, number] | null {
  let t0 = -Infinity
  let t1 = Infinity
  const checks: Array<[number, number]> = [
    [-d.x, origin.x - bounds.minX],
    [d.x, bounds.maxX - origin.x],
    [-d.y, origin.y - bounds.minY],
    [d.y, bounds.maxY - origin.y],
  ]
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return null
      if (t > t0) t0 = t
    } else {
      if (t < t0) return null
      if (t < t1) t1 = t
    }
  }
  return [t0, t1]
}

/* ── Anchors: ticks, manual, intersections ─────────────────────────────── */

/**
 * Spaced-tick Anchor points along a Guide line (spec Decision 5): ticks march
 * from the start point in both directions at `tickSpacing` (default = the
 * Patch edge length), covering the drawn segment only — extended (infinite)
 * portions are unticked in v1 so the Anchor set stays finite.
 */
export function guideTickPoints(g: EditorGuideLine, patchEdgeLength: number): Vec2[] {
  if (g.ticksEnabled === false) return []
  const spacing = g.tickSpacing ?? patchEdgeLength
  if (!(spacing > 0)) return []
  const d = sub(g.end, g.start)
  const length = len(d)
  if (length < 1e-9) return []
  const dir = normalize(d)
  const out: Vec2[] = []
  for (let s = spacing; s <= length + 1e-9; s += spacing) {
    out.push(add(g.start, scale(dir, s)))
  }
  return out
}

/** Manual Anchor world positions (parametric t along start→end). */
export function guideManualAnchorPoints(g: EditorGuideLine): Vec2[] {
  const d = sub(g.end, g.start)
  return g.manualAnchors.map(t => add(g.start, scale(d, t)))
}

/** Every Anchor a single Guide exposes by itself: endpoints, ticks, manual.
 *  (Intersections need the full Guide set — see `guideIntersections`.) */
export function guideAnchorPoints(g: EditorGuide, patchEdgeLength: number): Vec2[] {
  return [g.start, g.end, ...guideTickPoints(g, patchEdgeLength), ...guideManualAnchorPoints(g)]
}

/**
 * Guide×Guide intersection Anchors (spec Decision 5 — always on). Respects
 * each line's `extend`: an intersection only exists where both lines actually
 * reach. Guide×Tile-edge and Guide×Cell-Boundary crossings join in slice 3
 * with the Anchor→Place/Complete wiring.
 */
export function guideIntersections(guides: EditorGuide[]): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < guides.length; i++) {
    for (let j = i + 1; j < guides.length; j++) {
      const p = lineLineIntersection(guides[i], guides[j])
      if (p) out.push(p)
    }
  }
  return out
}

/** The extend-allowed parametric range of a Guide line (t=0 start, t=1 end). */
function extendRange(g: EditorGuideLine): [number, number] {
  switch (g.extend) {
    case 'none': return [0, 1]
    case 'start': return [-Infinity, 1]
    case 'end': return [0, Infinity]
    case 'both': return [-Infinity, Infinity]
  }
}

function lineLineIntersection(a: EditorGuideLine, b: EditorGuideLine): Vec2 | null {
  const da = sub(a.end, a.start)
  const db = sub(b.end, b.start)
  const denom = cross(da, db)
  if (Math.abs(denom) < 1e-12) return null
  const ab = sub(b.start, a.start)
  const ta = cross(ab, db) / denom
  const tb = cross(ab, da) / denom
  const [a0, a1] = extendRange(a)
  const [b0, b1] = extendRange(b)
  const eps = 1e-9
  if (ta < a0 - eps || ta > a1 + eps) return null
  if (tb < b0 - eps || tb > b1 + eps) return null
  return add(a.start, scale(da, ta))
}

/* ── Construction ───────────────────────────────────────────────────────── */

/** Build a fresh Guide line with the v1 defaults (stamp OFF, no extension,
 *  ticks on at the default spacing, no manual Anchors). */
export function createGuideLine(start: Vec2, end: Vec2, existing: EditorGuide[]): EditorGuideLine {
  return {
    id: `guide-${existing.length}-${Date.now()}`,
    kind: 'line',
    start,
    end,
    stamp: false,
    extend: 'none',
    manualAnchors: [],
  }
}
