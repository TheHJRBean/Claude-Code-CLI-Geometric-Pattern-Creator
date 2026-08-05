import { clamp, cross, lerp, type Vec2 } from '../utils/math'
import type { StrandData } from './buildStrands'
import { collectStrandVisits, type StrandVisit } from './junctions'

/**
 * Taprats-style interlace assignment (after `csk.taprats.style.Interlace`).
 *
 * Where the threads meet is `junctions.ts`' job — the same two crossing
 * sources (shared chain points + transversal mid-edge intersections) feed the
 * weave here and the Decoration Phase's junction ornaments. This module owns
 * only what the weave adds on top: which pass goes over and which under.
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
  /** World point of the crossing (straight-line strand geometry). */
  point: Vec2
  /** Unit direction of the over thread at the crossing. */
  over: Vec2
}

export interface StrandWeave {
  /** Crossings this Strand passes **under**, sorted by `s`. */
  under: UnderCut[]
}

/** A `StrandVisit` with the weave's own 2-colouring bookkeeping hung off it. */
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

const MIN_SIN = 1 / 3

export function computeWeave(strands: StrandData[]): StrandWeave[] {
  // Where the threads meet — shared with junction ornaments (`junctions.ts`).
  const field = collectStrandVisits(strands)
  const { closedFlags } = field

  // Lift each enumerated visit into a weave Visit, then group them: a world
  // point with two or more passes is a crossing, and every pass at it
  // constrains every other.
  const lifted = new Map<StrandVisit, Visit>()
  const byStrand: Visit[][] = strands.map(() => [])
  for (let s = 0; s < field.byStrand.length; s++) {
    for (const raw of field.byStrand[s]) {
      const v: Visit = { strand: raw.strand, s: raw.s, dir: raw.dir, over: null, group: [], prev: null, next: null }
      lifted.set(raw, v)
      byStrand[s].push(v)
    }
  }
  for (const c of field.crossings) {
    if (c.visits.length < 2) continue
    const group = c.visits.map(raw => lifted.get(raw)!)
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
      const pts = strands[v.strand].points
      const i = Math.max(0, Math.min(Math.floor(v.s), pts.length - 2))
      weaves[v.strand].under.push({
        s: v.s,
        factor: 1 / clamp(sin, MIN_SIN, 1),
        point: lerp(pts[i], pts[i + 1], v.s - i),
        over: other.dir,
      })
    }
  }

  return weaves
}
