import type { EditorConfig, EditorPatch } from '../types/editor'

/**
 * Adapter layer between the wrapper `EditorConfig` and the per-patch
 * `EditorPatch` that geometry helpers (boundary cycles, exposed edges,
 * placement, complete, autoComplete, orbit, lattice, tileTypes, etc.)
 * actually operate on.
 *
 * Today the wrapper is a single patch — `activePatch` returns the editor
 * itself. When boundary configurations land (the 4.8.8 work in flight),
 * `EditorConfig` will gain an optional `composition` field whose active
 * `BoundaryTile.patch` is the editing target. Callers that go through this
 * module never read inert top-level fields when composition is set; callers
 * that bypass it will silently operate on the wrong patch. Treat
 * `activePatch` / `allPatches` / `withActivePatch` as the authoritative
 * surface for patch-shaped reads and writes.
 */

export function activePatch(editor: EditorConfig): EditorPatch {
  if (editor.composition) {
    const c = editor.composition
    const t = c.tiles.find(t => t.id === c.activeTileId)
    if (t) return t.patch
  }
  return editor
}

export function allPatches(editor: EditorConfig): EditorPatch[] {
  if (editor.composition) return editor.composition.tiles.map(t => t.patch)
  return [editor]
}

/**
 * Immutable update: replace the editor's active patch with `patch`. Routes
 * the new patch into `composition.tiles[active].patch` when composition is
 * set; otherwise it's a flat top-level merge. The wrapper's per-patch
 * fields (boundaryShape, tiles, etc.) mirror the active patch so legacy
 * single-shape readers stay coherent.
 */
export function withActivePatch(editor: EditorConfig, patch: EditorPatch): EditorConfig {
  if (editor.composition) {
    const c = editor.composition
    const nextTiles = c.tiles.map(t =>
      t.id === c.activeTileId ? { ...t, patch } : t,
    )
    return {
      version: editor.version,
      ...patch,
      composition: { ...c, tiles: nextTiles },
    }
  }
  return { ...patch, version: editor.version }
}
