import type { PatternConfig } from '../types/pattern'

/**
 * The Canvas flags that render a saved pattern as its *finished artifact* —
 * shared by the Gallery detail view and the offscreen thumbnail renderer so the
 * two can never drift (thumbnail == detail == what the Lab would show).
 *
 * - Editor saves render on the Builder path in Composition (Strands woven),
 *   with Decoration layered when the save carries any, and the Shape/n-ring
 *   Frame when it has one.
 * - Legacy BFS/Taprats saves render the plain field with Strands on; Canvas
 *   clips them to their Gallery Frame internally. Tile outlines stay off to
 *   match the Gallery's default look.
 *
 * Everything here is read-only: passing no selection / placement / paint
 * callbacks to Canvas leaves it a viewer (no editor or paint overlays).
 */
export interface FaithfulRenderFlags {
  showTileLayer: boolean
  showLines: boolean
  editorStrandMode: boolean
  decorationActive: boolean
  editorFrame: boolean
}

export function faithfulRenderFlags(config: PatternConfig): FaithfulRenderFlags {
  if (config.tiling.type === 'editor' && config.editor) {
    return {
      showTileLayer: true,
      showLines: true,
      editorStrandMode: true,
      decorationActive: !!config.editor.decoration,
      editorFrame: !!config.editor.frame,
    }
  }
  return {
    showTileLayer: false,
    showLines: true,
    editorStrandMode: false,
    decorationActive: false,
    editorFrame: false,
  }
}
