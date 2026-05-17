import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorPatch, EditorCell, EditorTile } from '../types/editor'
import { computeAllCycles, computeBoundaryCycle } from './boundary'
import { EDITOR_EPS, tileVertices } from './exposedEdges'
import { applyStamp, editorOneRingNeighbourStamps, type LatticeStamp } from './lattice'
import { compositionOneRingStamps } from './compositionLattice'
import { ensureCCW } from './complete'
import { validateNGapPolygon } from './completeN'
import { overlapsExistingDetail, type OverlapDetail } from './tileOverlap'

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

/**
 * Existing-tile vertex arrays from every Cell in the Patch, expressed in
 * `host`'s local frame. Sibling Cells get their tiles forward-transformed
 * through their own cellTransform then inverse-transformed through `host`'s,
 * so overlap / adjacency checks can compare the candidate tile (in `host`-
 * local) against the entire Patch's tiles uniformly.
 */
export function existingTilesInHostFrame(patch: EditorPatch, host: EditorCell): Vec2[][] {
  const out: Vec2[][] = []
  for (const cell of patch.cells) {
    for (const tile of cell.tiles) {
      const local = tileVertices(tile)
      if (cell.id === host.id) {
        out.push(local)
        continue
      }
      const patchLocal = local.map(v => applyCellTransform(v, cell))
      out.push(patchLocal.map(v => inverseCellTransform(v, host)))
    }
  }
  return out
}

/**
 * Result of `validateMultiPick`. Mirrors the reducer's gating in
 * `multiPickCompleteAcrossPatch`, so the preview can show red / green in
 * real time without the user having to press Enter to discover the
 * rejection.
 */
export type MultiPickValidity =
  | { kind: 'valid' }
  | { kind: 'too-few' }
  | { kind: 'pick-not-selectable' }
  | { kind: 'no-real-cell-pick' }
  | { kind: 'duplicate-vertex' }
  | { kind: 'self-intersecting' }
  | { kind: 'inside-tile' }
  | { kind: 'overlaps-existing'; detail: OverlapDetail }

/** Human-readable label for the preview overlay. */
export function multiPickValidityLabel(v: MultiPickValidity): string | null {
  switch (v.kind) {
    case 'valid': return null
    case 'too-few': return 'Pick at least 3 vertices.'
    case 'pick-not-selectable': return 'A pick is off the selectable set.'
    case 'no-real-cell-pick': return 'At least one pick must be on the live Patch (not only neighbour stamps).'
    case 'duplicate-vertex': return 'Duplicate pick — each vertex must be distinct.'
    case 'self-intersecting': return 'Polygon self-intersects — re-order picks.'
    case 'inside-tile': return 'Polygon centroid lies inside an existing Tile.'
    case 'overlaps-existing': {
      switch (v.detail.rule) {
        case 'polygon-vertex-inside-tile': return 'A pick lies inside an existing Tile.'
        case 'tile-vertex-inside-polygon': return 'Polygon encloses an existing Tile vertex.'
        case 'edge-crossing': return 'Polygon edge crosses an existing Tile edge.'
      }
    }
  }
}

/**
 * Validate a multi-pick (Ctrl-click + Enter) attempt against the same
 * gates the reducer applies. Used by the canvas preview to colour the
 * polygon red/green live.
 */
export function validateMultiPick(patch: EditorPatch, picks: Vec2[]): MultiPickValidity {
  if (picks.length < 3) return { kind: 'too-few' }
  const selectable = patchSelectableVertices(patch, true)
  if (!picks.every(p => isSelectable(p, selectable))) return { kind: 'pick-not-selectable' }
  const realVerts = patchSelectableVertices(patch, false)
  if (!picks.some(p => isSelectable(p, realVerts))) return { kind: 'no-real-cell-pick' }

  const active = patch.cells.find(c => c.id === patch.activeCellId) ?? patch.cells[0]
  const localPicks = picks.map(p => inverseCellTransform(p, active))
  const ngap = validateNGapPolygon(localPicks, active)
  if (ngap.kind === 'too-few') return { kind: 'too-few' }
  if (ngap.kind === 'duplicate-vertex') return { kind: 'duplicate-vertex' }
  if (ngap.kind === 'self-intersecting') return { kind: 'self-intersecting' }
  if (ngap.kind === 'inside-tile') return { kind: 'inside-tile' }

  const candidate = ensureCCW([...localPicks])
  const userTiles = existingTilesInHostFrame(patch, active)
  const detail = overlapsExistingDetail(candidate, userTiles)
  if (detail) return { kind: 'overlaps-existing', detail }

  return { kind: 'valid' }
}
