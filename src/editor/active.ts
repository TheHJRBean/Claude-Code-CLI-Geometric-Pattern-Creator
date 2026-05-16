import type { EditorCell, EditorPatch } from '../types/editor'

/**
 * Adapter helpers for selecting the active **Cell** inside a **Patch**.
 *
 * Most editor geometry helpers (boundary cycles, exposed edges, placement,
 * Complete, autoComplete, orbit, lattice, tileTypes, etc.) operate on a
 * single Cell at a time — they take an `EditorCell` directly. The reducer
 * routes Design-Phase mutations through these helpers so the right Cell is
 * the mutation target.
 *
 * Replaces the v2-era `activePatch` / `allPatches` / `withActivePatch`
 * helpers, which routed between a wrapper `EditorConfig` and per-patch
 * shapes. v3 collapses that distinction: every Patch always carries
 * `cells: EditorCell[]` (see ADR-0001).
 */

export function activeCell(patch: EditorPatch): EditorCell {
  const cell = patch.cells.find(c => c.id === patch.activeCellId)
  if (cell) return cell
  // Defensive: if `activeCellId` is stale, fall back to the first Cell so
  // callers always get something rather than crashing.
  return patch.cells[0]
}

export function allCells(patch: EditorPatch): EditorCell[] {
  return patch.cells
}

/**
 * Immutable update: replace the Patch's active Cell with `cell`. Returns a
 * fresh Patch with the rest of the cells array preserved.
 */
export function withActiveCell(patch: EditorPatch, cell: EditorCell): EditorPatch {
  return {
    ...patch,
    cells: patch.cells.map(c => c.id === patch.activeCellId ? cell : c),
  }
}

/**
 * Multi-cell convenience: replace a specific Cell by id. Used by Complete
 * flows that touch every Cell of a Configuration rather than just the
 * active one.
 */
export function withCellById(patch: EditorPatch, id: string, cell: EditorCell): EditorPatch {
  return {
    ...patch,
    cells: patch.cells.map(c => c.id === id ? cell : c),
  }
}
