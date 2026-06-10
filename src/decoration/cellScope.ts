import type { Vec2 } from '../utils/math'
import { scopedKey } from './scopes'

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
 * A `cell` key is `<sig>#<cellTag>@<x>,<y>` where (x, y) is the **canonical
 * orbit position**: the lexicographically smallest image of the target's
 * cell-relative position under the full D_n image set. Orbit twins (whose
 * positions are each other's images) share the canonical position, hence the
 * key. Targets are assigned to the nearest Cell centre (Voids can straddle
 * Cells, so containment tests would be ambiguous anyway).
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

/**
 * The `cell`-scope key for a target with congruent `signature` at Lattice
 * orbit position `patchOffset` (see `orbitOffset` — base-domain coords, so
 * the key is stable across Patch repeats AND across the fast-path /
 * full-field render modes).
 */
export function cellScopedKey(signature: string, patchOffset: Vec2, frames: CellFrame[]): string {
  if (frames.length === 0) return scopedKey(`${signature}#c?`, patchOffset)
  // Host cell = nearest centre (strict improvement ⇒ deterministic tie-break
  // by frame order, which is stable patch.cells order).
  let f = frames[0]
  let best = Infinity
  for (const fr of frames) {
    const dx = patchOffset.x - fr.centre.x
    const dy = patchOffset.y - fr.centre.y
    const d = dx * dx + dy * dy
    if (d < best - 1e-9) { best = d; f = fr }
  }
  const q = { x: patchOffset.x - f.centre.x, y: patchOffset.y - f.centre.y }
  // Canonical orbit position: lexicographic min over the 2n D_n images of q.
  // The epsilon comparator keeps the pick stable under float noise; exact
  // coordinate ties (common by symmetry, e.g. (x, y) vs (x, −y)) fall through
  // to the y comparison, which is then exact.
  let cx = q.x, cy = q.y
  const consider = (x: number, y: number) => {
    if (x < cx - 1e-6 || (Math.abs(x - cx) <= 1e-6 && y < cy - 1e-6)) { cx = x; cy = y }
  }
  for (let k = 0; k < f.n; k++) {
    if (k > 0) {
      const a = (2 * Math.PI * k) / f.n
      const ca = Math.cos(a), sa = Math.sin(a)
      consider(ca * q.x - sa * q.y, sa * q.x + ca * q.y)
    }
    // Mirror across the axis at angle theta0 + πk/n through the centre.
    const alpha = f.theta0 + (Math.PI * k) / f.n
    const c2 = Math.cos(2 * alpha), s2 = Math.sin(2 * alpha)
    consider(c2 * q.x + s2 * q.y, s2 * q.x - c2 * q.y)
  }
  return scopedKey(`${signature}#${f.tag}`, { x: cx, y: cy })
}
