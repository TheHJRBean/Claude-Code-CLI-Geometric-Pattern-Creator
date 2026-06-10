import type { Vec2 } from '../utils/math'
import type { Segment } from '../types/geometry'
import { cross, dist, dot, sub } from '../utils/math'
import { buildStrands, type StrandData } from '../strand/buildStrands'
import { hash8, minRotation } from './voids'

/**
 * Step 19 Stage 2 — per-**Strand** identity for the Grouping-scope ladder
 * (ADR-0005). Mirrors the Void side: each Strand (the chained polyline from
 * `buildStrands`) gets
 *
 * - a congruent `signature` — equal iff two Strands have the same shape+size
 *   up to rotation / translation / reflection (and, for closed loops, choice
 *   of start vertex);
 * - a `centroid` — vertex average, used to derive `patch`-orbit and
 *   `instance` keys via `scopes.ts`.
 *
 * Signatures are built from the *straight* Ray chains (curves are a
 * render-time overlay of the same chains, so congruent chains stay congruent
 * curved).
 */

export interface StrandIdentity {
  /** Congruent signature (8 hex chars). */
  signature: string
  /** Vertex-average centroid (world units). */
  centroid: Vec2
  /** True when the chain closes into a loop. */
  closed: boolean
}

export interface StrandIdentities {
  /** One entry per strand, aligned with `strandData`. */
  strands: StrandIdentity[]
  /** strandOfSegment[i] = strand index owning input segment i (−1 if unused). */
  strandOfSegment: number[]
  /** The underlying chains, aligned with `strands`. */
  strandData: StrandData[]
}

// Same quantisation defaults as the Void signature (voids.ts DEFAULTS).
const LENGTH_SNAP = 0.5
const ANGLE_SNAP = (0.5 * Math.PI) / 180
const CLOSE_TOL = 1e-3

/**
 * Identity of one strand polyline. Closed loops use the same canonical token
 * ring as Voids (rotation + reversal free); open chains canonicalise over
 * reversal only (the two traversal directions), keeping the endpoints fixed
 * as sequence ends.
 */
export function strandIdentity(points: Vec2[]): StrandIdentity {
  const n = points.length
  const closed = n > 2 && dist(points[0], points[n - 1]) < CLOSE_TOL
  // Closed chains repeat the first point at the end — drop the duplicate so
  // the ring tokens don't include a zero-length edge.
  let ring = closed ? points.slice(0, n - 1) : points

  let sx = 0, sy = 0
  for (const p of ring) { sx += p.x; sy += p.y }
  const centroid = { x: sx / ring.length, y: sy / ring.length }

  const m = ring.length
  if (closed) {
    // Normalise winding to CCW (mirrors voidSignature) so signed turns are
    // winding-consistent — a reflected loop flips winding, the normalisation
    // undoes it, and minRotation absorbs the start-vertex choice.
    if (ringSignedArea(ring) < 0) ring = ring.slice().reverse()
    const tokens: string[] = []
    for (let i = 0; i < m; i++) {
      const prev = ring[(i - 1 + m) % m]
      const cur = ring[i]
      const next = ring[(i + 1) % m]
      tokens.push(`a${quantTurn(prev, cur, next)}`)
      tokens.push(`e${Math.round(dist(cur, next) / LENGTH_SNAP)}`)
    }
    return { signature: hash8(`c|${minRotation(tokens)}`), centroid, closed }
  }
  // Open chain: edge lengths interleaved with signed interior turns,
  // canonicalised over the chain's symmetries — reversal reverses the
  // sequence AND negates turns; reflection negates turns in place. Take the
  // lexicographic min over all four variants.
  const edges: number[] = []
  const turns: number[] = []
  for (let i = 0; i < m - 1; i++) {
    if (i > 0) turns.push(quantTurn(ring[i - 1], ring[i], ring[i + 1]))
    edges.push(Math.round(dist(ring[i], ring[i + 1]) / LENGTH_SNAP))
  }
  const seq = (es: number[], ts: number[]): string => {
    const out: string[] = []
    for (let i = 0; i < es.length; i++) {
      out.push(`e${es[i]}`)
      if (i < ts.length) out.push(`a${ts[i]}`)
    }
    return out.join(';')
  }
  const eRev = edges.slice().reverse()
  const tNeg = turns.map(t => -t)
  const tRev = turns.slice().reverse()
  const tRevNeg = tRev.map(t => -t)
  const variants = [
    seq(edges, turns),    // identity
    seq(eRev, tRevNeg),   // reversal
    seq(edges, tNeg),     // reflection
    seq(eRev, tRev),      // reflection + reversal
  ]
  variants.sort()
  return { signature: hash8(`o|${variants[0]}`), centroid, closed }
}

function ringSignedArea(ring: Vec2[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length
    a += ring[i].x * ring[j].y - ring[j].x * ring[i].y
  }
  return a / 2
}

/** Signed turn angle at `cur`, quantised. */
function quantTurn(prev: Vec2, cur: Vec2, next: Vec2): number {
  const inDir = sub(cur, prev)
  const outDir = sub(next, cur)
  return Math.round(Math.atan2(cross(inDir, outDir), dot(inDir, outDir)) / ANGLE_SNAP)
}

/** Chain `segments` into strands and compute each strand's identity. */
export function strandIdentities(segments: Segment[]): StrandIdentities {
  const strandData = buildStrands(segments)
  const strands: StrandIdentity[] = []
  const strandOfSegment = new Array<number>(segments.length).fill(-1)
  for (let s = 0; s < strandData.length; s++) {
    strands.push(strandIdentity(strandData[s].points))
    for (const i of strandData[s].segmentIndices) strandOfSegment[i] = s
  }
  return { strands, strandOfSegment, strandData }
}
