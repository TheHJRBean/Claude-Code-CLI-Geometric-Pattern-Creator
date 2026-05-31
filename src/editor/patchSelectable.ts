import type { Vec2 } from '../utils/math'
import { pointsEqual } from '../utils/math'
import type { EditorPatch, EditorCell, EditorTile } from '../types/editor'
import { computeAllCycles, computeBoundaryCycle } from './boundary'
import { EDITOR_EPS, tileVertices } from './exposedEdges'
import { applyStamp, editorNeighbourStamps, type LatticeStamp } from './lattice'
import { compositionNeighbourStamps, patchRotation } from './compositionLattice'
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

/** Rotate a `Vec2` about the origin by `theta`. */
function rotateAboutOrigin(p: Vec2, theta: number): Vec2 {
  if (theta === 0) return p
  const c = Math.cos(theta), s = Math.sin(theta)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/**
 * Cell-local → Patch-world. Rotate about origin by the Cell rotation, translate
 * by the Cell centre, then apply any rigid Patch-level alternate rotation
 * (`patchRot`) about the Patch origin. `patchRot` defaults to 0 — single-cell
 * and non-alternate composites are unchanged.
 */
export function applyCellTransform(
  p: Vec2,
  cell: { center: Vec2; rotation: number },
  patchRot = 0,
): Vec2 {
  const base = cell.rotation === 0
    ? { x: p.x + cell.center.x, y: p.y + cell.center.y }
    : (() => {
        const c = Math.cos(cell.rotation), s = Math.sin(cell.rotation)
        return { x: p.x * c - p.y * s + cell.center.x, y: p.x * s + p.y * c + cell.center.y }
      })()
  return rotateAboutOrigin(base, patchRot)
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

/** Patch-world → Cell-local. Inverse of `applyCellTransform` (un-rotates the
 *  Patch-level rotation first, then the Cell transform). */
export function inverseCellTransform(
  p: Vec2,
  cell: { center: Vec2; rotation: number },
  patchRot = 0,
): Vec2 {
  const pre = rotateAboutOrigin(p, -patchRot)
  return inverseRotateTranslate(pre, { translation: cell.center, rotation: cell.rotation })
}

/** Axis-aligned bounding box (world coords) enclosing `points`. */
function boundingBox(points: Vec2[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Neighbour-stamp set local to the given `points` (Complete-mode picks).
 *
 * The canvas exposes the *full visible lattice* of neighbour copies, which is
 * viewport-dependent — but the reducer has no viewport. Instead of a fixed
 * ring we generate just the lattice stamps in a small box around the picks
 * (the lattice generators add a one-cell margin, so the stamp each pick sits
 * on is always covered). This accepts any neighbour copy the user can click,
 * however far they've panned, while staying viewport-free.
 */
export function neighbourStampsNear(patch: EditorPatch, points: Vec2[]): LatticeStamp[] {
  if (points.length === 0) return []
  const box = boundingBox(points)
  return patch.cells.length > 1
    ? compositionNeighbourStamps(patch, box)
    : editorNeighbourStamps(patch.cells[0], box)
}

/**
 * Every vertex of a single Cell the user can click, in Cell-local coords:
 * the outer tile cycle, interior pocket cycles, and the Cell-Boundary corners.
 * Shared by the live-Patch and neighbour-stamp membership tests so the two
 * always agree, and mirrors the canvas pick-target build in `Canvas.tsx`.
 */
export function cellLocalSelectableVertices(cell: EditorCell): Vec2[] {
  const cycles = computeAllCycles(cell)
  return [
    ...cycles.outer.map(v => v.p),
    ...cycles.pockets.flat().map(v => v.p),
    ...computeBoundaryCycle(cell).map(v => v.p),
  ]
}

/**
 * True if `p` is a vertex the user can legitimately click in Complete mode:
 * any Cell's outer / pocket / Boundary-corner vertex, or — when
 * `includeNeighbours` — any neighbour-stamp copy of one. The neighbour test is
 * pick-local (see `neighbourStampsNear`) so it matches the canvas's
 * full-lattice exposure without enumerating a viewport.
 */
export function isPatchSelectableVertex(patch: EditorPatch, p: Vec2, includeNeighbours: boolean): boolean {
  const patchRot = patchRotation(patch)
  for (const cell of patch.cells) {
    for (const v of cellLocalSelectableVertices(cell)) {
      if (pointsEqual(p, applyCellTransform(v, cell, patchRot), EDITOR_EPS)) return true
    }
  }
  if (!includeNeighbours) return false
  for (const stamp of neighbourStampsNear(patch, [p])) {
    for (const cell of patch.cells) {
      for (const v of cellLocalSelectableVertices(cell)) {
        if (pointsEqual(p, applyStamp(applyCellTransform(v, cell, patchRot), stamp), EDITOR_EPS)) return true
      }
    }
  }
  return false
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
  patchRot = 0,
): EditorTile {
  const stampRot = stamp?.rotation ?? 0
  const netRot = source.rotation + stampRot - target.rotation
  const through = (p: Vec2): Vec2 => {
    const afterCell = applyCellTransform(p, source, patchRot)
    const afterStamp = stamp ? applyStamp(afterCell, stamp) : afterCell
    return inverseCellTransform(afterStamp, target, patchRot)
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
  if (!picks.every(p => isPatchSelectableVertex(patch, p, true))) return { kind: 'pick-not-selectable' }
  if (!picks.some(p => isPatchSelectableVertex(patch, p, false))) return { kind: 'no-real-cell-pick' }

  const active = patch.cells.find(c => c.id === patch.activeCellId) ?? patch.cells[0]
  const patchRot = patchRotation(patch)
  const localPicks = picks.map(p => inverseCellTransform(p, active, patchRot))
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
