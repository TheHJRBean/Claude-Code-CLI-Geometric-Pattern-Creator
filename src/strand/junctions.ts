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
export function collectStrandVisits(strands: StrandData[]): VisitField {
  const closedFlags = strands.map(sd => {
    const pts = sd.points
    return pts.length > 3 && samePt(pts[0], pts[pts.length - 1])
  })

  const byPoint = new Map<string, StrandCrossing>()
  const seen = new Set<string>()
  const byStrand: StrandVisit[][] = strands.map(() => [])
  const crossingOfVisit = new Map<StrandVisit, StrandCrossing>()

  const addVisit = (strand: number, s: number, dir: Vec2, worldKey: string, point: Vec2) => {
    const vk = `${strand}|${worldKey}|${s.toFixed(6)}`
    if (seen.has(vk)) return
    seen.add(vk)
    const v: StrandVisit = { strand, s, dir }
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
    if (closedFlags[s]) addVisit(s, 0, normalize(sub(pts[1], pts[n - 2])), ptKey(pts[0]), pts[0])
    for (let i = 1; i < n - 1; i++) {
      addVisit(s, i, normalize(sub(pts[i + 1], pts[i - 1])), ptKey(pts[i]), pts[i])
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
  const classify = (e: EdgeRef, t: number): { s: number; dir: Vec2; point: Vec2 | null } | null => {
    const elen = dist(e.a, e.b)
    const fromStart = t * elen
    const fromEnd = (1 - t) * elen
    if (fromStart > ENDPOINT_TOL && fromEnd > ENDPOINT_TOL) {
      return { s: e.edge + t, dir: normalize(sub(e.b, e.a)), point: null }
    }
    let idx = fromStart <= ENDPOINT_TOL ? e.edge : e.edge + 1
    const pts = strands[e.strand].points
    const n = pts.length
    if (idx === 0 || idx === n - 1) {
      if (!closedFlags[e.strand]) return null
      idx = 0
      return { s: 0, dir: normalize(sub(pts[1], pts[n - 2])), point: pts[0] }
    }
    return { s: idx, dir: normalize(sub(pts[idx + 1], pts[idx - 1])), point: pts[idx] }
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
    addVisit(ea.strand, pa.s, pa.dir, key, worldPt)
    addVisit(eb.strand, pb.s, pb.dir, key, worldPt)
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

/**
 * Congruent signature of one junction: the multiset of gaps between the
 * incident thread *lines* (undirected — a thread passing through arrives and
 * leaves, so its two rays are one line), canonicalised over rotation (which
 * start gap) and reflection (traversal direction).
 *
 * Undirected is what makes the class useful: an ordinary 2-thread crossing at
 * right angles is one class wherever it appears in the field, whatever the
 * pattern's orientation there.
 */
export function junctionSignature(dirs: Vec2[]): string {
  // Fold each direction onto [0, π): a line, not a ray.
  const angles = dirs
    .map(d => {
      let a = Math.atan2(d.y, d.x)
      if (a < 0) a += Math.PI
      if (a >= Math.PI - 1e-9) a = 0
      return a
    })
    .sort((a, b) => a - b)
  const n = angles.length
  const gaps: number[] = []
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? angles[i + 1] : angles[0] + Math.PI
    gaps.push(Math.round((next - angles[i]) / ANGLE_SNAP))
  }
  // Canonical over rotation + reflection: the lexicographically smallest of
  // every rotation of the gap ring and of its reversal.
  const variants: string[] = []
  const rings = [gaps, gaps.slice().reverse()]
  for (const ring of rings) {
    for (let r = 0; r < n; r++) {
      variants.push(ring.slice(r).concat(ring.slice(0, r)).join(','))
    }
  }
  variants.sort()
  return `j${n}:${variants[0]}`
}

/**
 * Every junction of a Strand field: the crossings with two or more thread
 * passes, each carrying its incident directions and congruent signature.
 *
 * Ordering is the enumeration order of `collectStrandVisits`, which is a pure
 * function of the input chains — so the same field always yields the same
 * sequence, and a junction's identity never depends on the viewport.
 */
export function strandJunctions(strands: StrandData[]): StrandJunction[] {
  const field = collectStrandVisits(strands)
  const out: StrandJunction[] = []
  for (const c of field.crossings) {
    if (c.visits.length < 2) continue
    const dirs = c.visits.map(v => v.dir)
    out.push({ point: c.point, dirs, degree: c.visits.length, signature: junctionSignature(dirs) })
  }
  return out
}

/**
 * The angle (radians) an ornament aligned to the junction's threads takes.
 *
 * A star or twinkle has a "up" direction, and the only orientation that means
 * anything at a crossing is one derived from the threads themselves — so the
 * bisector of the two most-separated incident lines is used, which is stable
 * under the enumeration order (it is computed from the sorted line angles, not
 * from which thread happened to be visited first) and under reflection.
 */
export function junctionAngle(dirs: Vec2[]): number {
  if (dirs.length === 0) return 0
  const angles = dirs
    .map(d => {
      let a = Math.atan2(d.y, d.x)
      if (a < 0) a += Math.PI
      if (a >= Math.PI - 1e-9) a = 0
      return a
    })
    .sort((a, b) => a - b)
  const n = angles.length
  let best = 0
  let bestGap = -1
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? angles[i + 1] : angles[0] + Math.PI
    const gap = next - angles[i]
    if (gap > bestGap + 1e-9) {
      bestGap = gap
      best = angles[i] + gap / 2
    }
  }
  return best
}
