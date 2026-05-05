import type { TileTypeInfo } from '../types/tiling'
import type { FigureConfig } from '../types/pattern'
import type { EditorConfig, EditorTile } from '../types/editor'
import { tileTypeIdFor, tileTypeLabel } from './tileTypeId'

/**
 * Q15 resolution — the default `FigureConfig` lazily seeded for every new
 * tile type that appears in an editor patch. Star figures with a 60° contact
 * angle and auto-strand-length match the Lab archimedean defaults so a fresh
 * patch's strands look immediately reasonable.
 */
export const DEFAULT_EDITOR_FIGURE: FigureConfig = {
  type: 'star',
  contactAngle: 60,
  lineLength: 1.0,
  autoLineLength: true,
}

/**
 * Walk the editor's tiles and produce one `TileTypeInfo` per distinct
 * `tileTypeId`. Order: by first appearance, so the strand panel reads
 * top-to-bottom in placement order.
 *
 * Irregular labels follow Q11's "Irregular A/B/C…" scheme — assigned by
 * first-seen rank within the patch's distinct irregular set.
 */
export function editorTileTypes(editor: EditorConfig): TileTypeInfo[] {
  const seen = new Map<string, EditorTile>()
  for (const tile of editor.tiles) {
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
 * the patch that isn't already in `figures`, copy the default config in.
 * Existing entries are never modified or removed (orphans are retained on
 * tile delete so re-placing the same shape restores the user's tuning).
 */
export function seedFiguresForEditor(
  figures: Record<string, FigureConfig>,
  editor: EditorConfig,
): Record<string, FigureConfig> {
  let out = figures
  let changed = false
  for (const tile of editor.tiles) {
    const id = tileTypeIdFor(tile)
    if (id in out) continue
    if (!changed) { out = { ...figures }; changed = true }
    out[id] = { ...DEFAULT_EDITOR_FIGURE }
  }
  return out
}
