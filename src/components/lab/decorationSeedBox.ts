import type { EditorConfig } from '../../types/editor'
import { pointsBBox, type WorldBBox } from '../../decoration/gradients'
import { frameOutlinePolygon } from '../../editor/frame'
import { compositionToPolygons } from '../../editor/compositionLattice'
import { editorTilesToPolygons } from '../../editor/buildEditorPolygons'

/**
 * The world bbox a freshly seeded across-frame / strand gradient spans.
 *
 * Substrate-specific, so it is injected into `DecorationPanel` rather than
 * derived there: a Builder Patch has finite world content to measure, while a
 * legacy substrate is an infinite field whose only honest extent is what the
 * user can currently see (the Lab passes its view bounds).
 */

/** A Patch's extent: its Frame outline when it has one, else its Tiles.
 *  Null for a degenerate Patch with nothing in it — the caller's gradient
 *  toggle then stays inert rather than seeding a zero-size axis. */
export function patchSeedBBox(editor: EditorConfig): WorldBBox | null {
  if (editor.frame) {
    const outline = frameOutlinePolygon(editor.frame)
    const b = outline ? pointsBBox(outline) : null
    if (b) return b
  }
  const polys = editor.cells.length > 1
    ? compositionToPolygons(editor)
    : editor.cells.flatMap(c => editorTilesToPolygons(c))
  return pointsBBox(polys.flatMap(p => p.vertices))
}
