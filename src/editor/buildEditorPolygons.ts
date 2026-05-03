import type { Polygon } from '../types/geometry'
import type { EditorConfig, EditorTile } from '../types/editor'
import { regularPolygonVertices } from './regularPolygon'
import { centroid } from '../utils/math'

/**
 * Map an editor tile onto the `tileTypeId` used by `runPIC` for figure-config
 * lookup.
 *
 * Q11 resolution (Option B):
 *   - Regular n-gon → `"<n>"` (matches the existing archimedean convention).
 *   - Irregular tile → canonical-signature hash, planned for sub-step 17.5.
 *
 * 17.1 only ships regular tiles, so the irregular branch returns a
 * provisional placeholder. Replaced wholesale at 17.5.
 */
export function tileTypeIdFor(tile: EditorTile): string {
  if (tile.kind === 'regular') return String(tile.sides)
  return `${tile.vertices.length}i:provisional`
}

/**
 * Convert an `EditorConfig` into the runtime `Polygon[]` shape consumed by
 * `runPIC` and the existing render pipeline. Pure, deterministic, no
 * viewport awareness — the editor patch is finite by construction.
 */
export function editorTilesToPolygons(editor: EditorConfig): Polygon[] {
  const polys: Polygon[] = []
  for (const tile of editor.tiles) {
    if (tile.kind === 'regular') {
      polys.push({
        id: tile.id,
        sides: tile.sides,
        tileTypeId: tileTypeIdFor(tile),
        center: tile.center,
        vertices: regularPolygonVertices(tile.sides, tile.center, tile.edgeLength, tile.rotation),
      })
    } else {
      polys.push({
        id: tile.id,
        sides: tile.vertices.length,
        tileTypeId: tileTypeIdFor(tile),
        center: centroid(tile.vertices),
        vertices: tile.vertices,
      })
    }
  }
  return polys
}
