import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { computeContactRays, computeVertexRays, type ContactRay } from './stellation'
import { rayRayIntersect } from './intersect'
import {
  clipSegmentToPolygon,
  pairVertexAtEdge,
  emitVertexArms,
  dedupPolygonSegments,
} from './index'
import { EPSILON, dist, dot, midpoint, normalize, perp, sub, add, scale, cross, type Vec2 } from '../utils/math'

/**
 * Bespoke star-figure construction for rosette-patch (irregular / concave)
 * tilings — the "v3, λ=0" bisector-anchored construction validated by the
 * Step 0 spike (ROSETTE_PATCH_PLAN.md, 2026-07-13).
 *
 * Instead of solving for each vertex's star tip via ray-ray intersection
 * (which degenerates on irregular polygons — asymmetric pairs, tips outside
 * the tile), the tip is CONSTRUCTED on the vertex's interior angle bisector:
 * each of the two contact rays converging at the vertex is intersected with
 * the bisector as line∩line, and the tip sits at the MINIMUM of the two
 * bisector offsets (min, not mean — the mean drags arms sideways on uneven
 * vertices). The offset is then capped by the boundary-exit distance along
 * the bisector and by the centre projection, and pinned to 0 at reflex
 * vertices (tip AT the notch). Every edge midpoint anchors exactly two arms,
 * so the figure is closed by construction — no pointInPolygon, no t≤0
 * branches, no edge-slide, no per-ray fallback.
 *
 * On regular polygons both bisector offsets coincide with the natural pair-A
 * tip, so the output is segment-for-segment identical to `runPIC` (Kepler
 * baseline). Emits the exact same `Segment` shape and `kind`/`side` tagging
 * as `runPIC` so `buildStrands` and the Decoration layer work unmodified.
 *
 * Known accepted residual: decagonal-rosette's elongated hexagon (`6.3`) at
 * θ ≥ 67.5° interleaves adjacent vertex tips (arm crossings). λ/rule-invariant
 * in the spike; the crossings render as a weave, so it ships as-is (candidate
 * polish: a mutual-trim pass).
 */

/** Shoelace signed area — sign encodes winding (positive = CCW in math coords). */
function signedArea(vertices: Vec2[]): number {
  let a = 0
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const p = vertices[i]
    const q = vertices[(i + 1) % n]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

interface VertexFrame {
  /** Unit interior bisector at the vertex (flipped inward at reflex vertices). */
  bisector: Vec2
  /** True when the local turn sign opposes the polygon winding. */
  reflex: boolean
}

/**
 * Interior bisector at vertex k. Straight (180°) vertices — where
 * toPrev + toNext vanishes — use the inward edge normal instead.
 */
function vertexFrame(vertices: Vec2[], k: number, windingSign: number): VertexFrame {
  const n = vertices.length
  const V = vertices[k]
  const prev = vertices[(k - 1 + n) % n]
  const next = vertices[(k + 1) % n]
  const toPrev = normalize(sub(prev, V))
  const toNext = normalize(sub(next, V))

  const inDir = sub(V, prev)
  const outDir = sub(next, V)
  const turn = cross(inDir, outDir)
  const reflex = Math.abs(turn) > EPSILON && (turn > 0 ? 1 : -1) !== windingSign

  const sum = add(toPrev, toNext)
  if (Math.hypot(sum.x, sum.y) < 1e-6) {
    // Straight vertex: the bisector direction degenerates; the interior
    // direction is the inward edge normal (perp is inward for CCW winding).
    const nrm = perp(normalize(outDir))
    return { bisector: windingSign > 0 ? nrm : scale(nrm, -1), reflex: false }
  }

  const bis = normalize(sum)
  return { bisector: reflex ? scale(bis, -1) : bis, reflex }
}

/**
 * Distance from V along `dir` to the first polygon-boundary crossing,
 * skipping the two edges incident to vertex k. Infinity if none.
 */
function boundaryExitDist(vertices: Vec2[], k: number, V: Vec2, dir: Vec2): number {
  const n = vertices.length
  const prevEdge = (k - 1 + n) % n
  let nearest = Infinity
  for (let e = 0; e < n; e++) {
    if (e === prevEdge || e === k) continue
    const A = vertices[e]
    const B = vertices[(e + 1) % n]
    const res = rayRayIntersect(V, dir, A, sub(B, A))
    if (!res) continue
    if (res.t1 < EPSILON) continue
    if (res.t2 < -EPSILON || res.t2 > 1 + EPSILON) continue
    if (res.t1 < nearest) nearest = res.t1
  }
  return nearest
}

interface BisectorProbe {
  ray1: ContactRay
  ray2: ContactRay
  /** min of the two bisector offsets (may still need capping). */
  offset: number
  converging: boolean
}

/**
 * Intersect a converging ray pair with the vertex bisector as line∩line
 * (raw t-values, no sign rejection). The pair is converging iff every
 * intersection has ray-param t2 > −ε and bisector offset t1 > ε.
 * Parallel ray↔bisector counts as non-converging; the clamped fallback
 * treats its offset as 0.
 */
function probePair(
  V: Vec2,
  bisector: Vec2,
  ray1: ContactRay,
  ray2: ContactRay,
): BisectorProbe {
  let converging = true
  let offset = Infinity
  for (const ray of [ray1, ray2]) {
    const res = rayRayIntersect(V, bisector, ray.origin, ray.dir)
    if (!res) {
      converging = false
      offset = Math.min(offset, 0)
      continue
    }
    if (!(res.t2 > -EPSILON && res.t1 > EPSILON)) converging = false
    offset = Math.min(offset, Math.max(0, res.t1))
  }
  return { ray1, ray2, offset, converging }
}

export function runRosettePIC(polygons: Polygon[], config: PatternConfig): Segment[] {
  const segments: Segment[] = []

  for (const poly of polygons) {
    const fig = config.figures[poly.tileTypeId]
    if (!fig) continue
    const polyStartIdx = segments.length

    const n = poly.sides
    const verts = poly.vertices
    const edgeEnabled = fig.edgeLinesEnabled !== false
    const rays = computeContactRays(poly, fig.contactAngle)
    const inradius = n > 0 ? dist(poly.center, rays[0].origin) : 0
    const area = signedArea(verts)
    const windingSign = area > 0 ? 1 : -1

    if (edgeEnabled) {
      for (let k = 0; k < n; k++) {
        const prevEdge = (k - 1 + n) % n
        const V = verts[k]
        const { bisector, reflex } = vertexFrame(verts, k, windingSign)

        // Pair-A: minus-ray of the previous edge + plus-ray of the current
        // edge (same indexing as runPIC's pairAtVertex). Pair-B (the mirror)
        // is the classical concave-star switch — e.g. rhombille 120° vertices
        // at θ=72°. If neither converges, fall back to pair-A clamped ≥ 0.
        const pairA = probePair(V, bisector, rays[prevEdge * 2 + 1], rays[k * 2])
        const pair = pairA.converging
          ? pairA
          : (() => {
              const pairB = probePair(V, bisector, rays[prevEdge * 2], rays[k * 2 + 1])
              return pairB.converging ? pairB : pairA
            })()

        if (fig.autoLineLength) {
          // Caps on the bisector offset: boundary exit (arms never leave the
          // tile), centre projection when positive (regular-safe — a regular
          // polygon's natural tip only reaches the centre at θ=90°), and
          // reflex pin at 0 (any positive offset sends bowtie/gap-star tips
          // across the waist → rule-invariant crossings).
          let s = pair.offset
          s = Math.min(s, boundaryExitDist(verts, k, V, bisector))
          const centreProj = dot(sub(poly.center, V), bisector)
          if (centreProj > 0) s = Math.min(s, centreProj)
          if (reflex) s = 0
          if (!Number.isFinite(s)) s = 0

          const tip = { x: V.x + bisector.x * s, y: V.y + bisector.y * s }
          for (const ray of [pair.ray1, pair.ray2]) {
            segments.push({
              from: ray.origin,
              to: tip,
              edgeMidpoint: ray.origin,
              polygonCenter: poly.center,
              polygonSides: n,
              polygonId: poly.id,
              tileTypeId: poly.tileTypeId,
              kind: 'star-arm',
              side: ray.side,
            })
          }
        } else {
          // Fixed-length mode (not spiked; decision 2026-07-13): inherit
          // runPIC's semantics — each chosen pair ray is emitted at the
          // user-specified length, clipped to the polygon boundary. The
          // pair choice (A vs B) still follows the bisector probe so the
          // concave-star switch carries over.
          for (const ray of [pair.ray1, pair.ray2]) {
            const natural = {
              x: ray.origin.x + ray.dir.x * fig.lineLength * inradius,
              y: ray.origin.y + ray.dir.y * fig.lineLength * inradius,
            }
            segments.push({
              from: ray.origin,
              to: clipSegmentToPolygon(ray.origin, natural, verts, ray.edgeIndex).point,
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
      }
    }

    // Vertex lines: inherited verbatim from runPIC (decision 2026-07-13) —
    // same rays, pairing and emission via the shared helpers.
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
      const circumradius = n > 0 ? dist(poly.center, verts[0]) : 0

      for (let k = 0; k < n; k++) {
        const eMid = midpoint(verts[k], verts[(k + 1) % n])
        const pair = pairVertexAtEdge(vertexRays, k, (k + 1) % n, verts)
        if (!pair) continue
        emitVertexArms(pair, vtxAutoLen, vtxLineLen, circumradius, poly.id, poly.tileTypeId, poly.center, n, eMid, verts, segments)
      }
    }

    // Collinear-ray singularity (square@45°, triangles@60°): adjacent edges'
    // rays become collinear and both vertices emit the same physical line —
    // collapse endpoint-identical duplicates, same as runPIC.
    dedupPolygonSegments(segments, polyStartIdx)
  }

  return segments
}
