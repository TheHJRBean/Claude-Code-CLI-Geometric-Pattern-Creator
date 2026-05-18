import type { Vec2 } from '../utils/math'

/**
 * Step 17 — user-editable tessellation editor data model (v3).
 *
 * Authoritative schema for an editor **Patch**. Lives on `PatternConfig.editor`
 * (Q13 resolution: Option C) and round-trips through `lab-tessellations-v1`
 * localStorage and `saveJSON` / `loadJSON`.
 *
 * `version` is the inner schema version for `EditorConfig` itself; future
 * shape changes bump it and migrate without touching the outer
 * `lab-tessellations-v1` envelope.
 *
 * **Vocabulary anchor** (see CONTEXT.md):
 * - A **Patch** is one repeat unit of the tiled output. Always contains one
 *   or more **Cells**.
 * - A **Cell** is one polygon within the Patch — carries its own **Boundary**
 *   shape, size, rotation, and the user-authored **Tiles** inside it.
 * - A **Tile** is a regular or irregular polygon placed (or auto-completed)
 *   inside a Cell.
 *
 * **Schema history**:
 * - v1 (legacy): single-shape patches with `tiles[]` directly on the patch.
 * - v2: added optional `composition` field with `BoundaryTile[]` for
 *   multi-tile boundary configurations (4.8.8 etc.).
 * - v3 (current, ADR-0001): uniform recursive shape — every Patch always
 *   carries `cells: EditorCell[]`. Single-cell Patches wrap their tiles
 *   in one Cell; multi-cell Patches list each Cell explicitly. Legacy v1
 *   and v2 shapes load through the migrator in `editor/migrations.ts`.
 */

/**
 * Shapes that can appear as a Cell boundary.
 *
 * Octagon and dodecagon are allowed in any Cell — multi-cell **Configurations**
 * like `"4.8.8"` use octagons and `"3.12.12"` / `"4.6.12"` use dodecagons.
 * (Single-cell Patches restrict to triangle, square, hexagon at the picker
 * level; octagon and dodecagon don't tile by translation alone.)
 */
export type CellShape = 'triangle' | 'square' | 'hexagon' | 'octagon' | 'dodecagon'

/**
 * Legacy alias kept for the (now narrow) migration code paths and any
 * external type-imports that haven't migrated yet. Prefer **CellShape** in
 * new code.
 */
export type BoundaryShape = CellShape

/**
 * Source of a Tile inside a Cell (CONTEXT.md: "Tile source").
 *
 * Decision 12 says completed Tiles are first-class polygons with the same
 * data model as user-placed Tiles, so we keep them in a single array and
 * track source as a discriminator. `'seed'` marks the auto-placed Seed
 * Tile that the Builder drops into a Cell so the user has something to
 * start from (Decision 6); `'placed'` is a manual user placement;
 * `'completed'` came from the Complete operation (Decisions 9–12).
 */
export type TileSource = 'seed' | 'placed' | 'completed'

export interface EditorRegularTile {
  id: string
  kind: 'regular'
  /** Side count (≥ 3). */
  sides: number
  /** Centre in patch-local world coordinates (origin = Cell centre). */
  center: Vec2
  /** Edge length in world units. All regular placements share `EditorPatch.edgeLength`. */
  edgeLength: number
  /** Rotation in radians; with rotation 0, vertex 0 lies on the +x axis. */
  rotation: number
  source: TileSource
}

/**
 * Irregular Tile (bowtie, kite, etc.) produced by Complete when no regular
 * polygon fits the gap (Decision 10). Vertices in CCW order.
 */
export interface EditorIrregularTile {
  id: string
  kind: 'irregular'
  vertices: Vec2[]
  source: 'completed'
}

export type EditorTile = EditorRegularTile | EditorIrregularTile

/**
 * Step 17.7 — auto-complete-on-phase-switch settings (Decision 11).
 *
 * Auto-complete repeatedly fills concave dents on a Cell's Boundary cycle
 * until the cycle is convex. Auto-completed Tiles persist as first-class
 * `'completed'` Tiles per Decision 16 — they are editable on phase-switch
 * back to Design.
 *
 * Patch-level: applies to every Cell when phase-switching to Composition.
 */
export interface EditorAutoCompleteSettings {
  enabled: boolean
}

/**
 * Step 17.4 (re-enabled) — subgroup of a Cell's Boundary dihedral symmetry
 * group that placements + deletes propagate under. `'none'` reproduces the
 * 17.3 single-edge behaviour and is the default for back-compat.
 *
 * - `'full'`     — the full dihedral group D_n (n rotations + n reflections).
 * - `'rotation'` — n rotations only (C_n), no mirrors.
 * - `'vertical'` — identity + reflection across the vertical axis.
 * - `'horizontal'`— identity + reflection across the horizontal axis.
 *                  Triangle has no horizontal mirror axis; the picker
 *                  disables this option for triangle Cells.
 * - `'none'`     — identity only (single-edge placement + delete).
 */
export type SymmetryMode = 'full' | 'rotation' | 'vertical' | 'horizontal' | 'none'

/**
 * Identifier for a multi-cell **Configuration** (CONTEXT.md). Extend when
 * adding more. Single-cell Patches don't carry one.
 */
export type ConfigurationId = '4.8.8' | '3.12.12' | '4.6.12' | '3.6.3.6' | '3.4.6.4'

/**
 * A single Cell within a Patch. Carries its own Boundary shape, size,
 * rotation, and the Tiles authored against it. In multi-cell Patches the
 * `center` + `rotation` place the Cell within the Patch's lattice cell.
 */
export interface EditorCell {
  /** Stable identifier within the Patch. `'main'` for the lone Cell in a
   * single-cell Patch; `'octagon'` / `'square'` etc. for multi-cell. */
  id: string
  /** Outline shape of this Cell's Boundary. */
  shape: CellShape
  /** Cell centre in patch-local world coordinates. `(0, 0)` for the lone
   * Cell of a single-cell Patch; non-zero for non-origin Cells of a
   * multi-cell Patch. */
  center: Vec2
  /** Local rotation of this Cell's Boundary outline within the Patch.
   * Single-cell defaults to 0; multi-cell Cells can have any rotation
   * (e.g. 4.8.8 square Cell sits at π/4 so its edges align with the
   * octagon Cell's diagonals). */
  rotation: number
  /** Lattice cell size in world units (Q9 Option B: rescales the Cell only). */
  boundarySize: number
  /** Side count of the auto-placed Seed Tile (Decision 6). */
  seedSides: number
  /** Tiles authored against this Cell. The first Tile is the Seed Tile
   * (`source: 'seed'`); subsequent are `'placed'` or `'completed'`. */
  tiles: EditorTile[]
  /**
   * When true, the Boundary outline (and its lattice basis in Composition
   * Phase) is rotated by π/n — the "alternate" orientation. For a square
   * that's the diamond ↔ axis-aligned flip; for a hexagon point-up ↔
   * flat-top; for a triangle point-up ↔ point-down. Optional for
   * back-compat.
   */
  alternateBoundary?: boolean
  /**
   * Subgroup of the Boundary's symmetry group that `EDITOR_PLACE_TILE_ON_EDGE`
   * and `EDITOR_DELETE_TILE` propagate under (Step 17.4 re-enable). Optional;
   * defaults to `'none'` (single-edge placement, the 17.3 behaviour) on read
   * of legacy patches.
   */
  symmetryMode?: SymmetryMode
  /**
   * When true, the Cell starts empty (no Seed Tile) and must be built from
   * the boundary inward via `EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION` (or via
   * Complete picking boundary corners). Toggle is refused while the Cell
   * holds any non-Seed Tile — mirrors the existing Seed-sides lock pattern.
   * Optional for back-compat; absent / `false` keeps the legacy Seed.
   */
  noSeed?: boolean
  /**
   * When true, `boundarySize` auto-fits to the Cell in Design Phase after any
   * Tile mutation — the Boundary polygon hugs the convex hull of all Tile
   * vertices. Optional for back-compat. Manually dragging the boundary-size
   * slider turns this off.
   */
  wrapBoundary?: boolean
}

/**
 * A Patch — one repeat unit of the tiled Composition. Always carries one or
 * more **Cells** (ADR-0001: every Patch always has Cells). The Patch level
 * holds the shared **Lattice** edge length, the active-Cell pointer for
 * Design Phase, and the optional multi-cell **Configuration** id.
 */
export interface EditorPatch {
  /** Cells composing this Patch. Always non-empty. Length 1 = single-cell;
   * length ≥ 2 = multi-cell Configuration. */
  cells: EditorCell[]
  /** Which Cell the user is currently editing in Design Phase. Switching
   * Cells is a UI pane swap, not a design mutation — excluded from the
   * undo stack. */
  activeCellId: string
  /** Edge length shared by every Cell — drives the Lattice basis that
   * stamps this Patch across the canvas in Composition Phase. */
  edgeLength: number
  /** The multi-cell **Configuration** this Patch implements (e.g. `"4.8.8"`).
   * Absent on single-cell Patches. */
  configuration?: ConfigurationId
  /** Auto-complete-on-phase-switch settings (Step 17.7). Optional for
   * back-compat; absent / `enabled: false` means phase-switching to
   * Composition never mutates Tiles. Patch-level (applies to every Cell). */
  autoComplete?: EditorAutoCompleteSettings
}

export interface EditorConfig extends EditorPatch {
  /** Inner schema version. Bumped independently of the outer storage envelope. */
  version: 3
}

/**
 * Legacy v2 shape kept for the migration code path. Composition was the v2
 * wrapper around per-Cell patches; in v3 each `BoundaryTile` collapses into
 * one `EditorCell`. Do not use in new code.
 *
 * @deprecated v2 only — read by the migrator, never produced by current code.
 */
export interface BoundaryComposition {
  configurationId: ConfigurationId
  edgeLength: number
  activeTileId: string
  tiles: BoundaryTile[]
}

/**
 * Legacy v2 shape kept for the migration code path. v2 wrapped each per-Cell
 * patch as a `BoundaryTile` carrying its own `EditorPatch` (which had the
 * shape now held by `EditorCell`).
 *
 * @deprecated v2 only — read by the migrator, never produced by current code.
 */
export interface BoundaryTile {
  id: string
  shape: CellShape
  center: Vec2
  rotation: number
  patch: V2InnerPatch
}

/**
 * Legacy v2 per-Cell patch shape. Kept only for the migrator. v3 holds these
 * fields on `EditorCell` directly.
 *
 * @deprecated v2 only — read by the migrator, never produced by current code.
 */
export interface V2InnerPatch {
  boundaryShape: CellShape
  boundarySize: number
  seedSides: number
  edgeLength: number
  tiles: EditorTile[]
  alternateBoundary?: boolean
  autoComplete?: EditorAutoCompleteSettings
  wrapBoundary?: boolean
  symmetryMode?: SymmetryMode
  noSeed?: boolean
}
