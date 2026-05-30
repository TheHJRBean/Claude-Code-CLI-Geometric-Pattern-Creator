import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorCell } from '../types/editor'
import { EDITOR_EPS } from './exposedEdges'
import { editorBoundaryVertices } from './buildEditorPolygons'
import { expandedLattice, applyStamp, type LatticeStamp } from './lattice'

/**
 * Step 17 Framing slice 10 — **n-ring** Frame geometry.
 *
 * An n-ring Frame is the centre Patch plus N shells of its lattice neighbours,
 * clipped to the outer outline of that union — the "measured in whole Patches"
 * counterpart to the parametric Shape Frame. It is **clip-only**: there are no
 * Frame nodes and no completion (the field already tiles the region exactly),
 * so `frameOutlinePolygon` stays `null` for n-ring Frames and the outline here
 * feeds `PatternSVG`'s clip slot directly.
 *
 * Design resolution (2026-05-30, see `project_framing_stage_idea.md`):
 *   - region = the EXACT union of the stamped Patch boundary outlines (follows
 *     cell edges), not a convex envelope;
 *   - the union is built by directed-edge cancellation + cycle chaining (the
 *     `boundary.ts::computeAllCycles` technique generalised to arbitrary
 *     polygons), exact iff the tiling is edge-to-edge;
 *   - ring neighbourhood = per-lattice ring distance (square → box, hexagon →
 *     hex distance, triangle → orientation-tracking edge-adjacency BFS);
 *   - v1 scope = single-cell square / hexagon / triangle. Octagon / dodecagon
 *     and multi-cell Configurations are unsupported (return `null`).
 */

/** Default / clamp range for the ring count. N = 0 is just the centre Patch. */
export const DEFAULT_FRAME_RINGS = 1
export const MIN_FRAME_RINGS = 0
export const MAX_FRAME_RINGS = 6

/**
 * Lattice-cell stamps (centre included) for the N-ring neighbourhood of `cell`,
 * or `null` for shapes without a single-cell lattice (octagon / dodecagon).
 * Each stamp is a rotation-about-origin + translation, ready for `applyStamp`.
 */
export function nRingCellStamps(cell: EditorCell, rings: number): LatticeStamp[] | null {
  const lat = expandedLattice(cell)
  if (!lat) return null
  const N = Math.max(0, Math.floor(rings))
  const { u, v } = lat

  if (cell.shape === 'triangle') {
    // Each lattice cell holds an up- and a down-triangle (lat.intraStamps[0/1]).
    // Grow by edge-adjacency BFS over (a, b, orientation):
    //   up(a,b)   → down at (a,b), (a+1,b), (a,b+1)
    //   down(a,b) → up   at (a,b), (a-1,b), (a,b-1)
    const up = lat.intraStamps[0]
    const down = lat.intraStamps[1] ?? up
    const key = (a: number, b: number, o: number) => `${a},${b},${o}`
    const seen = new Set<string>()
    let frontier: Array<[number, number, number]> = [[0, 0, 0]]
    seen.add(key(0, 0, 0))
    const all: Array<[number, number, number]> = [[0, 0, 0]]
    for (let r = 0; r < N; r++) {
      const next: Array<[number, number, number]> = []
      for (const [a, b, o] of frontier) {
        const neighbours: Array<[number, number, number]> = o === 0
          ? [[a, b, 1], [a + 1, b, 1], [a, b + 1, 1]]
          : [[a, b, 0], [a - 1, b, 0], [a, b - 1, 0]]
        for (const nb of neighbours) {
          const k = key(nb[0], nb[1], nb[2])
          if (seen.has(k)) continue
          seen.add(k)
          next.push(nb)
          all.push(nb)
        }
      }
      frontier = next
    }
    return all.map(([a, b, o]) => {
      const intra = o === 0 ? up : down
      return {
        translation: { x: a * u.x + b * v.x + intra.translation.x, y: a * u.y + b * v.y + intra.translation.y },
        rotation: intra.rotation,
      }
    })
  }

  // Square / hexagon: one orientation per cell, pure translation stamps.
  const inRing = cell.shape === 'hexagon'
    // Axial hex distance: rhombus coords (a, b) at 60°.
    ? (a: number, b: number) => Math.max(Math.abs(a), Math.abs(b), Math.abs(a + b)) <= N
    // Chebyshev box for the square lattice (matches the 8-neighbour 1-ring).
    : (a: number, b: number) => Math.max(Math.abs(a), Math.abs(b)) <= N

  const stamps: LatticeStamp[] = []
  for (let a = -N; a <= N; a++) {
    for (let b = -N; b <= N; b++) {
      if (!inRing(a, b)) continue
      stamps.push({ translation: { x: a * u.x + b * v.x, y: a * u.y + b * v.y }, rotation: 0 })
    }
  }
  return stamps
}

/** Signed area of a closed polygon (positive = CCW). */
function signedArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y
  }
  return a / 2
}

function ensureCCW(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? poly.slice().reverse() : poly
}

/** Drop vertices that lie on the straight run between their neighbours. */
function dropCollinear(poly: Vec2[]): Vec2[] {
  const n = poly.length
  if (n < 3) return poly
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]
    const curr = poly[i]
    const next = poly[(i + 1) % n]
    const cross = (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x)
    const scale = Math.hypot(curr.x - prev.x, curr.y - prev.y) * Math.hypot(next.x - prev.x, next.y - prev.y)
    if (Math.abs(cross) > scale * 1e-6) out.push(curr)
  }
  return out.length >= 3 ? out : poly
}

/**
 * Outer boundary of a union of edge-to-edge polygons (each CCW or CW). An
 * interior edge shared by two adjacent polygons is traversed once in each
 * direction and cancels; the surviving edges are chained into closed loops and
 * the largest CCW loop is returned (collinear runs merged). Returns `null` if
 * no closed loop forms (degenerate / non-edge-to-edge input).
 */
export function unionOutline(polygons: Vec2[][]): Vec2[] | null {
  interface DEdge { p1: Vec2; p2: Vec2 }
  const edges: DEdge[] = []
  for (const poly of polygons) {
    const ccw = ensureCCW(poly)
    for (let i = 0; i < ccw.length; i++) {
      edges.push({ p1: ccw[i], p2: ccw[(i + 1) % ccw.length] })
    }
  }
  // Cancel each edge against an opposite-direction twin (interior, shared edge).
  const consumed = new Array<boolean>(edges.length).fill(false)
  const survivors: DEdge[] = []
  for (let i = 0; i < edges.length; i++) {
    if (consumed[i]) continue
    let paired = false
    for (let j = 0; j < edges.length; j++) {
      if (j === i || consumed[j]) continue
      if (pointsEqual(edges[j].p1, edges[i].p2, EDITOR_EPS) && pointsEqual(edges[j].p2, edges[i].p1, EDITOR_EPS)) {
        consumed[i] = consumed[j] = true
        paired = true
        break
      }
    }
    if (!paired) survivors.push(edges[i])
  }
  if (survivors.length < 3) return null

  // Chain survivors into closed cycles by endpoint matching.
  const remaining = [...survivors]
  const cycles: Vec2[][] = []
  while (remaining.length > 0) {
    let current = remaining.shift()!
    const start = current.p1
    const cycle: Vec2[] = [current.p1]
    let safety = remaining.length + 1
    let closed = false
    while (safety-- > 0) {
      if (pointsEqual(current.p2, start, EDITOR_EPS)) { closed = true; break }
      const idx = remaining.findIndex(e => pointsEqual(e.p1, current.p2, EDITOR_EPS))
      if (idx < 0) break
      current = remaining.splice(idx, 1)[0]
      cycle.push(current.p1)
    }
    if (closed && cycle.length >= 3) cycles.push(cycle)
  }
  if (cycles.length === 0) return null

  let best: Vec2[] | null = null
  let bestArea = 0
  for (const c of cycles) {
    const a = signedArea(c)
    if (a > bestArea) { bestArea = a; best = c }
  }
  return best ? dropCollinear(best) : null
}

/**
 * World-space clip outline for an n-ring Frame: the outer boundary of the
 * centre Patch + `rings` shells of lattice neighbours. Returns `null` for
 * unsupported shapes (octagon / dodecagon) or degenerate input.
 */
export function nRingOutline(cell: EditorCell, rings: number): Vec2[] | null {
  const stamps = nRingCellStamps(cell, rings)
  if (!stamps || stamps.length === 0) return null
  const base = editorBoundaryVertices(cell)
  if (base.length < 3) return null
  const polys = stamps.map(s => base.map(v => applyStamp(v, s)))
  return unionOutline(polys)
}
