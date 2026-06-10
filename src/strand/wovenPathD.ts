import { dist, evalCubic, lerp, quarticToCubics, splitCubic, type Vec2 } from '../utils/math'
import type { CurvedStrand } from './computeCurves'

/**
 * Woven path generation — render a Strand with a gap cut around every
 * crossing it passes **under** (Taprats interlace look: the under thread
 * breaks, the over thread runs continuous; whatever sits beneath shows
 * through the gap, so fills and background survive).
 *
 * Edges are decomposed into line / cubic primitives (the same shapes
 * `curvedPathD` emits — quadratics are exactly degree-elevated, quartics use
 * the shared two-cubic approximation) and trimmed by arc length from either
 * end with De Casteljau splits. Cuts sit at Strand points, which is where
 * `buildStrands`' map vertices live; with strong curve offsets the true
 * curved-crossing point can drift off the vertex — a known approximation.
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

interface Chain {
  start: Vec2
  prims: Prim[]
}

/** Remove arc length `d` from the front of the chain. Returns null if consumed. */
function dropFront(chain: Chain, d: number): Chain | null {
  let { start } = chain
  const prims = [...chain.prims]
  while (prims.length > 0) {
    const cum = primCumLengths(start, prims[0])
    const total = cum[cum.length - 1]
    if (d < total - 1e-9) {
      const t = paramAtDistance(cum, d)
      if (t > 1e-9) {
        const { split, right } = splitPrim(start, prims[0], t)
        prims[0] = right
        start = split
      }
      return { start, prims }
    }
    d -= total
    start = prims[0].end
    prims.shift()
  }
  return null
}

/** Remove arc length `d` from the back of the chain. Returns null if consumed. */
function dropBack(chain: Chain, d: number): Chain | null {
  const prims = [...chain.prims]
  // Start point of each prim, needed to walk backwards.
  const starts: Vec2[] = [chain.start]
  for (let i = 0; i + 1 < prims.length; i++) starts.push(prims[i].end)
  for (let i = prims.length - 1; i >= 0; i--) {
    const cum = primCumLengths(starts[i], prims[i])
    const total = cum[cum.length - 1]
    if (d < total - 1e-9) {
      const t = paramAtDistance(cum, total - d)
      if (t < 1 - 1e-9) {
        const { left } = splitPrim(starts[i], prims[i], t)
        prims[i] = left
      }
      return { start: chain.start, prims: prims.slice(0, i + 1) }
    }
    d -= total
    prims.pop()
  }
  return null
}

function primCommand(prim: Prim): string {
  return prim.kind === 'L'
    ? `L${prim.end.x} ${prim.end.y}`
    : `C${prim.cp1.x} ${prim.cp1.y} ${prim.cp2.x} ${prim.cp2.y} ${prim.end.x} ${prim.end.y}`
}

/**
 * Generate an SVG path `d` for a Strand with under-crossing gaps.
 *
 * `cutHalfAt(pointIdx)` returns the half-gap arc length to trim on each side
 * of that Strand point, or 0 for no cut. For closed Strands the wrap point
 * is queried as pointIdx 0 (never the duplicate last index). Edges fully
 * swallowed by their cuts are skipped; each gap starts a new sub-path.
 */
export function wovenPathD(strand: CurvedStrand, cutHalfAt: (pointIdx: number) => number): string {
  const { points, curves } = strand
  const n = points.length
  if (n < 2) return ''

  const parts: string[] = []
  let pen: Vec2 | null = null

  for (let i = 0; i < n - 1; i++) {
    const trimStart = cutHalfAt(i)
    // The duplicate closing point of a closed Strand maps back to index 0;
    // open-Strand endpoints never carry cuts (computeWeave skips them).
    const trimEnd = cutHalfAt(i + 1 === n - 1 ? 0 : i + 1)

    let chain: Chain | null = { start: points[i], prims: edgePrims(points[i], points[i + 1], curves[i]) }
    if (trimStart > 0) chain = dropFront(chain, trimStart)
    if (chain && trimEnd > 0) chain = dropBack(chain, trimEnd)
    if (!chain || chain.prims.length === 0) {
      pen = null
      continue
    }

    if (!pen || !samePt(pen, chain.start)) {
      parts.push(`M${chain.start.x} ${chain.start.y}`)
    }
    for (const prim of chain.prims) parts.push(primCommand(prim))
    pen = chain.prims[chain.prims.length - 1].end
  }

  return parts.join(' ')
}
