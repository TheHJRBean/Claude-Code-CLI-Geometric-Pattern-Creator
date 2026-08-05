import { cross, dist, lerp, normalize, sub, type Vec2 } from '../utils/math'
import type { StrandData } from './buildStrands'

/**
 * Where threads meet — the shared crossing enumeration behind **weaving**
 * (`weave.ts`) and **junction ornaments** (`decoration/junctionOrnaments.ts`).
 *
 * Both features need exactly the same question answered: at which world points
 * does more than one thread pass, and in what directions? Taprats answers it
 * over a full planar arrangement, where every meeting is a map vertex; this
 * pipeline emits per-polygon `Segment[]` chained into Strands, so the same set
 * comes from two sources:
 *
 *   a. **shared chain points** — degree-4 vertices where ray pairs from
 *      neighbouring polygons meet (e.g. tiling-edge contact points), i.e.
 *      points two Strands both pass through;
 *   b. **transversal mid-edge intersections** — Strand edges crossing away
 *      from any chain point. Vertex-line Strands cross edge-line Strands this
 *      way (PIC never splits segments at those crossings), so without this
 *      source both features are blind to vertex strands.
 *
 * A thread *tip* touching another thread (a T-junction — e.g. an orphan vertex
 * ray terminating on a star arm) is deliberately not a crossing: Taprats' odd-
 * vertex rule, which is why an open Strand's endpoints never produce a visit.
 * Ornaments inherit that rule, so a dot never lands on a dead end.
 *
 * This module owns the enumeration and nothing else — the weave's over/under
 * 2-colouring stays in `weave.ts`, and ornament identity stays in
 * `decoration/junctionOrnaments.ts`.
 */

/** One thread's pass through a crossing point. */
export interface StrandVisit {
  /** Index into the `strands` array the visit belongs to. */
  strand: number
  /**
   * Position along the Strand: edgeIndex + t (t ∈ [0,1) along that edge).
   * Integer values are chain points; 0 doubles as the wrap point of a
   * closed Strand.
   */
  s: number
  /** Unit direction of the thread at the crossing (straight-line geometry). */
  dir: Vec2
  /**
   * The two directions the drawn line work actually leaves this point in —
   * the thread's arms, pointing away from the crossing.
   *
   * `dir` is the *chord* through the crossing, which is what the weave wants
   * (it asks how transversal two threads are). The arms are what anything
   * drawn ON the line work needs: a thread only runs straight through when
   * the pattern is symmetric there, and where it bends — Cairo pentagonal
   * kinks 15° at its contact points — `±dir` misses both arms by half the
   * bend. They coincide with `±dir` exactly when the thread is straight.
   */
  arms: [Vec2, Vec2]
}

/** A world point with every thread pass through it, in insertion order. */
export interface StrandCrossing {
  point: Vec2
  visits: StrandVisit[]
}

export interface VisitField {
  /** Every visit, grouped by world point. Groups of one are kept — the weave
   *  filters them out, ornaments never see them (`strandJunctions`). */
  crossings: StrandCrossing[]
  /** Per strand: its visits, in insertion order (weave sorts them by `s`). */
  byStrand: StrandVisit[][]
  /** Which crossing each visit belongs to, aligned with `byStrand`. */
  crossingOfVisit: Map<StrandVisit, StrandCrossing>
  /** Whether each Strand's chain closes into a loop. */
  closedFlags: boolean[]
}

/** Same vertex quantisation as buildStrands so visits land in its vertices. */
function ptKey(p: Vec2): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)}`
}

function samePt(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
}

/** World-distance tolerance for "this intersection IS a chain point". */
const ENDPOINT_TOL = 1e-4

/**
 * Enumerate every thread pass at every meeting point of the Strand field.
 *
 * Visits are unique per (strand, world point, position): one crossing seen
 * from both sources (or from two adjacent edges of a bent thread) stays one
 * visit, while a self-crossing thread keeps its two distinct passes.
 */
export function collectStrandVisits(strands: readonly StrandData[]): VisitField {
  const closedFlags = strands.map(sd => {
    const pts = sd.points
    return pts.length > 3 && samePt(pts[0], pts[pts.length - 1])
  })

  const byPoint = new Map<string, StrandCrossing>()
  const seen = new Set<string>()
  const byStrand: StrandVisit[][] = strands.map(() => [])
  const crossingOfVisit = new Map<StrandVisit, StrandCrossing>()

  /** The thread's two outgoing directions at chain point `idx` of strand `s`.
   *  A closed Strand's wrap point joins its last edge to its first. */
  const armsAtChainPoint = (s: number, idx: number): [Vec2, Vec2] => {
    const pts = strands[s].points
    const n = pts.length
    const back = idx === 0 ? pts[n - 2] : pts[idx - 1]
    const fwd = idx === 0 ? pts[1] : pts[idx + 1]
    return [normalize(sub(back, pts[idx])), normalize(sub(fwd, pts[idx]))]
  }

  const addVisit = (
    strand: number, s: number, dir: Vec2, worldKey: string, point: Vec2, arms: [Vec2, Vec2],
  ) => {
    const vk = `${strand}|${worldKey}|${s.toFixed(6)}`
    if (seen.has(vk)) return
    seen.add(vk)
    const v: StrandVisit = { strand, s, dir, arms }
    byStrand[strand].push(v)
    let c = byPoint.get(worldKey)
    if (!c) byPoint.set(worldKey, (c = { point, visits: [] }))
    c.visits.push(v)
    crossingOfVisit.set(v, c)
  }

  // ── source a: pass-through visits at chain points ──────────────────────
  // Interior points, plus the wrap point of closed Strands. Endpoints of
  // open Strands never weave (tip touches are T-junctions).
  for (let s = 0; s < strands.length; s++) {
    const pts = strands[s].points
    const n = pts.length
    if (closedFlags[s]) {
      addVisit(s, 0, normalize(sub(pts[1], pts[n - 2])), ptKey(pts[0]), pts[0], armsAtChainPoint(s, 0))
    }
    for (let i = 1; i < n - 1; i++) {
      addVisit(s, i, normalize(sub(pts[i + 1], pts[i - 1])), ptKey(pts[i]), pts[i], armsAtChainPoint(s, i))
    }
  }

  // ── source b: transversal mid-edge intersections ────────────────────────
  interface EdgeRef { strand: number; edge: number; a: Vec2; b: Vec2; ka: string; kb: string }
  const edges: EdgeRef[] = []
  for (let s = 0; s < strands.length; s++) {
    const pts = strands[s].points
    for (let i = 0; i + 1 < pts.length; i++) {
      edges.push({ strand: s, edge: i, a: pts[i], b: pts[i + 1], ka: ptKey(pts[i]), kb: ptKey(pts[i + 1]) })
    }
  }

  /**
   * Where along its Strand does parameter `t` on this edge sit? Snaps to the
   * chain point when within ENDPOINT_TOL (sharing source a's visit), null
   * for an open-Strand terminus (T-junction — no interlace).
   */
  const classify = (
    e: EdgeRef, t: number,
  ): { s: number; dir: Vec2; point: Vec2 | null; arms: [Vec2, Vec2] } | null => {
    const elen = dist(e.a, e.b)
    const fromStart = t * elen
    const fromEnd = (1 - t) * elen
    if (fromStart > ENDPOINT_TOL && fromEnd > ENDPOINT_TOL) {
      // Mid-edge: the thread runs straight through, so its arms are the
      // edge's two directions.
      const d = normalize(sub(e.b, e.a))
      return { s: e.edge + t, dir: d, point: null, arms: [{ x: -d.x, y: -d.y }, d] as [Vec2, Vec2] }
    }
    let idx = fromStart <= ENDPOINT_TOL ? e.edge : e.edge + 1
    const pts = strands[e.strand].points
    const n = pts.length
    if (idx === 0 || idx === n - 1) {
      if (!closedFlags[e.strand]) return null
      idx = 0
      return {
        s: 0, dir: normalize(sub(pts[1], pts[n - 2])), point: pts[0], arms: armsAtChainPoint(e.strand, 0),
      }
    }
    return {
      s: idx,
      dir: normalize(sub(pts[idx + 1], pts[idx - 1])),
      point: pts[idx],
      arms: armsAtChainPoint(e.strand, idx),
    }
  }

  // Spatial-grid broad phase keeps the edge-pair sweep near-linear.
  let avgLen = 0
  for (const e of edges) avgLen += dist(e.a, e.b)
  const cell = edges.length > 0 ? Math.max(avgLen / edges.length, 1e-9) : 1
  const grid = new Map<number, number[]>()
  const GRID_OFF = 1 << 20 // grid coords offset positive for numeric packing
  for (let id = 0; id < edges.length; id++) {
    const e = edges[id]
    const x0 = Math.floor(Math.min(e.a.x, e.b.x) / cell)
    const x1 = Math.floor(Math.max(e.a.x, e.b.x) / cell)
    const y0 = Math.floor(Math.min(e.a.y, e.b.y) / cell)
    const y1 = Math.floor(Math.max(e.a.y, e.b.y) / cell)
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const k = (gx + GRID_OFF) * (GRID_OFF * 2) + (gy + GRID_OFF)
        let arr = grid.get(k)
        if (!arr) grid.set(k, (arr = []))
        arr.push(id)
      }
    }
  }

  const handlePair = (ea: EdgeRef, eb: EdgeRef) => {
    if (ea.strand === eb.strand) {
      // Adjacent edges of one Strand meet at their join, not at a crossing.
      const gap = Math.abs(ea.edge - eb.edge)
      const lastEdge = strands[ea.strand].points.length - 2
      if (gap <= 1) return
      if (closedFlags[ea.strand] && gap === lastEdge) return
    }
    // Edges meeting at a shared vertex are source a's territory.
    if (ea.ka === eb.ka || ea.ka === eb.kb || ea.kb === eb.ka || ea.kb === eb.kb) return

    const r = sub(ea.b, ea.a)
    const q = sub(eb.b, eb.a)
    const denom = cross(r, q)
    if (Math.abs(denom) < 1e-12) return // parallel/collinear — no transversal crossing
    const w = sub(eb.a, ea.a)
    const t = cross(w, q) / denom
    const u = cross(w, r) / denom
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return

    const pa = classify(ea, t)
    const pb = classify(eb, u)
    if (!pa || !pb) return // a thread terminus touching — no interlace
    if (pa.point && pb.point) return // both at chain points ⇒ source a covers it
    const worldPt = pa.point ?? pb.point ?? lerp(ea.a, ea.b, t)
    const key = ptKey(worldPt)
    addVisit(ea.strand, pa.s, pa.dir, key, worldPt, pa.arms)
    addVisit(eb.strand, pb.s, pb.dir, key, worldPt, pb.arms)
  }

  const tested = new Set<number>()
  for (const bucket of grid.values()) {
    for (let x = 0; x < bucket.length; x++) {
      for (let y = x + 1; y < bucket.length; y++) {
        const i1 = Math.min(bucket[x], bucket[y])
        const i2 = Math.max(bucket[x], bucket[y])
        const pk = i1 * edges.length + i2
        if (tested.has(pk)) continue
        tested.add(pk)
        handlePair(edges[i1], edges[i2])
      }
    }
  }

  return { crossings: [...byPoint.values()], byStrand, crossingOfVisit, closedFlags }
}

/** A place where two or more threads meet — one ornament's anchor. */
export interface StrandJunction {
  /** World point. */
  point: Vec2
  /** Unit direction of each thread pass, in enumeration order. */
  dirs: Vec2[]
  /**
   * Every arm leaving the junction — two per thread pass, in enumeration
   * order, pointing away from the point.
   *
   * This, not `dirs`, is what the line work does here. They differ wherever a
   * thread bends through the crossing, which is the general case: only a
   * junction whose incident geometry is symmetric runs straight through. An
   * ornament built FROM the line work (`flarePathD`) must use the arms, or
   * its fillets sit at half the bend angle off the strands they claim to be
   * rounding.
   */
  arms: Vec2[]
  /** Which chains pass through, aligned with `dirs` (indices into the input
   *  `strands`). Lets a caller ask what the threads meeting here look like —
   *  e.g. an ornament matching their colour. A self-crossing thread appears
   *  twice, which is the truth about that junction. */
  strands: number[]
  /** How many thread passes meet here (2 = an ordinary crossing). */
  degree: number
  /**
   * Congruent class: equal iff two junctions have the same number of threads
   * meeting at the same angles, up to rotation and reflection. Ornaments bind
   * to this at the **Matching** reach, exactly as a Void fill binds to a
   * shape signature.
   */
  signature: string
}

/** Angle quantisation (radians) for the junction signature. Matches the Void /
 *  Strand signature convention (0.5°) so one class doesn't split on float
 *  noise between two extraction runs of the same field. */
const ANGLE_SNAP = (0.5 * Math.PI) / 180

/** The gaps between the arms, walking once round the junction. */
function armGapRing(arms: readonly Vec2[]): number[] {
  const angles = arms.map(d => {
    const a = Math.atan2(d.y, d.x)
    return a < 0 ? a + 2 * Math.PI : a
  }).sort((a, b) => a - b)
  const n = angles.length
  const gaps: number[] = []
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? angles[i + 1] : angles[0] + 2 * Math.PI
    gaps.push(Math.round((next - angles[i]) / ANGLE_SNAP))
  }
  return gaps
}

/**
 * Congruent signature of one junction: the ring of gaps between its incident
 * **arms**, canonicalised over rotation (which arm starts) and reflection
 * (which way round).
 *
 * Arms rather than through-lines is the whole content of the key. Folding a
 * pass onto one undirected line assumes it runs straight through, which
 * throws away exactly the asymmetry that distinguishes two junctions on a
 * bent field — on Cairo pentagonal it reported a 15° kink as a 1° wobble and
 * put visibly different crossings in one class.
 *
 * The ring is then halved **when it repeats every half turn** — which is
 * exactly what a junction whose threads all run straight through does, its
 * arms coming in antiparallel pairs. That reduction reproduces the old
 * line-fold string byte for byte, so every signature on a straight field is
 * unchanged and a `Matching` record saved against one still resolves. A bent
 * junction has no half-turn period and keeps its full ring.
 *
 * Only the half turn, never the minimal period: a right-angle crossing's ring
 * is `[90,90,90,90]`, and collapsing that to `[90]` would key it as something
 * the old code never emitted.
 */
export function junctionSignature(arms: Vec2[]): string {
  const full = armGapRing(arms)
  const n = full.length
  const half = n / 2
  let gaps = full
  if (Number.isInteger(half) && half > 0) {
    let periodic = true
    for (let i = 0; i < half && periodic; i++) periodic = full[i] === full[i + half]
    if (periodic) gaps = full.slice(0, half)
  }
  // Canonical over rotation + reflection: the lexicographically smallest of
  // every rotation of the gap ring and of its reversal.
  const m = gaps.length
  const variants: string[] = []
  const rings = [gaps, gaps.slice().reverse()]
  for (const ring of rings) {
    for (let r = 0; r < m; r++) {
      variants.push(ring.slice(r).concat(ring.slice(0, r)).join(','))
    }
  }
  variants.sort()
  // Prefix is the thread count: every pass contributes exactly two arms.
  return `j${arms.length / 2}:${variants[0]}`
}

/**
 * Every junction of a Strand field: the crossings with two or more thread
 * passes, each carrying its incident directions and congruent signature.
 *
 * Ordering is the enumeration order of `collectStrandVisits`, which is a pure
 * function of the input chains — so the same field always yields the same
 * sequence, and a junction's identity never depends on the viewport.
 */
export function strandJunctions(strands: readonly StrandData[]): StrandJunction[] {
  const field = collectStrandVisits(strands)
  const out: StrandJunction[] = []
  for (const c of field.crossings) {
    if (c.visits.length < 2) continue
    const dirs = c.visits.map(v => v.dir)
    const arms = c.visits.flatMap(v => v.arms)
    out.push({
      point: c.point,
      dirs,
      arms,
      strands: c.visits.map(v => v.strand),
      degree: c.visits.length,
      signature: junctionSignature(arms),
    })
  }
  return out
}

/**
 * The angle (radians) an ornament aligned to the junction's threads takes.
 *
 * A star has an "up" direction, and the only orientation that means anything
 * at a crossing is one derived from the threads themselves — so it aims down
 * the middle of the widest wedge between two adjacent **arms**, which is
 * stable under the enumeration order (computed from the sorted arm angles,
 * not from which thread happened to be visited first).
 *
 * Arms, not lines, for the same reason the signature uses them: where a
 * thread bends, its two arms open different wedges, and the widest one is
 * what the eye reads as the gap. On a straight junction the arms come in
 * antiparallel pairs and this returns the same angle the line version did.
 */
export function junctionAngle(arms: Vec2[]): number {
  if (arms.length === 0) return 0
  const angles = arms.map(d => {
    const a = Math.atan2(d.y, d.x)
    return a < 0 ? a + 2 * Math.PI : a
  }).sort((a, b) => a - b)
  const n = angles.length
  let best = 0
  let bestGap = -1
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? angles[i + 1] : angles[0] + 2 * Math.PI
    const gap = next - angles[i]
    if (gap > bestGap + 1e-9) {
      bestGap = gap
      best = angles[i] + gap / 2
    }
  }
  return best
}
