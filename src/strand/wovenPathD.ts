import { add, clamp, cross, dist, evalCubic, len, lerp, perp, quarticToCubics, scale, splitCubic, sub, type Vec2 } from '../utils/math'
import type { CurvedStrand } from './computeCurves'

/**
 * Woven path generation — render a Strand with a gap cut around every
 * crossing it passes **under** (Taprats interlace look: the under thread
 * breaks, the over thread runs continuous; whatever sits beneath shows
 * through the gap, so fills and background survive).
 *
 * Edges are decomposed into line / cubic primitives (the same shapes
 * `curvedPathD` emits — quadratics are exactly degree-elevated, quartics use
 * the shared two-cubic approximation) and trimmed by arc length with
 * De Casteljau splits. Cut positions come from the straight-line strand
 * geometry; with strong curve offsets the true curved-crossing point can
 * drift off the computed position — a known approximation.
 */

type Prim =
  | { kind: 'L'; end: Vec2 }
  | { kind: 'C'; cp1: Vec2; cp2: Vec2; end: Vec2 }

const SAMPLES = 16

function samePt(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
}

/** Decompose one Strand edge into primitives, mirroring `edgeCommand`. */
function edgePrims(start: Vec2, end: Vec2, cps: Vec2[] | null): Prim[] {
  if (!cps || cps.length === 0) {
    return [{ kind: 'L', end }]
  } else if (cps.length === 1) {
    // Exact degree elevation Q → C so trimming is uniform.
    return [{ kind: 'C', cp1: lerp(start, cps[0], 2 / 3), cp2: lerp(end, cps[0], 2 / 3), end }]
  } else if (cps.length === 2) {
    return [{ kind: 'C', cp1: cps[0], cp2: cps[1], end }]
  } else {
    const [a, b] = quarticToCubics(start, cps[0], cps[1], cps[2], end)
    return [
      { kind: 'C', cp1: a.cp1, cp2: a.cp2, end: a.end },
      { kind: 'C', cp1: b.cp1, cp2: b.cp2, end: b.end },
    ]
  }
}

/** Cumulative arc-length samples at t = k/SAMPLES (cum[0] = 0). */
function primCumLengths(start: Vec2, prim: Prim): number[] {
  const cum = [0]
  if (prim.kind === 'L') {
    const total = dist(start, prim.end)
    for (let k = 1; k <= SAMPLES; k++) cum.push((total * k) / SAMPLES)
    return cum
  }
  let prev = start
  let acc = 0
  for (let k = 1; k <= SAMPLES; k++) {
    const p = evalCubic(start, prim.cp1, prim.cp2, prim.end, k / SAMPLES)
    acc += dist(prev, p)
    cum.push(acc)
    prev = p
  }
  return cum
}

/** Invert the sampled arc-length map: distance d → curve parameter t. */
function paramAtDistance(cum: number[], d: number): number {
  if (d <= 0) return 0
  const total = cum[cum.length - 1]
  if (d >= total) return 1
  let k = 0
  while (cum[k + 1] < d) k++
  const span = cum[k + 1] - cum[k]
  const frac = span > 1e-12 ? (d - cum[k]) / span : 0
  return (k + frac) / SAMPLES
}

/** Split a primitive at parameter t. Returns [left, right]; right starts at the split point. */
function splitPrim(start: Vec2, prim: Prim, t: number): { split: Vec2; left: Prim; right: Prim } {
  if (prim.kind === 'L') {
    const split = lerp(start, prim.end, t)
    return { split, left: { kind: 'L', end: split }, right: { kind: 'L', end: prim.end } }
  }
  const [l, r] = splitCubic(start, prim.cp1, prim.cp2, prim.end, t)
  return {
    split: l.end,
    left: { kind: 'C', cp1: l.cp1, cp2: l.cp2, end: l.end },
    right: { kind: 'C', cp1: r.cp1, cp2: r.cp2, end: r.end },
  }
}

function primCommand(prim: Prim): string {
  return prim.kind === 'L'
    ? `L${prim.end.x} ${prim.end.y}`
    : `C${prim.cp1.x} ${prim.cp1.y} ${prim.cp2.x} ${prim.cp2.y} ${prim.end.x} ${prim.end.y}`
}

export interface PathCut {
  /**
   * Position along the Strand: edgeIndex + t (t ∈ [0,1) along that edge).
   * Integers are chain points; 0 doubles as the wrap point of a closed
   * Strand. Matches `UnderCut.s` from `weave.ts`.
   */
  s: number
  /** Half-gap arc length trimmed on each side of the cut position. */
  half: number
  /** World point of the crossing (needed for angled cap wedges). */
  point?: Vec2
  /** Unit direction of the over thread (needed for angled cap wedges). */
  over?: Vec2
  /** Crossing-angle widening factor from `UnderCut` (angled cap wedges). */
  factor?: number
}

export interface GapCap {
  /** Stroke end point on the strand centreline (post-split, exact). */
  point: Vec2
  /** Unit tangent at the end, pointing out of the stroke into the gap. */
  dir: Vec2
  /** The cut that owns this gap boundary. */
  cut: PathCut
}

/** Unit tangent of a primitive at its start. */
function startTangent(start: Vec2, prim: Prim): Vec2 {
  if (prim.kind === 'L') return safeUnit(sub(prim.end, start))
  for (const p of [prim.cp1, prim.cp2, prim.end]) {
    const d = sub(p, start)
    if (len(d) > 1e-9) return safeUnit(d)
  }
  return { x: 1, y: 0 }
}

/** Unit tangent of a primitive at its end. */
function endTangent(start: Vec2, prim: Prim): Vec2 {
  if (prim.kind === 'L') return safeUnit(sub(prim.end, start))
  for (const p of [prim.cp2, prim.cp1, start]) {
    const d = sub(prim.end, p)
    if (len(d) > 1e-9) return safeUnit(d)
  }
  return { x: 1, y: 0 }
}

function safeUnit(v: Vec2): Vec2 {
  const l = len(v)
  return l > 1e-12 ? scale(v, 1 / l) : { x: 1, y: 0 }
}

/** Back-compatible wrapper returning just the path `d`. */
export function wovenPathD(strand: CurvedStrand, cuts: PathCut[]): string {
  return wovenPath(strand, cuts).d
}

/**
 * Generate an SVG path `d` for a Strand with under-crossing gaps.
 *
 * Each cut removes the arc interval [D−half, D+half] around its position's
 * global arc distance D — gaps can sit mid-edge (vertex-strand crossings) or
 * at chain points, span edge joins, and overlap each other (intervals are
 * merged). Closed Strands wrap the interval around the seam. What remains is
 * emitted as M-prefixed sub-paths.
 *
 * Alongside `d`, every gap boundary is reported as a `GapCap` (exact split
 * point + outward tangent + owning cut) so the renderer can dress the stroke
 * ends — see `weaveCapWedgeD`.
 */
export function wovenPath(strand: CurvedStrand, cuts: PathCut[]): { d: string; caps: GapCap[] } {
  const { points, curves } = strand
  const n = points.length
  if (n < 2) return { d: '', caps: [] }

  // Measure the full prim chain (cum samples kept for the emission pass).
  const allPrims: Prim[] = []
  const primStartPt: Vec2[] = []
  const primStartDist: number[] = []
  const primCums: number[][] = []
  const edgeFirstPrim: number[] = []
  const edgeStartDist: number[] = []
  let total = 0
  for (let i = 0; i < n - 1; i++) {
    edgeFirstPrim.push(allPrims.length)
    edgeStartDist.push(total)
    let start = points[i]
    for (const prim of edgePrims(points[i], points[i + 1], curves[i])) {
      const cum = primCumLengths(start, prim)
      primStartPt.push(start)
      primStartDist.push(total)
      primCums.push(cum)
      allPrims.push(prim)
      total += cum[cum.length - 1]
      start = prim.end
    }
  }
  if (total < 1e-9) return { d: '', caps: [] }

  // Map a cut position s = edgeIdx + t to its global arc distance. Multi-prim
  // edges (quartics) split their parameter range evenly across prims.
  const distAt = (s: number): number => {
    const edge = Math.max(0, Math.min(Math.floor(s), n - 2))
    const frac = Math.min(s - edge, 1)
    if (frac <= 1e-9) return edgeStartDist[edge]
    const first = edgeFirstPrim[edge]
    const count = (edge + 1 < edgeFirstPrim.length ? edgeFirstPrim[edge + 1] : allPrims.length) - first
    const scaled = frac * count
    const k = Math.min(Math.floor(scaled), count - 1)
    const pi = first + k
    const cum = primCums[pi]
    const x = (scaled - k) * SAMPLES
    const k2 = Math.min(Math.floor(x), SAMPLES - 1)
    const arc = cum[k2] + (cum[k2 + 1] - cum[k2]) * (x - k2)
    return primStartDist[pi] + arc
  }

  const closed = samePt(points[0], points[n - 1])
  const intervals: { a: number; b: number; cut: PathCut }[] = []
  for (const c of cuts) {
    if (c.half <= 0) continue
    const d = distAt(c.s)
    const a = d - c.half
    const b = d + c.half
    if (b - a >= total) return { d: '', caps: [] } // strand swallowed whole
    if (closed && a < 0) {
      intervals.push({ a: a + total, b: total, cut: c }, { a: 0, b, cut: c })
    } else if (closed && b > total) {
      intervals.push({ a, b: total, cut: c }, { a: 0, b: b - total, cut: c })
    } else {
      intervals.push({ a: Math.max(0, a), b: Math.min(total, b), cut: c })
    }
  }

  // Merge overlapping gaps, remembering which cut forms each boundary so the
  // caps can be dressed against the right over thread.
  intervals.sort((p, q) => p.a - q.a)
  const merged: { a: number; b: number; aCut: PathCut; bCut: PathCut }[] = []
  for (const iv of intervals) {
    const last = merged[merged.length - 1]
    if (last && iv.a <= last.b + 1e-9) {
      if (iv.b > last.b) {
        last.b = iv.b
        last.bCut = iv.cut
      }
    } else {
      merged.push({ a: iv.a, b: iv.b, aCut: iv.cut, bCut: iv.cut })
    }
  }

  interface Keep { a: number; b: number; startCut: PathCut | null; endCut: PathCut | null }
  const keep: Keep[] = []
  let pos = 0
  let posCut: PathCut | null = null
  for (const g of merged) {
    if (g.a > pos + 1e-6) keep.push({ a: pos, b: g.a, startCut: posCut, endCut: g.aCut })
    pos = Math.max(pos, g.b)
    posCut = g.bCut
  }
  if (pos < total - 1e-6) keep.push({ a: pos, b: total, startCut: posCut, endCut: null })

  // Single pass over the prim chain: clip each prim to the keep intervals it
  // overlaps (parameter composition keeps De Casteljau splits exact), opening
  // a new sub-path whenever a keep interval starts.
  const parts: string[] = []
  const caps: GapCap[] = []
  let ki = 0
  let subpathOpen = false
  for (let pi = 0; pi < allPrims.length && ki < keep.length; pi++) {
    const start = primStartPt[pi]
    const prim = allPrims[pi]
    const cum = primCums[pi]
    const d0 = primStartDist[pi]
    const d1 = d0 + cum[cum.length - 1]
    while (ki < keep.length && keep[ki].a < d1 - 1e-9) {
      const a = Math.max(keep[ki].a, d0)
      const b = Math.min(keep[ki].b, d1)
      if (b - a > 1e-9) {
        let pieceStart = start
        let piecePrim = prim
        const ta = a <= d0 + 1e-9 ? 0 : paramAtDistance(cum, a - d0)
        const tb = b >= d1 - 1e-9 ? 1 : paramAtDistance(cum, b - d0)
        if (ta > 1e-9) {
          const sp = splitPrim(pieceStart, piecePrim, ta)
          pieceStart = sp.split
          piecePrim = sp.right
        }
        if (tb < 1 - 1e-9) {
          const sp = splitPrim(pieceStart, piecePrim, ta > 1e-9 ? (tb - ta) / (1 - ta) : tb)
          piecePrim = sp.left
        }
        if (!subpathOpen) {
          parts.push(`M${pieceStart.x} ${pieceStart.y}`)
          const sc = keep[ki].startCut
          if (sc) caps.push({ point: pieceStart, dir: scale(startTangent(pieceStart, piecePrim), -1), cut: sc })
        }
        parts.push(primCommand(piecePrim))
        subpathOpen = true
        const ec = keep[ki].endCut
        if (ec && b >= keep[ki].b - 1e-9) {
          caps.push({ point: piecePrim.end, dir: endTangent(pieceStart, piecePrim), cut: ec })
        }
      }
      if (keep[ki].b <= d1 + 1e-9) {
        ki++
        subpathOpen = false
      } else {
        break // interval continues into the next prim
      }
    }
  }

  return { d: parts.join(' '), caps }
}

/**
 * Angled-cut cap wedges — the smooth-transition dressing for woven gaps.
 *
 * A gap end rendered with a plain (round/butt) line cap meets the over
 * thread perpendicular to the **under** thread; at shallow crossing angles
 * its two corners sit unevenly — one hugs the over thread, the other drifts
 * far from it. Each wedge is a filled quad extending the stroke end so the
 * visible cut face runs **parallel to the over thread** at a uniform
 * clearance of `width/2 + gap` from its centreline (i.e. `gap` px past its
 * stroke edge) — a mitred cut, consistent at every crossing angle.
 *
 * Requires cuts carrying `point` / `over` / `factor`, and the cut half-length
 * set to `(width + gap) * factor` — that places the stroke end's round cap
 * tangent to (or just behind) the target face, with the wedge filling the
 * remainder. The straight-line crossing frame is used for the face position
 * (same approximation as the cut positions themselves); the wedge's inner
 * edge anchors on the exact post-split stroke end so it always meets the
 * stroke seamlessly, even on curved Strands.
 */
export function weaveCapWedgeD(caps: GapCap[], width: number, gap: number): string {
  const q = width / 2 + gap
  const parts: string[] = []
  for (const cap of caps) {
    const { point: crossing, over, factor } = cap.cut
    if (!crossing || !over || !factor) continue
    const E = cap.point
    const toE = sub(E, crossing)
    const dPE = len(toE)
    if (dPE < 1e-9) continue
    // Face: line through F (on the under centreline, q·factor from the
    // crossing) parallel to the over thread.
    const F = add(crossing, scale(toE, (q * factor) / dPE))
    const t = cap.dir
    const denom = cross(t, over)
    if (Math.abs(denom) < 1e-9) continue // threads parallel — no face to mitre against
    const half = scale(perp(t), width / 2)
    const back = scale(t, -width * 0.25) // overlap the stroke so no hairline seam
    const sMax = width * (factor + 1)
    const project = (corner: Vec2): Vec2 =>
      add(corner, scale(t, clamp(cross(sub(F, corner), over) / denom, 0, sMax)))
    const c1 = add(E, half)
    const c2 = sub(E, half)
    const o1 = project(c1)
    const o2 = project(c2)
    const b1 = add(c1, back)
    const b2 = add(c2, back)
    parts.push(`M${b1.x} ${b1.y} L${b2.x} ${b2.y} L${o2.x} ${o2.y} L${o1.x} ${o1.y} Z`)
  }
  return parts.join(' ')
}
