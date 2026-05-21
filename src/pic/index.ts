import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { computeContactRays, computeVertexRays, type ContactRay, type VertexRay } from './stellation'
import { rayRayIntersect, type IntersectResult } from './intersect'
import { EPSILON, dist, midpoint, pointInPolygon, isConvexPolygon, type Vec2 } from '../utils/math'

/**
 * For a given vertex (shared by prevEdge and currEdge), find the correct
 * ray pairing. The pairing depends on polygon winding, so we try both
 * combinations.
 *
 * Selection priority:
 *  1. Whichever pairing's intersection lies INSIDE the polygon (normal star
 *     for pair A; concave/reflex star for pair B). This lets the figure
 *     switch from convex-star to concave-star as θ sweeps past the regime
 *     where pair A's tip leaves the polygon.
 *  2. Both t positive but intersection outside — downstream emitStarArms
 *     handles via edge-slide.
 *  3. Asymmetric (one t positive, one negative). Returned only so that
 *     fixed-length emission still gets two rays at the user's chosen
 *     length; auto-length emission in emitStarArms early-returns on this
 *     case and lets the per-ray fallback handle both rays via Kaplan
 *     trim. By construction this tier never fires for regular polygons
 *     (their symmetry forces both t the same sign).
 *  4. Neither is even partially valid (parallel, or both t negative): null.
 *
 * The `convex` flag is no longer used to skip pointInPolygon — for irregular
 * convex tiles, pair A's intersection can be outside even though the polygon
 * is convex. The cost of pointInPolygon is negligible at this call rate.
 */
function pairAtVertex(
  rays: ContactRay[],
  prevEdge: number,
  currEdge: number,
  polyVertices: Vec2[],
  _convex: boolean,
): { ray1: ContactRay; ray2: ContactRay; result: IntersectResult } | null {
  const rA1 = rays[prevEdge * 2 + 1]
  const rA2 = rays[currEdge * 2]
  const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
  const aValid = !!resA && resA.t1 > EPSILON && resA.t2 > EPSILON
  const aInside = aValid && pointInPolygon(resA!.point, polyVertices)

  const rB1 = rays[prevEdge * 2]
  const rB2 = rays[currEdge * 2 + 1]
  const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
  const bValid = !!resB && resB.t1 > EPSILON && resB.t2 > EPSILON
  const bInside = bValid && pointInPolygon(resB!.point, polyVertices)

  const aAsym = !!resA && (resA.t1 > EPSILON || resA.t2 > EPSILON) && !aValid
  const bAsym = !!resB && (resB.t1 > EPSILON || resB.t2 > EPSILON) && !bValid

  // Priority: prefer pair-A; pair-B is reserved for the concave-star fallback
  // where pair-A's tip is fully outside the polygon (aValid but not aInside).
  // When pair-A is asymmetric (one ray points away from its origin) we MUST
  // stick with pair-A and let emitStarArms / per-ray fallback handle it —
  // falling through to pair-B here causes double-emission of rays that
  // neighbouring vertices' pair-A also uses (e.g. Tetrakis right-triangle
  // at θ ≥ 46° where V1 is pair-A IN but V0/V2 are pair-A ASYM + pair-B IN).
  if (aInside) return { ray1: rA1, ray2: rA2, result: resA! }
  if (aAsym) return { ray1: rA1, ray2: rA2, result: resA! }
  if (bInside) return { ray1: rB1, ray2: rB2, result: resB! }
  if (aValid) return { ray1: rA1, ray2: rA2, result: resA! }
  if (bValid) return { ray1: rB1, ray2: rB2, result: resB! }
  if (bAsym) return { ray1: rB1, ray2: rB2, result: resB! }
  return null
}

/**
 * Clip a segment from `from` to `to` against a polygon boundary.
 * `skipEdgeIdx` excludes the polygon edge the segment originates on (so
 * the on-boundary start point doesn't self-intersect).
 * If the segment's natural endpoint lies past the boundary, returns the
 * first boundary crossing; otherwise returns the natural endpoint.
 */
function clipSegmentToPolygon(
  from: Vec2,
  to: Vec2,
  polyVertices: Vec2[],
  skipEdgeIdx: number,
): Vec2 {
  const dir = { x: to.x - from.x, y: to.y - from.y }
  let nearestT = 1
  let nearestPoint = to
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
    }
  }
  return nearestPoint
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
  const clip = clipSegmentToPolygon(ray.origin, far, polyVertices, ray.edgeIndex)
  const cdist = dist(ray.origin, clip)
  if (cdist < EPSILON) return null
  if (cdist > maxLen) {
    return { x: ray.origin.x + ray.dir.x * maxLen, y: ray.origin.y + ray.dir.y * maxLen }
  }
  return clip
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
  polygonId: string,
  tileTypeId: string,
  polygonCenter: Vec2,
  polygonSides: number,
  polyVertices: Vec2[],
  segments: Segment[],
  emittedRays: Set<string>,
): void {
  const { ray1, ray2, result } = pair
  const key1 = `${ray1.edgeIndex}-${ray1.side}`
  const key2 = `${ray2.edgeIndex}-${ray2.side}`

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

    const far = {
      x: forwardRay.origin.x + forwardRay.dir.x * inradius * 4,
      y: forwardRay.origin.y + forwardRay.dir.y * inradius * 4,
    }
    const clip = clipSegmentToPolygon(forwardRay.origin, far, polyVertices, forwardRay.edgeIndex)
    if (dist(forwardRay.origin, clip) < EPSILON) return

    segments.push({
      from: forwardRay.origin,
      to: clip,
      edgeMidpoint: forwardRay.origin,
      polygonCenter,
      polygonSides,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
      side: forwardRay.side,
    })
    segments.push({
      from: clip,
      to: backRay.origin,
      edgeMidpoint: forwardRay.origin,
      polygonCenter,
      polygonSides,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
      side: forwardRay.side,
    })
    emittedRays.add(forwardKey)
    emittedRays.add(backKey)
    return
  }

  if (autoLineLength && !pointInPolygon(result.point, polyVertices)) {
    // Edge-slide mode: star tip is outside the polygon.
    const clip1 = clipSegmentToPolygon(ray1.origin, result.point, polyVertices, ray1.edgeIndex)
    const clip2 = clipSegmentToPolygon(ray2.origin, result.point, polyVertices, ray2.edgeIndex)
    const len1 = dist(ray1.origin, clip1)
    const len2 = dist(ray2.origin, clip2)
    if (len1 < EPSILON && len2 < EPSILON) return

    const longIsR1 = len1 >= len2
    const longRay = longIsR1 ? ray1 : ray2
    const longClip = longIsR1 ? clip1 : clip2
    const shortRay = longIsR1 ? ray2 : ray1
    const longKey = longIsR1 ? key1 : key2
    const shortKey = longIsR1 ? key2 : key1

    // Arm: long ray's straight portion from its origin to the boundary.
    segments.push({
      from: longRay.origin,
      to: longClip,
      edgeMidpoint: longRay.origin,
      polygonCenter,
      polygonSides,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
      side: longRay.side,
    })
    // Slide: along the shared exit edge to the suppressed ray's origin.
    segments.push({
      from: longClip,
      to: shortRay.origin,
      edgeMidpoint: longRay.origin,
      polygonCenter,
      polygonSides,
      polygonId,
      tileTypeId,
      kind: 'star-arm',
      side: longRay.side,
    })
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

  segments.push({
    from: ray1.origin,
    to: clipSegmentToPolygon(ray1.origin, to1Natural, polyVertices, ray1.edgeIndex),
    edgeMidpoint: ray1.origin,
    polygonCenter,
    polygonSides,
    polygonId,
    tileTypeId,
    kind: 'star-arm',
    side: ray1.side,
  })
  segments.push({
    from: ray2.origin,
    to: clipSegmentToPolygon(ray2.origin, to2Natural, polyVertices, ray2.edgeIndex),
    edgeMidpoint: ray2.origin,
    polygonCenter,
    polygonSides,
    polygonId,
    tileTypeId,
    kind: 'star-arm',
    side: ray2.side,
  })
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
function pairVertexAtEdge(
  vertexRays: VertexRay[],
  vIdx1: number,
  vIdx2: number,
  polyVertices: Vec2[],
  _convex: boolean,
): { ray1: VertexRay; ray2: VertexRay; result: IntersectResult } | null {
  const rA1 = vertexRays[vIdx1 * 2 + 1]
  const rA2 = vertexRays[vIdx2 * 2]
  const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
  const aValid = !!resA && resA.t1 > EPSILON && resA.t2 > EPSILON
  const aInside = aValid && pointInPolygon(resA!.point, polyVertices)

  const rB1 = vertexRays[vIdx1 * 2]
  const rB2 = vertexRays[vIdx2 * 2 + 1]
  const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
  const bValid = !!resB && resB.t1 > EPSILON && resB.t2 > EPSILON
  const bInside = bValid && pointInPolygon(resB!.point, polyVertices)

  if (aInside) return { ray1: rA1, ray2: rA2, result: resA! }
  if (bInside) return { ray1: rB1, ray2: rB2, result: resB! }
  if (aValid) return { ray1: rA1, ray2: rA2, result: resA! }
  if (bValid) return { ray1: rB1, ray2: rB2, result: resB! }
  return null
}

/**
 * Emit vertex arm segments for a single edge pairing.
 *
 * Arms originate at polygon vertices and are clipped to the polygon boundary
 * so an out-of-polygon meeting point doesn't leak into neighbouring tiles.
 */
function emitVertexArms(
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
  segments.push({
    from: ray1.origin,
    to: clipSegmentToPolygon(ray1.origin, to1Natural, polyVertices, -1),
    edgeMidpoint: edgeMid,
    polygonCenter,
    polygonSides,
    polygonId,
    tileTypeId,
    kind: 'vertex-line',
    side: ray1.side,
  })
  segments.push({
    from: ray2.origin,
    to: clipSegmentToPolygon(ray2.origin, to2Natural, polyVertices, -1),
    edgeMidpoint: edgeMid,
    polygonCenter,
    polygonSides,
    polygonId,
    tileTypeId,
    kind: 'vertex-line',
    side: ray2.side,
  })
}

/**
 * Run the full PIC pipeline for all polygons. Rays from adjacent edges
 * sharing a vertex meet at a star tip (Kaplan's PIC construction).
 */
/** Build a set of edge-midpoint keys that are shared by 2+ polygons (internal edges). */
function buildInternalEdgeSet(polygons: Polygon[]): Set<string> {
  const f = 1e3
  const edgeCounts = new Map<string, number>()
  for (const poly of polygons) {
    for (let i = 0; i < poly.sides; i++) {
      const mid = midpoint(poly.vertices[i], poly.vertices[(i + 1) % poly.sides])
      const key = `${Math.round(mid.x * f)},${Math.round(mid.y * f)}`
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
    }
  }
  const internal = new Set<string>()
  for (const [key, count] of edgeCounts) {
    if (count >= 2) internal.add(key)
  }
  return internal
}

/**
 * Dedup collinear/overlapping segments within a single polygon.
 * At certain contact angles (e.g. 60° on equilateral triangles) two adjacent
 * edges' contact rays become collinear — pair A fails, pair B succeeds, and
 * each "arm" is emitted twice (once from each end). Collapse endpoint-identical
 * pairs so each unique line renders once.
 */
function dedupPolygonSegments(segments: Segment[], startIdx: number): void {
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
  const internalEdges = buildInternalEdgeSet(polygons)
  const edgeKeyF = 1e3

  for (const poly of polygons) {
    const fig = config.figures[poly.tileTypeId]
    if (!fig) continue
    const polyStartIdx = segments.length

    const edgeEnabled = fig.edgeLinesEnabled !== false
    const rays = computeContactRays(poly, fig.contactAngle)
    const n = poly.sides
    const inradius = n > 0 ? dist(poly.center, rays[0].origin) : 0
    const convex = isConvexPolygon(poly.vertices)

    const emittedRays = new Set<string>()

    for (let k = 0; k < n; k++) {
      const prevEdge = (k - 1 + n) % n
      const pair = pairAtVertex(rays, prevEdge, k, poly.vertices, convex)
      if (!pair) continue

      if (edgeEnabled) {
        emitStarArms(pair, fig.autoLineLength, fig.lineLength, inradius, poly.id, poly.tileTypeId, poly.center, n, poly.vertices, segments, emittedRays)
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
        if (dist(ray.origin, endpoint) < minLen) continue
        segments.push({
          from: ray.origin,
          to: endpoint,
          edgeMidpoint: ray.origin,
          polygonCenter: poly.center,
          polygonSides: n,
          polygonId: poly.id,
          tileTypeId: poly.tileTypeId,
          kind: 'star-arm',
          side: ray.side,
        })
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

      const vertexRays = computeVertexRays(poly, vtxAngle)
      const circumradius = n > 0 ? dist(poly.center, poly.vertices[0]) : 0

      for (let k = 0; k < n; k++) {
        // Only emit vertex lines for internal edges (shared by 2 polygons)
        const eMid = midpoint(poly.vertices[k], poly.vertices[(k + 1) % n])
        const eKey = `${Math.round(eMid.x * edgeKeyF)},${Math.round(eMid.y * edgeKeyF)}`
        if (!internalEdges.has(eKey)) continue

        const nextV = (k + 1) % n
        const pair = pairVertexAtEdge(vertexRays, k, nextV, poly.vertices, convex)
        if (!pair) continue
        emitVertexArms(pair, vtxAutoLen, vtxLineLen, circumradius, poly.id, poly.tileTypeId, poly.center, n, eMid, poly.vertices, segments)
      }
    }

    dedupPolygonSegments(segments, polyStartIdx)
  }

  return segments
}
