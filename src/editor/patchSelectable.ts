import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorPatch, EditorCell, EditorTile } from '../types/editor'
import { computeAllCycles, computeBoundaryCycle } from './boundary'
import { EDITOR_EPS } from './exposedEdges'
import { applyStamp, editorOneRingNeighbourStamps, type LatticeStamp } from './lattice'
import { compositionOneRingStamps } from './compositionLattice'

/**
 * Patch-frame helpers for Complete mode.
 *
 * In multi-cell Configurations the canvas exposes vertex picks from every
 * Cell *plus* composition-stamped neighbour copies. The per-Cell selectable
 * inside `placePolygonsOnOrbit` didn't include those — so picks across Cells
 * or onto neighbour stamps silently no-opped. These helpers aggregate every
 * clickable position into Patch-local coords so the reducer can validate
 * picks against the same set the user sees on screen.
 *
 * Single-cell Patches collapse naturally: one Cell, per-Cell one-ring stamps
 * (same set the canvas uses in single-cell), no cross-Cell story.
 */

/** Cell-local → Patch-local. Rotate about origin, then translate by centre. */
export function applyCellTransform(p: Vec2, cell: { center: Vec2; rotation: number }): Vec2 {
  if (cell.rotation === 0) return { x: p.x + cell.center.x, y: p.y + cell.center.y }
  const c = Math.cos(cell.rotation), s = Math.sin(cell.rotation)
  return {
    x: p.x * c - p.y * s + cell.center.x,
    y: p.x * s + p.y * c + cell.center.y,
  }
}

/**
 * Inverse of a rotation-about-origin-then-translation transform. Reused for
 * both Cell transforms and lattice stamps (both have the same shape).
 */
export function inverseRotateTranslate(p: Vec2, t: { translation: Vec2; rotation: number }): Vec2 {
  const dx = p.x - t.translation.x
  const dy = p.y - t.translation.y
  if (t.rotation === 0) return { x: dx, y: dy }
  const c = Math.cos(t.rotation), s = Math.sin(t.rotation)
  return { x: dx * c + dy * s, y: -dx * s + dy * c }
}

/** Patch-local → Cell-local. */
export function inverseCellTransform(p: Vec2, cell: { center: Vec2; rotation: number }): Vec2 {
  return inverseRotateTranslate(p, { translation: cell.center, rotation: cell.rotation })
}

/**
 * One-ring lattice neighbour stamps for the Patch. Multi-cell uses the
 * Configuration's composition stamps; single-cell uses the Cell's own
 * lattice. Matches the canvas's neighbour-pick set exactly.
 */
export function patchNeighbourStamps(patch: EditorPatch): LatticeStamp[] {
  if (patch.cells.length > 1) return compositionOneRingStamps(patch)
  if (patch.cells.length === 1) return editorOneRingNeighbourStamps(patch.cells[0])
  return []
}

/**
 * Every vertex the user can click in Complete mode, in Patch-local coords.
 * Aggregates each Cell's outer + pocket + boundary cycles, optionally with
 * one-ring neighbour stamps applied to the outer cycles. Mirrors the canvas
 * pick-target build in `Canvas.tsx` so picks validated here always agree
 * with what the user can click.
 */
export function patchSelectableVertices(patch: EditorPatch, includeNeighbours: boolean): Vec2[] {
  const out: Vec2[] = []
  for (const cell of patch.cells) {
    const cycles = computeAllCycles(cell)
    for (const v of cycles.outer) out.push(applyCellTransform(v.p, cell))
    for (const cycle of cycles.pockets) for (const v of cycle) out.push(applyCellTransform(v.p, cell))
    for (const v of computeBoundaryCycle(cell)) out.push(applyCellTransform(v.p, cell))
  }
  if (includeNeighbours) {
    const stamps = patchNeighbourStamps(patch)
    for (const stamp of stamps) {
      for (const cell of patch.cells) {
        const outer = computeAllCycles(cell).outer
        for (const v of outer) out.push(applyStamp(applyCellTransform(v.p, cell), stamp))
      }
    }
  }
  return out
}

/**
 * Forward-transform a Tile from source-Cell-local through an optional stamp
 * into Patch-local, then inverse the target Cell's transform to land in
 * target-Cell-local. Returns the rewritten Tile ready to drop into
 * `target.tiles[]`. When `source === target` and `stamp === null`, the
 * transforms cancel and the returned Tile is geometrically identical.
 */
export function retargetTile(
  tile: EditorTile,
  source: EditorCell,
  stamp: LatticeStamp | null,
  target: EditorCell,
): EditorTile {
  const stampRot = stamp?.rotation ?? 0
  const netRot = source.rotation + stampRot - target.rotation
  const through = (p: Vec2): Vec2 => {
    const afterCell = applyCellTransform(p, source)
    const afterStamp = stamp ? applyStamp(afterCell, stamp) : afterCell
    return inverseCellTransform(afterStamp, target)
  }
  if (tile.kind === 'regular') {
    return { ...tile, center: through(tile.center), rotation: tile.rotation + netRot }
  }
  return { ...tile, vertices: tile.vertices.map(through) }
}

/** True if `p` matches any vertex in `set` within `EDITOR_EPS`. */
export function isSelectable(p: Vec2, set: Vec2[]): boolean {
  return set.some(q => pointsEqual(p, q, EDITOR_EPS))
}
