import type { Polygon, RaySide, Segment, SegmentKind } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { computeContactRays, computeContactRaysPerEdge, computeVertexRays, computeVertexRaysPerVertex, type ContactRay, type VertexRay } from './stellation'
import { activeMorph, morphValueAt } from './morph'
import { rayRayIntersect, type IntersectResult } from './intersect'
import { EPSILON, dist, midpoint, pointInPolygon, isConvexPolygon, type Vec2 } from '../utils/math'

/**
 * Ray-ray probe shared by `pairAtVertex` and `pairVertexAtEdge`: intersect
 * two rays and classify the meeting point. `valid` requires both rays to
 * meet ahead of their own origins; `inside` additionally requires the
 * meeting point to lie within the polygon.
 *
 * A polygon-convexity flag is deliberately NOT taken to skip pointInPolygon —
 * for irregular convex tiles, a pairing's intersection can be outside even
 * though the polygon is convex. The cost of pointInPolygon is negligible here.
 */
function probePair(
  r1: { origin: Vec2; dir: Vec2 },
  r2: { origin: Vec2; dir: Vec2 },
  polyVertices: Vec2[],
): { result: IntersectResult | null; valid: boolean; inside: boolean } {
  const result = rayRayIntersect(r1.origin, r1.dir, r2.origin, r2.dir)
  const valid = !!result && result.t1 > EPSILON && result.t2 > EPSILON
  const inside = valid && pointInPolygon(result!.point, polyVertices)
  return { result, valid, inside }
}

/**
 * For a given vertex (shared by prevEdge and currEdge), find the correct
 * ray pairing. The pairing depends on polygon winding, so we try both
 * combinations.
 *
 * Selection priority (a named-case table, evaluated in order — first match
 * wins; see the block comment above each case's condition upstream in
 * `probePair`/`aAsym`/`bAsym` for what each one means):
 *  1. `aInside` — pair-A's intersection lies INSIDE the polygon (normal
 *     star). Preferred: pair-B is reserved for the concave-star fallback
 *     where pair-A's tip is fully outside the polygon (aValid but not
 *     aInside).
 *  2. `aAsym` — pair-A is asymmetric (one ray points away from its origin,
 *     e.g. the Tetrakis Square right-triangle's 45° vertices at θ ≥ 46°).
 *     MUST stick with pair-A here and let emitStarArms / per-ray fallback
 *     handle it — falling through to pair-B causes double-emission of rays
 *     that a neighbouring vertex's pair-A also uses (e.g. V1 pair-A IN but
 *     V0/V2 pair-A ASYM + pair-B IN).
 *  3. `bInside` — pair-B's intersection lies inside (concave/reflex star).
 *  4. `aValid` — both t positive but intersection outside; downstream
 *     emitStarArms handles via edge-slide.
 *  5. `bValid` — same, for pair-B.
 *  6. `bAsym` — pair-B asymmetric. Returned only so fixed-length emission
 *     still gets two rays at the user's chosen length; auto-length emission
 *     in emitStarArms early-returns on the asymmetric case and lets the
 *     per-ray fallback handle both rays via Kaplan trim. By construction
 *     this tier never fires for regular polygons (their symmetry forces
 *     both t the same sign).
 *  Neither valid (parallel, or both t negative): null.
 */
function pairAtVertex(
  rays: ContactRay[],
  prevEdge: number,
  currEdge: number,
  polyVertices: Vec2[],
): { ray1: ContactRay; ray2: ContactRay; result: IntersectResult } | null {
  const rA1 = rays[prevEdge * 2 + 1]
  const rA2 = rays[currEdge * 2]
  const a = probePair(rA1, rA2, polyVertices)

  const rB1 = rays[prevEdge * 2]
  const rB2 = rays[currEdge * 2 + 1]
  const b = probePair(rB1, rB2, polyVertices)

  const aAsym = !!a.result && (a.result.t1 > EPSILON || a.result.t2 > EPSILON) && !a.valid
  const bAsym = !!b.result && (b.result.t1 > EPSILON || b.result.t2 > EPSILON) && !b.valid

  const cases: { cond: boolean; ray1: ContactRay; ray2: ContactRay; result: IntersectResult | null }[] = [
    { cond: a.inside, ray1: rA1, ray2: rA2, result: a.result },
    { cond: aAsym, ray1: rA1, ray2: rA2, result: a.result },
    { cond: b.inside, ray1: rB1, ray2: rB2, result: b.result },
    { cond: a.valid, ray1: rA1, ray2: rA2, result: a.result },
    { cond: b.valid, ray1: rB1, ray2: rB2, result: b.result },
    { cond: bAsym, ray1: rB1, ray2: rB2, result: b.result },
  ]
  for (const c of cases) {
    if (c.cond) return { ray1: c.ray1, ray2: c.ray2, result: c.result! }
  }
  return null
}

/**
 * Clip a segment from `from` to `to` against a polygon boundary.
 * `skipEdgeIdx` excludes the polygon edge the segment originates on (so
 * the on-boundary start point doesn't self-intersect).
 * Returns the first boundary crossing and its edge index, or the natural
 * endpoint with `edgeIdx: -1` if the segment doesn't reach the boundary.
 *
 * Exported for reuse by `rosettePatch.ts` (as are pairVertexAtEdge,
 * emitVertexArms and dedupPolygonSegments) — behaviour changes here affect
 * both constructions.
 */
export function clipSegmentToPolygon(
  from: Vec2,
  to: Vec2,
  polyVertices: Vec2[],
  skipEdgeIdx: number,
): { point: Vec2; edgeIdx: number } {
  const dir = { x: to.x - from.x, y: to.y - from.y }
  let nearestT = 1
  let nearestPoint = to
  let nearestEdge = -1
  const n = polyVertices.length
  for (let k = 0; k < n; k++) {
    if (k === skipEdgeIdx) continue
    const A = polyVertices[k]
    const B = polyVertices[(k + 1) % n]
    const edgeDir = { x: B.x - A.x, y: B.y - A.y }
    const res = rayRayIntersect(from, dir, A, edgeDir)
    if (!res) continue
    if (res.t1 < EPSILON || res.t1 > 1 + EPSILON) continue
    if (res.t2 < -EPSILON || res.t2 > 1 + EPSILON) continue
    if (res.t1 < nearestT) {
      nearestT = res.t1
      nearestPoint = res.point
      nearestEdge = k
    }
  }
  return { point: nearestPoint, edgeIdx: nearestEdge }
}

/**
 * Find the endpoint for an "orphan" ray — one that didn't get emitted by
 * the vertex-pair pass (its natural pair-A meeting fell outside the
 * polygon, or one or both rays in the pair pointed away from it).
 * Returns the nearest valid intersection with any other-edge ray (the
 * original Kaplan trim algorithm), or — if no such intersection exists —
 * the polygon-boundary clip capped at maxLen.
 *
 * Caller is responsible for the stub-length drop check; this function
 * just returns the geometric endpoint.
 */
function findOrphanRayEndpoint(
  ray: ContactRay,
  allRays: ContactRay[],
  polyVertices: Vec2[],
  maxLen: number,
): Vec2 | null {
  let nearestT = Infinity
  let nearestPoint: Vec2 | null = null
  for (const other of allRays) {
    if (other === ray) continue
    if (other.edgeIndex === ray.edgeIndex) continue
    const res = rayRayIntersect(ray.origin, ray.dir, other.origin, other.dir)
    if (!res) continue
    if (res.t1 < EPSILON || res.t2 < EPSILON) continue
    if (!pointInPolygon(res.point, polyVertices)) continue
    if (res.t1 < nearestT) {
      nearestT = res.t1
      nearestPoint = res.point
    }
  }
  if (nearestPoint) return nearestPoint

  const far = {
    x: ray.origin.x + ray.dir.x * maxLen * 4,
    y: ray.origin.y + ray.dir.y * maxLen * 4,
  }
  const { point: clip } = clipSegmentToPolygon(ray.origin, far, polyVertices, ray.edgeIndex)
  const cdist = dist(ray.origin, clip)
  if (cdist < EPSILON) return null
  if (cdist > maxLen) {
    return { x: ray.origin.x + ray.dir.x * maxLen, y: ray.origin.y + ray.dir.y * maxLen }
  }
  return clip
}

/** Per-polygon fields every emitted `Segment` in a figure pass shares —
 * bundled once so the push helpers below don't repeat 4 positional args at
 * every call site. */
interface PolyCtx {
  polygonId: string
  tileTypeId: string
  polygonCenter: Vec2
  polygonSides: number
  kind: SegmentKind
}

/** Push one `Segment`, filling the per-polygon fields from `ctx`. */
function pushSegment(
  segments: Segment[],
  ctx: PolyCtx,
  from: Vec2,
  to: Vec2,
  edgeMidpoint: Vec2,
  side: RaySide,
): void {
  segments.push({
    from,
    to,
    edgeMidpoint,
    polygonCenter: ctx.polygonCenter,
    polygonSides: ctx.polygonSides,
    polygonId: ctx.polygonId,
    tileTypeId: ctx.tileTypeId,
    kind: ctx.kind,
    side,
  })
}

/** Push a centroid-routed V — each ray's origin to the polygon centre — and
 * mark both rays emitted. Shared by `emitStarArms`'s asymmetric-pair and
 * outside-tip branches (2026-05-22, Direction 3): the two branches hit the
 * same "route through the centre on convex polygons" case from different
 * degenerate starting points. */
function pushCentroidPair(
  segments: Segment[],
  ctx: PolyCtx,
  emittedRays: Set<string>,
  ray1: { origin: Vec2; side: RaySide },
  key1: string,
  ray2: { origin: Vec2; side: RaySide },
  key2: string,
): void {
  pushSegment(segments, ctx, ray1.origin, ctx.polygonCenter, ray1.origin, ray1.side)
  pushSegment(segments, ctx, ray2.origin, ctx.polygonCenter, ray2.origin, ray2.side)
  emittedRays.add(key1)
  emittedRays.add(key2)
}

/**
 * Emit star arm segments for a single vertex pairing.
 *
 * When the natural ray-pair intersection (the star tip) sits outside the
 * polygon — common on irregular convex tiles at low θ — the figure switches
 * to "edge-slide" mode: the shorter clipped ray is suppressed (pinned at 0)
 * and the longer ray is emitted as two segments — origin → boundary clip,
 * then boundary clip → suppressed ray's origin along the shared exit edge.
 * In autoLineLength=false (fixed length) mode the boundary clip is just a
 * safety stop with no slide.
 */
function emitStarArms(
  pair: { ray1: ContactRay; ray2: ContactRay; result: IntersectResult },
  autoLineLength: boolean,
  lineLength: number,
  inradius: number,
  ctx: PolyCtx,
  polyVertices: Vec2[],
  segments: Segment[],
  emittedRays: Set<string>,
): void {
  const { ray1, ray2, result } = pair
  const key1 = `${ray1.edgeIndex}-${ray1.side}`
  const key2 = `${ray2.edgeIndex}-${ray2.side}`

  // Convex polygons route through the centre (centroid V); concave polygons
  // fall back to the edge-slide below since the centroid may lie outside the
  // polygon. The same-edge guard still applies to the edge-slide regardless —
  // cross-polygon cuts are never desired.
  const useCentroidV = isConvexPolygon(polyVertices)

  // Asymmetric pair (one ray's meeting is behind its origin) — e.g. the
  // Tetrakis Square right-triangle's 45° vertices at θ ≥ 46°, where one
  // contact ray points away from the would-be star tip. In auto-length
  // mode, emit just the forward ray as an edge-slide: forward ray from
  // its origin to the polygon boundary, then slide along the boundary
  // to the back ray's origin. Mark BOTH rays as emitted so the per-ray
  // fallback doesn't redundantly draw the (tiny) Kaplan-trim crossing
  // for the back ray — the slide already provides the strand continuity
  // to the back ray's edge midpoint. Fixed-length mode falls through to
  // the normal path, which ignores result.point and emits both rays at
  // user-specified length.
  if (autoLineLength && (result.t1 <= EPSILON || result.t2 <= EPSILON)) {
    const forwardRay = result.t1 > EPSILON ? ray1 : ray2
    const backRay = result.t1 > EPSILON ? ray2 : ray1
    const forwardKey = result.t1 > EPSILON ? key1 : key2
    const backKey = result.t1 > EPSILON ? key2 : key1

    if (useCentroidV) {
      pushCentroidPair(segments, ctx, emittedRays, forwardRay, forwardKey, backRay, backKey)
      return
    }

    // Concave path: original edge-slide with same-edge guard.
    const far = {
      x: forwardRay.origin.x + forwardRay.dir.x * inradius * 4,
      y: forwardRay.origin.y + forwardRay.dir.y * inradius * 4,
    }
    const { point: clip, edgeIdx: clipEdge } = clipSegmentToPolygon(forwardRay.origin, far, polyVertices, forwardRay.edgeIndex)
    const armLen = dist(forwardRay.origin, clip)
    if (armLen < EPSILON) return

    pushSegment(segments, ctx, forwardRay.origin, clip, forwardRay.origin, forwardRay.side)
    // Same-edge slide guard: the slide is only valid when it runs along
    // a single polygon edge — i.e. the boundary clip and the back ray's
    // origin both lie on the same edge. On concave polygons the forward
    // ray can exit through a different edge (e.g. across a reflex notch),
    // which would draw the slide straight across the polygon interior.
    // When that happens, emit just the forward arm and let the back ray
    // fall through to the per-ray fallback.
    if (clipEdge !== -1 && clipEdge !== backRay.edgeIndex) {
      emittedRays.add(forwardKey)
      return
    }
    pushSegment(segments, ctx, clip, backRay.origin, forwardRay.origin, forwardRay.side)
    emittedRays.add(forwardKey)
    emittedRays.add(backKey)
    return
  }

  if (autoLineLength && !pointInPolygon(result.point, polyVertices)) {
    // Star tip is outside the polygon. Centroid-routed V (mirrors the
    // asymmetric branch): convex polygons route ray1.origin → centre and
    // ray2.origin → centre instead of clipping + sliding along the boundary.
    if (useCentroidV) {
      pushCentroidPair(segments, ctx, emittedRays, ray1, key1, ray2, key2)
      return
    }

    // Concave path: original edge-slide with same-edge guard.
    const clip1Res = clipSegmentToPolygon(ray1.origin, result.point, polyVertices, ray1.edgeIndex)
    const clip2Res = clipSegmentToPolygon(ray2.origin, result.point, polyVertices, ray2.edgeIndex)
    const len1 = dist(ray1.origin, clip1Res.point)
    const len2 = dist(ray2.origin, clip2Res.point)
    if (len1 < EPSILON && len2 < EPSILON) return

    const longIsR1 = len1 >= len2
    const longRay = longIsR1 ? ray1 : ray2
    const longClipRes = longIsR1 ? clip1Res : clip2Res
    const shortRay = longIsR1 ? ray2 : ray1
    const longKey = longIsR1 ? key1 : key2
    const shortKey = longIsR1 ? key2 : key1

    // Arm: long ray's straight portion from its origin to the boundary.
    pushSegment(segments, ctx, longRay.origin, longClipRes.point, longRay.origin, longRay.side)
    // Same-edge slide guard: only slide when the long ray's clip lands
    // on the short ray's edge — otherwise the slide would cut across
    // the polygon interior (concave polygon with reflex notch). When
    // suppressed, emit just the forward arm; the short ray falls through
    // to per-ray fallback.
    if (longClipRes.edgeIdx !== -1 && longClipRes.edgeIdx !== shortRay.edgeIndex) {
      emittedRays.add(longKey)
      return
    }
    // Slide: along the shared exit edge to the suppressed ray's origin.
    pushSegment(segments, ctx, longClipRes.point, shortRay.origin, longRay.origin, longRay.side)
    // Both rays consumed — the slide already lands at the short ray's
    // origin, so don't let the per-ray fallback redundantly emit a
    // (typically short) Kaplan-trim segment for the short ray on top.
    emittedRays.add(longKey)
    emittedRays.add(shortKey)
    return
  }

  const to1Natural = autoLineLength
    ? result.point
    : {
        x: ray1.origin.x + ray1.dir.x * lineLength * inradius,
        y: ray1.origin.y + ray1.dir.y * lineLength * inradius,
      }
  const to2Natural = autoLineLength
    ? result.point
    : {
        x: ray2.origin.x + ray2.dir.x * lineLength * inradius,
        y: ray2.origin.y + ray2.dir.y * lineLength * inradius,
      }

  pushSegment(segments, ctx, ray1.origin, clipSegmentToPolygon(ray1.origin, to1Natural, polyVertices, ray1.edgeIndex).point, ray1.origin, ray1.side)
  pushSegment(segments, ctx, ray2.origin, clipSegmentToPolygon(ray2.origin, to2Natural, polyVertices, ray2.edgeIndex).point, ray2.origin, ray2.side)
  emittedRays.add(key1)
  emittedRays.add(key2)
}

/**
 * Pair vertex rays from two adjacent vertices sharing an edge.
 * Mirrors pairAtVertex but for vertex-origin rays.
 *
 * NOTE: this function carries the same per-edge pair-A/pair-B selection
 * pattern as `pairAtVertex`. If adjacent edges of an irregular polygon
 * choose different pair types (one aInside, the next bInside), they can
 * share a vertex ray and double-emit it — the same bug pattern fixed
 * for star arms in `pairAtVertex`. emitVertexArms doesn't track an
 * `emittedRays` set, so a double-emission would render as two visible
 * overlapping vertex lines. No user-facing report yet; if vertex-lines
 * artefacts appear on irregular polygons, lift the pair selection to
 * the polygon level (one pair-type per polygon) the same way the star-
 * arm fix could be extended.
 */
export function pairVertexAtEdge(
  vertexRays: VertexRay[],
  vIdx1: number,
  vIdx2: number,
  polyVertices: Vec2[],
): { ray1: VertexRay; ray2: VertexRay; result: IntersectResult } | null {
  const rA1 = vertexRays[vIdx1 * 2 + 1]
  const rA2 = vertexRays[vIdx2 * 2]
  const a = probePair(rA1, rA2, polyVertices)

  const rB1 = vertexRays[vIdx1 * 2]
  const rB2 = vertexRays[vIdx2 * 2 + 1]
  const b = probePair(rB1, rB2, polyVertices)

  const cases: { cond: boolean; ray1: VertexRay; ray2: VertexRay; result: IntersectResult | null }[] = [
    { cond: a.inside, ray1: rA1, ray2: rA2, result: a.result },
    { cond: b.inside, ray1: rB1, ray2: rB2, result: b.result },
    { cond: a.valid, ray1: rA1, ray2: rA2, result: a.result },
    { cond: b.valid, ray1: rB1, ray2: rB2, result: b.result },
  ]
  for (const c of cases) {
    if (c.cond) return { ray1: c.ray1, ray2: c.ray2, result: c.result! }
  }
  return null
}

/**
 * Emit vertex arm segments for a single edge pairing.
 *
 * Arms originate at polygon vertices and are clipped to the polygon boundary
 * so an out-of-polygon meeting point doesn't leak into neighbouring tiles.
 */
export function emitVertexArms(
  pair: { ray1: VertexRay; ray2: VertexRay; result: IntersectResult },
  autoLineLength: boolean,
  lineLength: number,
  circumradius: number,
  polygonId: string,
  tileTypeId: string,
  polygonCenter: Vec2,
  polygonSides: number,
  edgeMid: Vec2,
  polyVertices: Vec2[],
  segments: Segment[],
): void {
  const { ray1, ray2, result } = pair
  const ctx: PolyCtx = { polygonId, tileTypeId, polygonCenter, polygonSides, kind: 'vertex-line' }

  const to1Natural = autoLineLength
    ? result.point
    : {
        x: ray1.origin.x + ray1.dir.x * lineLength * circumradius,
        y: ray1.origin.y + ray1.dir.y * lineLength * circumradius,
      }
  const to2Natural = autoLineLength
    ? result.point
    : {
        x: ray2.origin.x + ray2.dir.x * lineLength * circumradius,
        y: ray2.origin.y + ray2.dir.y * lineLength * circumradius,
      }

  // Vertex arms start at a polygon vertex (incident to two edges); t1 > EPSILON
  // alone rejects the trivial self-intersection so no skipEdgeIdx is needed.
  pushSegment(segments, ctx, ray1.origin, clipSegmentToPolygon(ray1.origin, to1Natural, polyVertices, -1).point, edgeMid, ray1.side)
  pushSegment(segments, ctx, ray2.origin, clipSegmentToPolygon(ray2.origin, to2Natural, polyVertices, -1).point, edgeMid, ray2.side)
}

/**
 * Dedup collinear/overlapping segments within a single polygon.
 * At certain contact angles (e.g. 60° on equilateral triangles) two adjacent
 * edges' contact rays become collinear — pair A fails, pair B succeeds, and
 * each "arm" is emitted twice (once from each end). Collapse endpoint-identical
 * pairs so each unique line renders once.
 */
export function dedupPolygonSegments(segments: Segment[], startIdx: number): void {
  const f = 1e3
  const seen = new Set<string>()
  const keep: Segment[] = []
  for (let i = startIdx; i < segments.length; i++) {
    const s = segments[i]
    const ax = Math.round(s.from.x * f), ay = Math.round(s.from.y * f)
    const bx = Math.round(s.to.x * f), by = Math.round(s.to.y * f)
    const key = ax < bx || (ax === bx && ay <= by)
      ? `${ax},${ay}|${bx},${by}`
      : `${bx},${by}|${ax},${ay}`
    if (seen.has(key)) continue
    seen.add(key)
    keep.push(s)
  }
  if (keep.length !== segments.length - startIdx) {
    segments.splice(startIdx, segments.length - startIdx, ...keep)
  }
}

export function runPIC(polygons: Polygon[], config: PatternConfig): Segment[] {
  const segments: Segment[] = []
  // Step 20 Morph — with an active morph, θ is evaluated per edge midpoint
  // (and per vertex for vertex lines) through the world-space morph field
  // instead of once per tile type. Polygons must be in world space here (they
  // are on every runPIC path; the periodic fast-path, which PICs a base
  // domain and stamps copies, is gated off by `morphActive`).
  const morph = activeMorph(config)

  for (const poly of polygons) {
    const fig = config.figures[poly.tileTypeId]
    if (!fig) continue
    const polyStartIdx = segments.length

    const edgeEnabled = fig.edgeLinesEnabled !== false
    const rays = morph
      ? computeContactRaysPerEdge(poly, (_i, mid) =>
          morphValueAt(morph, poly.tileTypeId, 'contactAngle', fig.contactAngle, mid))
      : computeContactRays(poly, fig.contactAngle)
    const n = poly.sides
    const inradius = n > 0 ? dist(poly.center, rays[0].origin) : 0
    const starCtx: PolyCtx = { polygonId: poly.id, tileTypeId: poly.tileTypeId, polygonCenter: poly.center, polygonSides: n, kind: 'star-arm' }

    const emittedRays = new Set<string>()

    for (let k = 0; k < n; k++) {
      const prevEdge = (k - 1 + n) % n
      const pair = pairAtVertex(rays, prevEdge, k, poly.vertices)
      if (!pair) continue

      if (edgeEnabled) {
        emitStarArms(pair, fig.autoLineLength, fig.lineLength, inradius, starCtx, poly.vertices, segments, emittedRays)
      }
    }

    // Per-ray fallback for orphan rays (no successful vertex pair).
    //
    // Common in two regimes:
    //  - Irregular polygons in degenerate θ bands (e.g. Cairo short edge
    //    at 25-32°), where multiple adjacent pairs fail asymmetrically.
    //  - User-authored Lab polygons whose vertex angles fall outside the
    //    PIC contact-angle range.
    //
    // Each unemitted ray's endpoint is its nearest valid crossing with
    // any other-edge ray (Kaplan's trim). Drop the emission only when
    // the endpoint is implausibly close to the origin (a "stub from the
    // edge midpoint" artifact). The longer asymmetric forwards meeting
    // just inside an in-between edge are preserved — that's the
    // "rays joining before the edge" behavior the user wants. Regular
    // polygons emit every ray through the pair pass so this loop is a
    // no-op for them.
    const ORPHAN_MIN_LEN_FRACTION = 0.25
    if (edgeEnabled) {
      const fallbackLen = fig.autoLineLength ? inradius : fig.lineLength * inradius
      const minLen = inradius * ORPHAN_MIN_LEN_FRACTION
      for (const ray of rays) {
        if (emittedRays.has(`${ray.edgeIndex}-${ray.side}`)) continue
        const endpoint = findOrphanRayEndpoint(ray, rays, poly.vertices, fallbackLen)
        if (!endpoint) continue
        const len = dist(ray.origin, endpoint)
        if (len < minLen) continue
        pushSegment(segments, starCtx, ray.origin, endpoint, ray.origin, ray.side)
      }
    }

    // Vertex lines: rays from polygon vertices
    if (fig.vertexLinesEnabled) {
      const vtxAngle = fig.vertexLinesDecoupled
        ? (fig.vertexContactAngle ?? fig.contactAngle)
        : fig.contactAngle
      const vtxAutoLen = fig.vertexLinesDecoupled
        ? (fig.vertexAutoLineLength ?? fig.autoLineLength)
        : fig.autoLineLength
      const vtxLineLen = fig.vertexLinesDecoupled
        ? (fig.vertexLineLength ?? fig.lineLength)
        : fig.lineLength

      // Decoupled vertex lines interpolate their own `vertexContactAngle`
      // overlay field; coupled ones ride `contactAngle` (matching the uniform
      // path's fallbacks — `vtxAngle` is the resolved start value either way).
      const vertexRays = morph
        ? computeVertexRaysPerVertex(poly, (_k, v) => morphValueAt(
            morph,
            poly.tileTypeId,
            fig.vertexLinesDecoupled ? 'vertexContactAngle' : 'contactAngle',
            vtxAngle,
            v,
          ))
        : computeVertexRays(poly, vtxAngle)
      const circumradius = n > 0 ? dist(poly.center, poly.vertices[0]) : 0

      // Emit vertex lines on EVERY edge of any shape with them enabled — a
      // shape's figure is self-contained, so enabling vertex lines shows them
      // across the whole shape (user decision 2026-06-17). They are NOT gated
      // on shared/internal edges: that gate produced partial figures (strands
      // on only the edges that happened to abut a neighbour) and was the source
      // of the appear/disappear-as-tiles-slide behaviour. Overlap stays a
      // non-issue: PIC iterates real tiles only, so an overlap region is never
      // its own tile — each tile keeps its own distinct strands and they cross.
      for (let k = 0; k < n; k++) {
        const eMid = midpoint(poly.vertices[k], poly.vertices[(k + 1) % n])
        const nextV = (k + 1) % n
        const pair = pairVertexAtEdge(vertexRays, k, nextV, poly.vertices)
        if (!pair) continue
        emitVertexArms(pair, vtxAutoLen, vtxLineLen, circumradius, poly.id, poly.tileTypeId, poly.center, n, eMid, poly.vertices, segments)
      }
    }

    dedupPolygonSegments(segments, polyStartIdx)
  }

  return segments
}
