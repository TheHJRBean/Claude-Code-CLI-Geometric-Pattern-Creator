import { clamp, cross, normalize, sub, type Vec2 } from '../utils/math'
import type { StrandData } from './buildStrands'

/**
 * Taprats-style interlace assignment (after `csk.taprats.style.Interlace`).
 *
 * A **crossing** is a map vertex where two (or more) Strands pass straight
 * through — in PIC output these are the degree-4 vertices where ray pairs
 * from neighbouring polygons meet (e.g. tiling-edge contact points). Two
 * rules govern a weave, both "opposite parity" constraints:
 *
 *   1. travelling along one Strand, successive crossings alternate
 *      over / under;
 *   2. at any single crossing the two threads take opposite roles.
 *
 * The assignment is therefore a 2-colouring of the crossing-visit graph,
 * propagated breadth-first exactly as Taprats does. A visit graph with an
 * odd cycle (e.g. three threads through one point, or a closed Strand with
 * an odd crossing count) can't be 2-coloured perfectly; like Taprats, the
 * first assignment wins and conflicting constraints are left unsatisfied
 * rather than failing the whole weave.
 */

export interface StrandWeave {
  /**
   * pointIdx → cut factor for crossings this Strand passes **under**.
   * The factor is 1/sin(crossing angle) clamped to [1, 3] — shallow
   * crossings need a longer cut for the over thread to read as covering.
   * For a closed Strand the wrap point is keyed as pointIdx 0.
   */
  under: Map<number, number>
}

interface Visit {
  strand: number
  pointIdx: number
  /** unit direction of the thread through the point (straight-line approx) */
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

export function computeWeave(strands: StrandData[]): StrandWeave[] {
  // 1. Collect pass-through visits (interior points; plus the wrap point of
  //    closed Strands). Endpoints of open Strands never weave — a thread
  //    tip touching a crossing is left alone, as in Taprats.
  const byVertex = new Map<string, Visit[]>()
  const byStrand: Visit[][] = strands.map(() => [])

  for (let s = 0; s < strands.length; s++) {
    const pts = strands[s].points
    const n = pts.length
    const closed = n > 3 && samePt(pts[0], pts[n - 1])

    const addVisit = (pointIdx: number, from: Vec2, to: Vec2) => {
      const v: Visit = {
        strand: s,
        pointIdx,
        dir: normalize(sub(to, from)),
        over: null,
        group: [],
        prev: null,
        next: null,
      }
      byStrand[s].push(v)
      const k = ptKey(pts[pointIdx])
      let g = byVertex.get(k)
      if (!g) byVertex.set(k, (g = []))
      g.push(v)
    }

    if (closed) addVisit(0, pts[n - 2], pts[1])
    for (let i = 1; i < n - 1; i++) addVisit(i, pts[i - 1], pts[i + 1])
  }

  // 2. Crossings are vertices with ≥2 pass-through visits. Drop the rest.
  for (const group of byVertex.values()) {
    if (group.length < 2) continue
    for (const v of group) v.group = group
  }

  const weaves: StrandWeave[] = strands.map(() => ({ under: new Map() }))
  const crossingsByStrand: Visit[][] = byStrand.map(visits =>
    visits.filter(v => v.group.length >= 2),
  )

  // 3. Chain each Strand's crossing visits (rule 1's adjacency).
  for (let s = 0; s < crossingsByStrand.length; s++) {
    const cs = crossingsByStrand[s]
    for (let i = 0; i + 1 < cs.length; i++) {
      cs[i].next = cs[i + 1]
      cs[i + 1].prev = cs[i]
    }
    const pts = strands[s].points
    const closed = pts.length > 3 && samePt(pts[0], pts[pts.length - 1])
    if (closed && cs.length >= 2) {
      cs[cs.length - 1].next = cs[0]
      cs[0].prev = cs[cs.length - 1]
    }
  }

  // 4. BFS 2-colouring: every constraint edge means "opposite parity".
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

  // 5. Emit under-cuts with the crossing-angle factor.
  for (const cs of crossingsByStrand) {
    for (const v of cs) {
      if (v.over !== false) continue
      const other = v.group.find(w => w !== v)!
      const sin = Math.abs(cross(v.dir, other.dir))
      const factor = 1 / clamp(sin, MIN_SIN, 1)
      weaves[v.strand].under.set(v.pointIdx, factor)
    }
  }

  return weaves
}
