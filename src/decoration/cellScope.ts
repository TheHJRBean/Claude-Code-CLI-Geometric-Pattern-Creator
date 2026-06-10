import type { Vec2 } from '../utils/math'
import { dist } from '../utils/math'
import { hash8, minRotation } from './voids'

/**
 * Step 19 Stage 2b — the `cell` Grouping-scope rung (ADR-0005): one click
 * paints the clicked target **plus its rotation/mirror twins under the host
 * Cell's dihedral symmetry**, repeated per Patch. Coarseness sits between
 * `congruent` (all matching shapes anywhere) and `patch` (one Lattice-orbit
 * position).
 *
 * A Cell's symmetry frame is derived from its **boundary outline** (regular
 * n-gon vertices in base-domain coords) rather than shape metadata, so
 * multi-cell Configurations, octagon/dodecagon Cells, and alternate
 * orientation all come out right for free: centre = vertex average, D_n
 * rotations are 2πk/n about the centre, mirror axes pass through vertex 0's
 * angle at steps of π/n.
 *
 * A `cell` key is `<sig>#<cellTag>:<hash>` where the hash canonicalises the
 * target's **whole outline** (not just its centroid): the lexicographically
 * smallest quantised vertex serialisation over all 2n D_n images. Twins —
 * targets some symmetry really maps onto each other — share the canonical
 * serialisation, hence the key. Centroid-only keys were tried first and
 * over-grouped: two congruent Voids centred on the SAME point (common at a
 * cell centre — e.g. a star core and its 45°-rotated sibling under a D4
 * square) have identical centroids but are twins only if a cell symmetry
 * maps one outline onto the other.
 *
 * Targets are assigned to the nearest Cell centre (Voids can straddle Cells,
 * so containment tests would be ambiguous anyway). Matching is exact string
 * equality — like congruent signatures, the quantisation (0.25 world units)
 * absorbs float noise.
 */

export interface CellFrame {
  /** Stable tag — `c<i>` for index i into the Patch's cell outlines. */
  tag: string
  /** Boundary centre (vertex average), base-domain coords. */
  centre: Vec2
  /** Boundary side count (D_n order = 2n). */
  n: number
  /** Angle of vertex 0 from the centre — orients the mirror axes. */
  theta0: number
}

/** Build symmetry frames from the Patch's Cell-boundary outlines (one per
 * Cell, in `patch.cells` order — `editorBase.baseOutlines`). */
export function cellFramesFromOutlines(outlines: Vec2[][]): CellFrame[] {
  const frames: CellFrame[] = []
  for (let i = 0; i < outlines.length; i++) {
    const o = outlines[i]
    if (o.length < 3) continue
    let sx = 0, sy = 0
    for (const v of o) { sx += v.x; sy += v.y }
    const centre = { x: sx / o.length, y: sy / o.length }
    frames.push({
      tag: `c${i}`,
      centre,
      n: o.length,
      theta0: Math.atan2(o[0].y - centre.y, o[0].x - centre.x),
    })
  }
  return frames
}

/** Vertex-coordinate quantisation for the canonical serialisation. */
const SNAP = 0.25
const CLOSE_TOL = 1e-3

/**
 * The `cell`-scope key for a target with congruent `signature`, outline /
 * chain `points` in **patch-reduced** (base-domain) coordinates, and
 * patch-reduced centroid `anchor` (picks the host Cell). `closed` marks a
 * ring (Void outline, closed Strand loop) vs an open Strand chain.
 */
export function cellOrbitKey(
  signature: string,
  points: Vec2[],
  closed: boolean,
  anchor: Vec2,
  frames: CellFrame[],
): string {
  if (frames.length === 0 || points.length < 2) return `${signature}#c?`
  // Host cell = nearest centre (strict improvement ⇒ deterministic tie-break
  // by frame order, which is stable patch.cells order).
  let f = frames[0]
  let best = Infinity
  for (const fr of frames) {
    const dx = anchor.x - fr.centre.x
    const dy = anchor.y - fr.centre.y
    const d = dx * dx + dy * dy
    if (d < best - 1e-9) { best = d; f = fr }
  }
  // Closed rings often repeat the first point at the end — drop the duplicate.
  let pts = points
  if (closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < CLOSE_TOL) {
    pts = pts.slice(0, pts.length - 1)
  }
  const rel = pts.map(p => ({ x: p.x - f.centre.x, y: p.y - f.centre.y }))

  // Canonical serialisation = lexicographic min over the 2n D_n images of the
  // quantised vertex sequence (cyclic + reversal-free for rings via
  // minRotation; forward/backward min for open chains). Twins are exact
  // images of each other, so their image sets — and the min — coincide.
  let bestSer: string | null = null
  const considerImage = (tx: (p: Vec2) => Vec2) => {
    const tokens = rel.map(p => {
      const q = tx(p)
      return `${Math.round(q.x / SNAP)},${Math.round(q.y / SNAP)}`
    })
    const ser = closed
      ? minRotation(tokens)
      : minOf(tokens.join(';'), tokens.slice().reverse().join(';'))
    if (bestSer === null || ser < bestSer) bestSer = ser
  }
  for (let k = 0; k < f.n; k++) {
    const a = (2 * Math.PI * k) / f.n
    const ca = Math.cos(a), sa = Math.sin(a)
    considerImage(p => ({ x: ca * p.x - sa * p.y, y: sa * p.x + ca * p.y }))
    // Mirror across the axis at angle theta0 + πk/n through the centre.
    const alpha = f.theta0 + (Math.PI * k) / f.n
    const c2 = Math.cos(2 * alpha), s2 = Math.sin(2 * alpha)
    considerImage(p => ({ x: c2 * p.x + s2 * p.y, y: s2 * p.x - c2 * p.y }))
  }
  return `${signature}#${f.tag}:${hash8(bestSer!)}`
}

const minOf = (a: string, b: string): string => (a < b ? a : b)

/** Translate `points` so a world/field target lands in patch-reduced coords:
 * the same shift that takes its centroid to its Lattice-orbit offset. */
export function reduceToOrbit(points: Vec2[], centroid: Vec2, orbit: Vec2): Vec2[] {
  const dx = orbit.x - centroid.x
  const dy = orbit.y - centroid.y
  if (dx === 0 && dy === 0) return points
  return points.map(p => ({ x: p.x + dx, y: p.y + dy }))
}
