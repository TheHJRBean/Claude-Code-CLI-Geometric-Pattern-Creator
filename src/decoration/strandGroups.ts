import type { Vec2 } from '../utils/math'
import type { Segment } from '../types/geometry'
import type { LatticeStamp } from '../editor/lattice'
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

// ─────────────────────────────────────────────────────────────────────────
// Base-fragment strand identity for lattice-stamped fields
// ─────────────────────────────────────────────────────────────────────────
//
// Chaining a stamped field merges strands ACROSS stamps, and a Frame filter
// truncates chains at the frame — so chain-shape signatures over the rendered
// field are field- and frame-dependent: painting an interior congruent class
// misses near-frame strands, and any frame edit orphans painted records
// ("strand strokes drop out at the Frame"). The periodic fast-path never has
// this problem because it strokes the BASE fragment's chains and `<use>`-
// clones them. These helpers give the stamped path the same identity: each
// rendered segment is mapped back to its base-fragment segment via its stamp
// (the `@<stampIndex>` suffix on the stamped polygon id), and a rendered
// strand takes the majority congruent signature of the base chains its
// segments came from.

/** Per-base-polygon list of segment midpoints with their chain signature. */
export type BaseSegmentSignatureMap = Map<string, { mid: Vec2; sig: string }[]>

/** Index the base fragment's PIC segments by polygon id → midpoint → the
 * containing base chain's congruent signature. */
export function baseSegmentSignatureMap(baseSegments: Segment[]): BaseSegmentSignatureMap {
  const ids = strandIdentities(baseSegments)
  const map: BaseSegmentSignatureMap = new Map()
  for (let i = 0; i < baseSegments.length; i++) {
    const strandIdx = ids.strandOfSegment[i]
    if (strandIdx < 0) continue
    const s = baseSegments[i]
    let list = map.get(s.polygonId)
    if (!list) { list = []; map.set(s.polygonId, list) }
    list.push({
      mid: { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 },
      sig: ids.strands[strandIdx].signature,
    })
  }
  return map
}

/** Match tolerance (world units) between a de-stamped rendered segment
 * midpoint and its base twin. PIC re-runs per stamp, so coordinates agree
 * only up to float noise — well under this. */
const BASE_MATCH_TOL = 1e-3

/** Split a stamped polygon id `<baseId>@<stampIndex>` — null for world-space
 * one-offs (frame completions, Guide Tiles) whose ids carry no stamp. */
function parseStampedId(id: string, stampCount: number): { baseId: string; stamp: number } | null {
  const at = id.lastIndexOf('@')
  if (at < 0) return null
  const idx = Number(id.slice(at + 1))
  if (!Number.isInteger(idx) || idx < 0 || idx >= stampCount) return null
  return { baseId: id.slice(0, at), stamp: idx }
}

/**
 * Per rendered segment: the congruent signature of the base chain its
 * de-stamped twin belongs to, or null when the segment doesn't map to the
 * base fragment (world-space completion/Guide Tile segments — no stamp).
 */
export function segmentBaseSignatures(
  segments: Segment[],
  baseMap: BaseSegmentSignatureMap,
  stamps: LatticeStamp[],
): (string | null)[] {
  return segments.map(s => {
    const parsed = parseStampedId(s.polygonId, stamps.length)
    if (!parsed) return null
    const list = baseMap.get(parsed.baseId)
    if (!list) return null
    const st = stamps[parsed.stamp]
    const mx = (s.from.x + s.to.x) / 2 - st.translation.x
    const my = (s.from.y + s.to.y) / 2 - st.translation.y
    // Undo the stamp rotation (triangle cells have a rotation-π orientation).
    let bx = mx, by = my
    if (st.rotation !== 0) {
      const cos = Math.cos(-st.rotation)
      const sin = Math.sin(-st.rotation)
      bx = mx * cos - my * sin
      by = mx * sin + my * cos
    }
    for (const e of list) {
      if (Math.abs(e.mid.x - bx) < BASE_MATCH_TOL && Math.abs(e.mid.y - by) < BASE_MATCH_TOL) return e.sig
    }
    return null
  })
}

/**
 * Per rendered strand: the majority base-chain signature of its segments,
 * or null when none of its segments map to the base fragment (world-space
 * completion/Guide Tile chains — those keep their own chain identity).
 * Deterministic tie-break: lexicographically smallest signature.
 *
 * NB the majority is only a per-STRAND summary — a rendered chain can span
 * multiple base classes (base chains truncate at the base-fragment edge, so
 * a field-crossing chain mixes them), and frame-truncated border chains have
 * a different mix than interior ones. Congruent paint therefore resolves per
 * SEGMENT via `segmentBaseSignatures`; the majority survives as the fallback
 * for whole-chain keys (patch / cell scope).
 */
export function renderedStrandBaseSignatures(
  strandData: StrandData[],
  segments: Segment[],
  baseMap: BaseSegmentSignatureMap,
  stamps: LatticeStamp[],
  precomputedSegSigs?: (string | null)[],
): (string | null)[] {
  const segSigs = precomputedSegSigs ?? segmentBaseSignatures(segments, baseMap, stamps)
  return strandData.map(sd => {
    const votes = new Map<string, number>()
    for (const i of sd.segmentIndices) {
      const sig = segSigs[i]
      if (sig) votes.set(sig, (votes.get(sig) ?? 0) + 1)
    }
    let best: string | null = null
    let bestN = 0
    for (const [sig, n] of votes) {
      if (n > bestN || (n === bestN && best !== null && sig < best)) { best = sig; bestN = n }
    }
    return best
  })
}

export interface StrandIdentitiesWithSegments extends StrandIdentities {
  /**
   * Per-SEGMENT effective congruent signature: the segment's own base-chain
   * class where it maps to the base fragment, else its owning chain's final
   * signature (majority / rendered fallback). Congruent paint keys + stroke
   * resolution must use THIS, not the per-chain signature — a rendered chain
   * spans multiple base classes in multi-class fields (vertex lines / extra
   * line sets), and frame-truncated border chains have a different class mix
   * than interior ones, so per-chain majorities are frame-dependent.
   * `''` for segments not on any chain.
   */
  segmentSignatures: string[]
}

/**
 * `strandIdentities` over a lattice-stamped rendered field, with each
 * strand's SIGNATURE taken from the base fragment's chains (majority over
 * the strand's segments) and each SEGMENT carrying its own base class.
 * Centroid / closed / chains stay those of the rendered field — only the
 * congruent identity is field-independent.
 */
export function strandIdentitiesFromBase(
  segments: Segment[],
  baseSegments: Segment[],
  stamps: LatticeStamp[],
): StrandIdentitiesWithSegments {
  const ids = strandIdentities(segments)
  const baseMap = baseSegmentSignatureMap(baseSegments)
  const segSigs = segmentBaseSignatures(segments, baseMap, stamps)
  const baseSigs = renderedStrandBaseSignatures(ids.strandData, segments, baseMap, stamps, segSigs)
  const strands = ids.strands.map((s, i) => (baseSigs[i] ? { ...s, signature: baseSigs[i]! } : s))
  const segmentSignatures = segments.map((_, i) => {
    const si = ids.strandOfSegment[i]
    if (si < 0) return ''
    return segSigs[i] ?? strands[si].signature
  })
  return { ...ids, strands, segmentSignatures }
}
