/**
 * Promote world-space **Guide Tiles** into ordinary Cell Tiles.
 *
 * A Complete (or Place) built on a **non-stamping** Guide Anchor lands in
 * `patch.guideTiles`: world coords, rendered once, never repeated under the
 * Lattice (Guides spec Decision 2 / 4, `reducer.ts::guideCompleteWorldSpace`).
 * That is the right home for frame ornament, and the wrong one for the
 * scaffold-first workflow Decision 4 exists to enable — there the scaffold is
 * how you author a Patch, and the Patch must repeat.
 *
 * The fork is decided at Complete time by a Guide flag that defaults OFF, and
 * flipping that flag afterwards does nothing to Tiles already minted. So the
 * escape hatch is here rather than on the Guide: take every world-space Tile,
 * work out which Cell it belongs to and re-express it in that Cell's frame.
 *
 * Host resolution is `resolveHostCell` (containment, nearest-centre fallback)
 * on the Tile's **centroid** — not on the Anchor that made it, which is a
 * corner and can sit on a Cell-Boundary shared by two Cells.
 */

import type { EditorCell, EditorPatch, EditorTile } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { tileVertices } from './exposedEdges'
import { inverseCellTransform, resolveHostCell } from './patchSelectable'

/** Mean of a polygon's vertices — the point host resolution is asked about. */
function vertexCentroid(points: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}

/**
 * Re-express a Patch-world Tile in `host`'s local frame. The Cell transform is
 * a rotation-plus-translation, so a regular Tile keeps its `edgeLength` and
 * just sheds the Cell + Patch rotations, and an irregular Tile's winding is
 * preserved (no reflection is involved).
 */
function toCellLocal(tile: EditorTile, host: EditorCell, patchRot: number, id: string): EditorTile {
  if (tile.kind === 'regular') {
    return {
      ...tile,
      id,
      center: inverseCellTransform(tile.center, host, patchRot),
      rotation: tile.rotation - host.rotation - patchRot,
    }
  }
  return {
    ...tile,
    id,
    vertices: tile.vertices.map(v => inverseCellTransform(v, host, patchRot)),
  }
}

/**
 * Move every `patch.guideTiles` entry into the Cell that contains it, clearing
 * the world-space bucket. Returns the input untouched when there is nothing to
 * promote, so the caller can treat it as a no-op guard.
 *
 * Ids are re-minted under a `promoted-` prefix: the source ids are unique only
 * within `guideTiles` and would otherwise be free to collide with a Cell's own
 * `guide-stamp-*` placements.
 */
export function promoteGuideTiles<T extends EditorPatch>(patch: T, patchRot = 0): T {
  const guideTiles = patch.guideTiles ?? []
  if (guideTiles.length === 0) return patch

  const added = new Map<string, EditorTile[]>()
  guideTiles.forEach((tile, i) => {
    const host = resolveHostCell(patch, vertexCentroid(tileVertices(tile)), patchRot)
    const local = toCellLocal(tile, host, patchRot, `promoted-${i}-${tile.id}`)
    const bucket = added.get(host.id)
    if (bucket) bucket.push(local)
    else added.set(host.id, [local])
  })

  const next: T = {
    ...patch,
    cells: patch.cells.map(cell => {
      const extra = added.get(cell.id)
      return extra ? { ...cell, tiles: [...cell.tiles, ...extra] } : cell
    }),
  }
  delete next.guideTiles
  return next
}
