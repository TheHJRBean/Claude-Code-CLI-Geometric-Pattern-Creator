import type { EditorCell, EditorPatch, EditorRegularTile } from '../types/editor'

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
 * Edge length a new placement should use so it tessellates with the Cell's
 * existing Tiles.
 *
 * In a **single-cell** Patch the Seed Tile is created at `patch.edgeLength`
 * and the boundary-size slider only rescales `boundarySize`, so this just
 * returns `patch.edgeLength` — no behaviour change.
 *
 * In a **multi-cell** Patch the boundary-size slider repurposes
 * `patch.edgeLength` as the *lattice constant* (it grows the lattice while the
 * Tiles stay fixed — see `SET_CELL_BOUNDARY_SIZE`). Sizing placements to
 * `patch.edgeLength` there makes them the lattice size, far larger than the
 * actual Tiles. So we size to the Cell's own Tiles: the Seed Tile's edge
 * length (or any regular Tile's). For an EMPTY Cell (No-Seed flow) pass
 * `siblingCells` — the other Cells' Tiles keep the Patch's true Tile scale,
 * whereas `patch.edgeLength` is the drifted lattice constant (the oversize
 * bug the b3a4c09/a171058 convention fixed, reintroduced for that one flow).
 * `patch.edgeLength` remains the last resort (single-cell, or all-empty).
 */
export function cellPlacementEdgeLength(
  cell: EditorCell,
  patchEdgeLength: number,
  siblingCells?: EditorCell[],
): number {
  const regularOf = (c: EditorCell) =>
    c.tiles.find((t): t is EditorRegularTile => t.kind === 'regular' && t.source === 'seed')
      ?? c.tiles.find((t): t is EditorRegularTile => t.kind === 'regular')
  const own = regularOf(cell)
  if (own) return own.edgeLength
  if (siblingCells) {
    for (const c of siblingCells) {
      if (c.id === cell.id) continue
      const sibling = regularOf(c)
      if (sibling) return sibling.edgeLength
    }
  }
  return patchEdgeLength
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
