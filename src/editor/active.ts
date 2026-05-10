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
  return editor
}

export function allPatches(editor: EditorConfig): EditorPatch[] {
  return [editor]
}

/**
 * Immutable update: replace the editor's active patch with `patch`. Today
 * this is a flat top-level merge that preserves `version`; once composition
 * lands it'll route the new patch into `composition.tiles[active].patch`.
 */
export function withActivePatch(editor: EditorConfig, patch: EditorPatch): EditorConfig {
  return { ...patch, version: editor.version }
}
