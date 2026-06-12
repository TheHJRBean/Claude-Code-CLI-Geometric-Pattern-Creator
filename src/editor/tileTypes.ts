import type { TileTypeInfo } from '../types/tiling'
import type { FigureConfig } from '../types/pattern'
import type { EditorPatch, EditorTile } from '../types/editor'
import { tileTypeIdFor, tileTypeLabel } from './tileTypeId'

/**
 * Q15 resolution — the default `FigureConfig` lazily seeded for every new
 * Tile type that appears in an editor Patch. Star figures with a 60° contact
 * angle and auto-strand-length match the Lab archimedean defaults so a fresh
 * Patch's Strands look immediately reasonable.
 */
export const DEFAULT_EDITOR_FIGURE: FigureConfig = {
  type: 'star',
  contactAngle: 60,
  lineLength: 1.0,
  autoLineLength: true,
}

/**
 * Walk every Cell in the Patch and produce one `TileTypeInfo` per distinct
 * `tileTypeId`. Order: by first appearance, so the Composition-Phase panel
 * reads top-to-bottom in placement order.
 *
 * Irregular labels follow Q11's "Irregular A/B/C…" scheme — assigned by
 * first-seen rank within the Patch's distinct irregular set.
 */
export function editorTileTypes(patch: EditorPatch): TileTypeInfo[] {
  const seen = new Map<string, EditorTile>()
  for (const cell of patch.cells) {
    for (const tile of cell.tiles) {
      const id = tileTypeIdFor(tile)
      if (!seen.has(id)) seen.set(id, tile)
    }
  }
  // Frame-scoped completion Tiles carry their own tile types —
  // `seedFiguresForEditor` seeds Figure recipes for them, but they never
  // appeared in this panel list, so any completion type not shared with a
  // lattice tile was stuck at the DEFAULT figure with no way to edit it
  // (reported as "I curved all the gons but some stayed uncurved").
  for (const tile of patch.frame?.completedTiles ?? []) {
    const id = tileTypeIdFor(tile)
    if (!seen.has(id)) seen.set(id, tile)
  }
  // Build the irregular rank map in first-seen order.
  const irregularRank = new Map<string, number>()
  for (const id of seen.keys()) {
    if (id.includes('i:')) irregularRank.set(id, irregularRank.size)
  }
  const out: TileTypeInfo[] = []
  for (const [id, tile] of seen) {
    const sides = tile.kind === 'regular' ? tile.sides : tile.vertices.length
    out.push({ id, sides, label: tileTypeLabel(id, irregularRank) })
  }
  return out
}

/**
 * Q15 — lazy, additive figure seeding. For every distinct `tileTypeId` in
 * any Cell of the Patch that isn't already in `figures`, copy the default
 * config in. Existing entries are never modified or removed (orphans are
 * retained on tile delete so re-placing the same shape restores the user's
 * tuning).
 */
export function seedFiguresForEditor(
  figures: Record<string, FigureConfig>,
  patch: EditorPatch,
  extraTiles: EditorTile[] = [],
): Record<string, FigureConfig> {
  let out = figures
  let changed = false
  const seed = (tile: EditorTile) => {
    const id = tileTypeIdFor(tile)
    if (id in out) return
    if (!changed) { out = { ...figures }; changed = true }
    out[id] = { ...DEFAULT_EDITOR_FIGURE }
  }
  for (const cell of patch.cells) {
    for (const tile of cell.tiles) seed(tile)
  }
  // Frame-scoped completion Tiles (world space, off-lattice) carry their own
  // tile types — seed them too so PIC has a recipe and Strands reach the edge.
  for (const tile of extraTiles) seed(tile)
  return out
}
