import { clamp, cross, dist, lerp, normalize, sub, type Vec2 } from '../utils/math'
import type { StrandData } from './buildStrands'

/**
 * Taprats-style interlace assignment (after `csk.taprats.style.Interlace`).
 *
 * Taprats interlaces over a full planar arrangement: every place two threads
 * meet is a map vertex. We reproduce that with two crossing sources:
 *
 *   a. **shared chain points** — degree-4 vertices where ray pairs from
 *      neighbouring polygons meet (e.g. tiling-edge contact points), i.e.
 *      points two Strands both pass through;
 *   b. **transversal mid-edge intersections** — Strand edges crossing away
 *      from any chain point. Vertex-line Strands cross edge-line Strands
 *      this way (PIC never splits segments at those crossings), so without
 *      this source the weave is blind to vertex strands.
 *
 * Two rules govern the weave, both "opposite parity" constraints:
 *
 *   1. travelling along one Strand, successive crossings alternate
 *      over / under;
 *   2. at any single crossing the two threads take opposite roles.
 *
 * The assignment is therefore a 2-colouring of the crossing-visit graph,
 * propagated breadth-first exactly as Taprats does. A visit graph with an
 * odd cycle (three threads through one point, a closed Strand with an odd
 * crossing count, or a mixed edge+vertex arrangement that isn't
 * checkerboard-colourable) can't be 2-coloured perfectly; like Taprats, the
 * first assignment wins and conflicting constraints are left unsatisfied
 * rather than failing the whole weave. Thread tips touching another thread
 * (T-junctions, e.g. orphan vertex rays terminating on a star arm) don't
 * interlace — Taprats' odd-vertex rule.
 */

export interface UnderCut {
  /**
   * Position along the Strand: edgeIndex + t (t ∈ [0,1) along that edge).
   * Integer values are chain points; 0 doubles as the wrap point of a
   * closed Strand.
   */
  s: number
  /**
   * Cut-widening factor, 1/sin(crossing angle) clamped to [1, 3] — shallow
   * crossings need a longer cut for the over thread to read as covering.
   */
  factor: number
}

export interface StrandWeave {
  /** Crossings this Strand passes **under**, sorted by `s`. */
  under: UnderCut[]
}

interface Visit {
  strand: number
  s: number
  /** unit direction of the thread at the crossing (straight-line approx) */
  dir: Vec2
  over: boolean | null
  group: Visit[]
  /** along-strand neighbouring crossing visits (wraps on closed Strands) */
  prev: Visit | null
  next: Visit | null
}

/** Same vertex quantisation as buildStrands so visits land in its vertices. */
function ptKey(p: Vec2): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)}`
}

function samePt(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
}

const MIN_SIN = 1 / 3
/** World-distance tolerance for "this intersection IS a chain point". */
const ENDPOINT_TOL = 1e-4

export function computeWeave(strands: StrandData[]): StrandWeave[] {
  const closedFlags = strands.map(sd => {
    const pts = sd.points
    return pts.length > 3 && samePt(pts[0], pts[pts.length - 1])
  })

  // Visits are unique per (strand, world point, position): one crossing seen
  // from both sources (or from two adjacent edges of a bent thread) stays one
  // visit, while a self-crossing thread keeps its two distinct passes.
  const byVertex = new Map<string, Visit[]>()
  const visitMap = new Map<string, Visit>()
  const byStrand: Visit[][] = strands.map(() => [])

  const addVisit = (strand: number, s: number, dir: Vec2, worldKey: string) => {
    const vk = `${strand}|${worldKey}|${s.toFixed(6)}`
    if (visitMap.has(vk)) return
    const v: Visit = { strand, s, dir, over: null, group: [], prev: null, next: null }
    visitMap.set(vk, v)
    byStrand[strand].push(v)
    let g = byVertex.get(worldKey)
    if (!g) byVertex.set(worldKey, (g = []))
    g.push(v)
  }

  // ── source a: pass-through visits at chain points ──────────────────────
  // Interior points, plus the wrap point of closed Strands. Endpoints of
  // open Strands never weave (tip touches are T-junctions).
  for (let s = 0; s < strands.length; s++) {
    const pts = strands[s].points
    const n = pts.length
    if (closedFlags[s]) addVisit(s, 0, normalize(sub(pts[1], pts[n - 2])), ptKey(pts[0]))
    for (let i = 1; i < n - 1; i++) {
      addVisit(s, i, normalize(sub(pts[i + 1], pts[i - 1])), ptKey(pts[i]))
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
    addVisit(ea.strand, pa.s, pa.dir, key)
    addVisit(eb.strand, pb.s, pb.dir, key)
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

  // ── crossings = world points with ≥2 visits ─────────────────────────────
  for (const group of byVertex.values()) {
    if (group.length < 2) continue
    for (const v of group) v.group = group
  }

  const crossingsByStrand: Visit[][] = byStrand.map(visits =>
    visits.filter(v => v.group.length >= 2).sort((a, b) => a.s - b.s),
  )

  // Chain each Strand's crossing visits (rule 1's adjacency).
  for (let s = 0; s < crossingsByStrand.length; s++) {
    const cs = crossingsByStrand[s]
    for (let i = 0; i + 1 < cs.length; i++) {
      cs[i].next = cs[i + 1]
      cs[i + 1].prev = cs[i]
    }
    if (closedFlags[s] && cs.length >= 2) {
      cs[cs.length - 1].next = cs[0]
      cs[0].prev = cs[cs.length - 1]
    }
  }

  // BFS 2-colouring: every constraint edge means "opposite parity".
  const queue: Visit[] = []
  for (const cs of crossingsByStrand) {
    for (const seed of cs) {
      if (seed.over !== null) continue
      seed.over = true
      queue.push(seed)
      while (queue.length > 0) {
        const v = queue.pop()!
        const flip = (w: Visit | null) => {
          if (!w || w === v || w.over !== null) return
          w.over = !v.over
          queue.push(w)
        }
        flip(v.prev)
        flip(v.next)
        for (const w of v.group) flip(w)
      }
    }
  }

  // Emit under-cuts with the crossing-angle factor.
  const weaves: StrandWeave[] = strands.map(() => ({ under: [] }))
  for (const cs of crossingsByStrand) {
    for (const v of cs) {
      if (v.over !== false) continue
      const other = v.group.find(w => w !== v)!
      const sin = Math.abs(cross(v.dir, other.dir))
      weaves[v.strand].under.push({ s: v.s, factor: 1 / clamp(sin, MIN_SIN, 1) })
    }
  }

  return weaves
}
