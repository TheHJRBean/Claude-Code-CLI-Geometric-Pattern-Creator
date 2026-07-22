import type { EditorGuide, EditorGuideCircle, EditorGuideLine, EditorPatch } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { add, sub, scale, dot, cross, len, normalize, midpoint, dist, degToRad } from '../utils/math'
import { applyCellTransform } from './patchSelectable'
import { patchTickEdgeLength } from './active'
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

/** The three Construct tools (spec Decision 11), selected in the Construct
 *  toolbar. `'divided-circle'` draws a circle pre-seeded with divisions. */
export type GuideTool = 'line' | 'circle' | 'divided-circle'

/** Default division count a fresh divided Guide circle seeds with → 12 rim
 *  Anchors (2·6), a common rosette scaffold; tunable per-Guide in the popup. */
export const DEFAULT_CIRCLE_DIVISIONS = 6

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
 * Cell-Boundary corner, plus every Guide **Anchor** (`collectGuideAnchors` —
 * self anchors, Guide×Guide, and Guide×Tile-edge / Guide×Cell-Boundary
 * crossings).
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
  for (const a of collectGuideAnchors(patch, patchRot)) {
    out.push({ p: a.p, kind: 'guide-anchor' })
  }
  return out
}

/* ── Anchor engine (slice 3) ────────────────────────────────────────────────
 * A **GuideAnchor** is any single point a Guide exposes, in Patch-world coords,
 * carried with its provenance so the Complete / Place flows can route the
 * resulting Tile: `stamp` decides world-space one-off vs ordinary Cell Tile
 * (spec Decision 2 + the slice-3 storage semantics). This is the single source
 * of truth consumed by snap, the Guide layer, and both placement flows. */

/** A pickable point exposed by a Guide, in Patch-world coords. */
export interface GuideAnchor {
  p: Vec2
  /** Owning Guide (for an intersection: the "primary" Guide — see `stamp`). */
  guideId: string
  /**
   * True ⇒ the anchor is Patch-relative (repeats under the Lattice): a Tile
   * minted here is an ordinary Cell Tile. False ⇒ world-space one-off. For a
   * Guide×Guide intersection this is the AND of both Guides' stamp flags — a
   * crossing is only Patch-relative if *both* Guides are; for a
   * Guide×Tile-edge / Guide×Boundary crossing it follows the Guide (the Tile /
   * Boundary is already Patch-relative).
   */
  stamp: boolean
}

/** Every Tile-edge + Cell-Boundary edge across the Patch, in Patch-world coords
 *  — the target set for Guide×geometry intersection Anchors. */
function patchWorldEdges(patch: EditorPatch, patchRot: number): Array<[Vec2, Vec2]> {
  const edges: Array<[Vec2, Vec2]> = []
  for (const cell of patch.cells) {
    for (const tile of cell.tiles) {
      const vs = tileVertices(tile).map(v => applyCellTransform(v, cell, patchRot))
      for (let i = 0; i < vs.length; i++) edges.push([vs[i], vs[(i + 1) % vs.length]])
    }
    const bv = editorBoundaryVertices(cell).map(v => applyCellTransform(v, cell, patchRot))
    for (let i = 0; i < bv.length; i++) edges.push([bv[i], bv[(i + 1) % bv.length]])
  }
  return edges
}

/**
 * Every Guide **Anchor** the Patch exposes (spec Decision 5), in Patch-world
 * coords: each Guide's own anchors (endpoints/centre/ticks/divisions/manual),
 * Guide×Guide intersections, and Guide×Tile-edge / Guide×Cell-Boundary
 * crossings. Deduplicated to a rounded grid so coincident points (a tick that
 * lands on a crossing, a shared tile edge hit twice) collapse to one pick.
 */
export function collectGuideAnchors(patch: EditorPatch, patchRot: number): GuideAnchor[] {
  const guides = patch.guides ?? []
  if (guides.length === 0) return []
  const out: GuideAnchor[] = []
  // Tick / arc spacing is anchored to the Seed-Tile edge, not the (possibly
  // drifted, multi-cell) lattice constant, so Anchors land on the grid.
  const tickEdge = patchTickEdgeLength(patch)
  // Self anchors.
  for (const g of guides) {
    for (const p of guideAnchorPoints(g, tickEdge)) out.push({ p, guideId: g.id, stamp: g.stamp })
  }
  // Guide×Guide crossings — Patch-relative only when both Guides stamp.
  for (let i = 0; i < guides.length; i++) {
    for (let j = i + 1; j < guides.length; j++) {
      const stamp = guides[i].stamp && guides[j].stamp
      for (const p of guidePairIntersections(guides[i], guides[j])) out.push({ p, guideId: guides[i].id, stamp })
    }
  }
  // Guide×Tile-edge and Guide×Cell-Boundary crossings — follow the Guide's
  // stamp flag (the target geometry is already Patch-relative).
  const edges = patchWorldEdges(patch, patchRot)
  for (const g of guides) {
    for (const p of guideEdgeIntersections(g, edges)) out.push({ p, guideId: g.id, stamp: g.stamp })
  }
  return dedupeAnchors(out)
}

/** Collapse anchors sharing a rounded position; first occurrence wins, but a
 *  non-stamping (world-space) duplicate downgrades a stamping one so a point
 *  reachable both ways never silently repeats under the Lattice. */
function dedupeAnchors(anchors: GuideAnchor[]): GuideAnchor[] {
  const byKey = new Map<string, GuideAnchor>()
  for (const a of anchors) {
    const key = `${Math.round(a.p.x * 1e4)},${Math.round(a.p.y * 1e4)}`
    const prev = byKey.get(key)
    if (!prev) byKey.set(key, a)
    else if (prev.stamp && !a.stamp) byKey.set(key, a)
  }
  return [...byKey.values()]
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
 * forward from the start point at `tickSpacing` (default = the Seed-Tile edge
 * length, so consecutive ticks are one Tile apart), covering the drawn segment
 * only — extended (infinite) portions are unticked in v1 so the Anchor set
 * stays finite.
 */
export function guideTickPoints(g: EditorGuideLine, tileEdgeLength: number): Vec2[] {
  if (g.ticksEnabled === false) return []
  const spacing = g.tickSpacing ?? tileEdgeLength
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

/** Every Anchor a single Guide exposes by itself: line endpoints/ticks/manual,
 *  or circle centre/radius-handle/divisions/arc-ticks/manual. (Intersections
 *  need the full Guide set — see `guideIntersections`.) */
export function guideAnchorPoints(g: EditorGuide, tileEdgeLength: number): Vec2[] {
  if (g.kind === 'circle') {
    return [
      g.center,
      guideCircleRadiusPoint(g),
      ...guideCircleDivisionPoints(g),
      ...guideCircleTickPoints(g, tileEdgeLength),
      ...guideCircleManualPoints(g),
    ]
  }
  return [g.start, g.end, ...guideTickPoints(g, tileEdgeLength), ...guideManualAnchorPoints(g)]
}

/**
 * Guide×Guide intersection Anchors (spec Decision 5 — always on) across every
 * kind pair: line×line, line×circle, circle×circle. Respects each line's
 * `extend` (an intersection only exists where both lines actually reach).
 * Guide×Tile-edge and Guide×Cell-Boundary crossings join in slice 3 with the
 * Anchor→Place/Complete wiring.
 */
export function guideIntersections(guides: EditorGuide[]): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < guides.length; i++) {
    for (let j = i + 1; j < guides.length; j++) {
      out.push(...guidePairIntersections(guides[i], guides[j]))
    }
  }
  return out
}

function guidePairIntersections(a: EditorGuide, b: EditorGuide): Vec2[] {
  if (a.kind === 'line' && b.kind === 'line') {
    const p = lineLineIntersection(a, b)
    return p ? [p] : []
  }
  if (a.kind === 'circle' && b.kind === 'circle') {
    return circleCircleIntersection(a, b)
  }
  const line = (a.kind === 'line' ? a : b) as EditorGuideLine
  const circle = (a.kind === 'circle' ? a : b) as EditorGuideCircle
  return circleLineIntersection(circle, line)
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

/* ── Circle Anchors ─────────────────────────────────────────────────────── */

/** The radius-handle point: `center` offset by `radius` along `phase`. Doubles
 *  as an Anchor (the snapped second click) and the drag handle. */
export function guideCircleRadiusPoint(c: EditorGuideCircle): Vec2 {
  const phase = c.phase ?? 0
  return add(c.center, { x: c.radius * Math.cos(phase), y: c.radius * Math.sin(phase) })
}

/**
 * The 2n division Anchors of a divided Guide circle (spec Decision 6) — the
 * rosette scaffold (RESEARCH §2.1). Marches CCW from `phase` so the first
 * division sits on the drawn radius point. Empty for a plain circle (no
 * `divisions`) or a degenerate radius.
 */
export function guideCircleDivisionPoints(c: EditorGuideCircle): Vec2[] {
  const n = c.divisions ?? 0
  if (!(n >= 1) || !(c.radius > 0)) return []
  const count = 2 * Math.round(n)
  return pointsRoundRim(c, count)
}

/**
 * Arc-spaced tick Anchors round a Guide circle (spec Decision 5): evenly
 * spaced at ≈`tickSpacing` **along the arc**, starting from `phase` (default
 * spacing = the Seed-Tile edge length). The count is
 * `round(circumference / spacing)` so ticks land evenly and close the loop;
 * fewer than two would fit ⇒ none. Off when `ticksEnabled === false`.
 */
export function guideCircleTickPoints(c: EditorGuideCircle, tileEdgeLength: number): Vec2[] {
  if (c.ticksEnabled === false || !(c.radius > 0)) return []
  const spacing = c.tickSpacing ?? tileEdgeLength
  if (!(spacing > 0)) return []
  const count = Math.round((2 * Math.PI * c.radius) / spacing)
  if (count < 2) return []
  return pointsRoundRim(c, count)
}

/** Manual Anchor world positions round a Guide circle (angle fractions from
 *  `phase`, CCW). */
export function guideCircleManualPoints(c: EditorGuideCircle): Vec2[] {
  const phase = c.phase ?? 0
  return c.manualAnchors.map(t => {
    const a = phase + t * 2 * Math.PI
    return add(c.center, { x: c.radius * Math.cos(a), y: c.radius * Math.sin(a) })
  })
}

/** `count` equally-spaced points round the rim, first at `phase`, CCW. */
function pointsRoundRim(c: EditorGuideCircle, count: number): Vec2[] {
  const phase = c.phase ?? 0
  const out: Vec2[] = []
  for (let k = 0; k < count; k++) {
    const a = phase + (k * 2 * Math.PI) / count
    out.push(add(c.center, { x: c.radius * Math.cos(a), y: c.radius * Math.sin(a) }))
  }
  return out
}

/* ── Circle intersections ───────────────────────────────────────────────── */

/** Where a Guide circle meets a Guide line, respecting the line's `extend`
 *  range. 0, 1 (tangent) or 2 points. */
function circleLineIntersection(c: EditorGuideCircle, line: EditorGuideLine): Vec2[] {
  const d = sub(line.end, line.start)
  const a2 = dot(d, d)
  if (a2 < 1e-12) return []
  const f = sub(line.start, c.center)
  const b2 = 2 * dot(f, d)
  const c2 = dot(f, f) - c.radius * c.radius
  const disc = b2 * b2 - 4 * a2 * c2
  if (disc < 0) return []
  const sq = Math.sqrt(Math.max(disc, 0))
  const ts = disc < 1e-9 ? [-b2 / (2 * a2)] : [(-b2 - sq) / (2 * a2), (-b2 + sq) / (2 * a2)]
  const [t0, t1] = extendRange(line)
  const eps = 1e-9
  const out: Vec2[] = []
  for (const t of ts) {
    if (t < t0 - eps || t > t1 + eps) continue
    out.push(add(line.start, scale(d, t)))
  }
  return out
}

/** Where two Guide circles meet: 0 (disjoint / one inside the other / equal),
 *  1 (tangent) or 2 points. */
function circleCircleIntersection(a: EditorGuideCircle, b: EditorGuideCircle): Vec2[] {
  const dvec = sub(b.center, a.center)
  const dcen = len(dvec)
  if (dcen < 1e-9) return [] // concentric (incl. identical) — no discrete points
  const r0 = a.radius
  const r1 = b.radius
  if (dcen > r0 + r1 + 1e-9) return [] // too far apart
  if (dcen < Math.abs(r0 - r1) - 1e-9) return [] // one contained in the other
  const aDist = (r0 * r0 - r1 * r1 + dcen * dcen) / (2 * dcen)
  const mid = add(a.center, scale(dvec, aDist / dcen))
  const h2 = r0 * r0 - aDist * aDist
  if (h2 <= 1e-9) return [mid] // tangent
  const h = Math.sqrt(h2)
  const perp = { x: -dvec.y / dcen, y: dvec.x / dcen }
  return [add(mid, scale(perp, h)), add(mid, scale(perp, -h))]
}

/* ── Guide × geometry-edge intersections (slice 3) ──────────────────────── */

/**
 * Where a Guide crosses a set of finite geometry edges (Tile edges,
 * Cell-Boundary edges) — spec Decision 5. Each edge is the segment [a, b]
 * (parameter u ∈ [0, 1]); a Guide line still respects its own `extend` range.
 */
export function guideEdgeIntersections(g: EditorGuide, edges: Array<[Vec2, Vec2]>): Vec2[] {
  const out: Vec2[] = []
  for (const [a, b] of edges) {
    if (g.kind === 'line') {
      const p = lineSegmentIntersection(g, a, b)
      if (p) out.push(p)
    } else {
      out.push(...circleSegmentIntersection(g, a, b))
    }
  }
  return out
}

/** Intersection of a Guide line (respecting `extend`) with the finite segment
 *  [a, b], or null when they don't cross within both ranges. */
function lineSegmentIntersection(line: EditorGuideLine, a: Vec2, b: Vec2): Vec2 | null {
  const da = sub(line.end, line.start)
  const db = sub(b, a)
  const denom = cross(da, db)
  if (Math.abs(denom) < 1e-12) return null
  const ab = sub(a, line.start)
  const t = cross(ab, db) / denom // param along the Guide line
  const u = cross(ab, da) / denom // param along the segment
  const eps = 1e-9
  if (u < -eps || u > 1 + eps) return null
  const [t0, t1] = extendRange(line)
  if (t < t0 - eps || t > t1 + eps) return null
  return add(line.start, scale(da, t))
}

/** Intersection points of a Guide circle with the finite segment [a, b].
 *  0, 1 (tangent / single crossing in range) or 2 points. */
function circleSegmentIntersection(c: EditorGuideCircle, a: Vec2, b: Vec2): Vec2[] {
  const d = sub(b, a)
  const a2 = dot(d, d)
  if (a2 < 1e-12) return []
  const f = sub(a, c.center)
  const b2 = 2 * dot(f, d)
  const c2 = dot(f, f) - c.radius * c.radius
  const disc = b2 * b2 - 4 * a2 * c2
  if (disc < 0) return []
  const sq = Math.sqrt(Math.max(disc, 0))
  const us = disc < 1e-9 ? [-b2 / (2 * a2)] : [(-b2 - sq) / (2 * a2), (-b2 + sq) / (2 * a2)]
  const eps = 1e-9
  const out: Vec2[] = []
  for (const u of us) {
    if (u < -eps || u > 1 + eps) continue
    out.push(add(a, scale(d, u)))
  }
  return out
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

/**
 * Build a fresh Guide circle from the two-click draw: `center` then
 * `radiusPoint` (the phase-carrying second click). `divided` seeds the rosette
 * division count and leads with divisions (arc ticks off) rather than ticks.
 */
export function createGuideCircle(
  center: Vec2,
  radiusPoint: Vec2,
  divided: boolean,
  existing: EditorGuide[],
): EditorGuideCircle {
  const d = sub(radiusPoint, center)
  return {
    id: `guide-${existing.length}-${Date.now()}`,
    kind: 'circle',
    center,
    radius: len(d),
    phase: Math.atan2(d.y, d.x),
    ...(divided ? { divisions: DEFAULT_CIRCLE_DIVISIONS } : {}),
    stamp: false,
    // A divided circle's scaffold IS its divisions; a plain circle leads with
    // arc ticks. Either is toggled in the popup.
    ticksEnabled: !divided,
    manualAnchors: [],
  }
}
