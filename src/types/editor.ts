import type { Vec2 } from '../utils/math'

/**
 * Step 17 — user-editable tessellation editor data model.
 *
 * Authoritative schema for an editor patch. Lives on `PatternConfig.editor`
 * (Q13 resolution: Option C) and round-trips through `lab-tessellations-v1`
 * localStorage and `saveJSON` / `loadJSON`.
 *
 * `version` is the inner schema version for `EditorConfig` itself; future
 * shape changes bump it and migrate without touching the outer
 * `lab-tessellations-v1` envelope.
 */

/**
 * Shapes that can appear as a patch boundary. `'octagon'` is reserved for
 * the multi-tile composition path (e.g. inside a 4.8.8 boundary tile) — it
 * doesn't tile by translation alone, so the migration / picker keeps it out
 * of single-shape patches at the top level (validated in `migrations.ts`
 * and `TessellationLabMode.tsx`).
 */
export type BoundaryShape = 'triangle' | 'square' | 'hexagon' | 'octagon'

/**
 * Source of a Tile inside the Patch (CONTEXT.md: "Tile source").
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
  /** Centre in patch-local world coordinates (origin = boundary centre). */
  center: Vec2
  /** Edge length in world units. All regular placements share `EditorConfig.edgeLength`. */
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
 * Step 17.7 — auto-complete-on-flip settings (Decision 11).
 *
 * Auto-complete repeatedly fills concave dents on the patch's outer boundary
 * until the cycle is convex. Auto-completed tiles persist as first-class
 * `'completed'` tiles per Decision 16 — they are editable on flip-back to
 * Design.
 *
 * Boundary fitting (formerly the `match-boundary` flavour) is now its own
 * design-mode mode: `EditorConfig.wrapBoundary`.
 */
export interface EditorAutoCompleteSettings {
  enabled: boolean
}

/**
 * Step 17.4 (re-enabled) — subgroup of the boundary's dihedral symmetry
 * group that placements + deletes propagate under. `'none'` reproduces the
 * 17.3 single-edge behaviour and is the default for back-compat.
 *
 * - `'full'`     — the full dihedral group D_n (n rotations + n reflections).
 * - `'rotation'` — n rotations only (C_n), no mirrors.
 * - `'vertical'` — identity + reflection across the vertical axis.
 * - `'horizontal'`— identity + reflection across the horizontal axis.
 *                  Triangle has no horizontal mirror axis; the picker
 *                  disables this option for triangle boundaries.
 * - `'none'`     — identity only (single-edge placement + delete).
 */
export type SymmetryMode = 'full' | 'rotation' | 'vertical' | 'horizontal' | 'none'

/**
 * The per-patch fields shared between a single-shape `EditorConfig` and a
 * multi-tile boundary configuration's per-tile patch (added in a later phase).
 * Helpers that operate on "the boundary + its interior tiles" take an
 * `EditorPatch`; the wrapper (`EditorConfig`) carries the schema `version`
 * and (eventually) a `composition` field. `EditorConfig extends EditorPatch`,
 * so existing call sites passing `EditorConfig` continue to type-check.
 */
export interface EditorPatch {
  boundaryShape: BoundaryShape
  /** Lattice cell size in world units (Q9 Option B: rescales the cell only). */
  boundarySize: number
  /** Side count of the auto-placed Seed Tile (Decision 6). */
  seedSides: number
  /** Global edge length for all regular placements (Decision 14, locked at origin time). */
  edgeLength: number
  /**
   * When true, the boundary outline (and its lattice basis in strand mode)
   * is rotated by π/n — the "alternate" orientation. For a square that's
   * the diamond ↔ axis-aligned flip; for a hexagon point-up ↔ flat-top;
   * for a triangle point-up ↔ point-down. Optional for back-compat.
   */
  alternateBoundary?: boolean
  /**
   * Auto-complete-on-flip settings (Step 17.7). Optional for back-compat;
   * absent / `enabled: false` means flipping to Strand never mutates tiles.
   */
  autoComplete?: EditorAutoCompleteSettings
  /**
   * When true, `boundarySize` auto-fits to the patch in Design mode after any
   * tile mutation — the boundary polygon hugs the convex hull of all tile
   * vertices. Optional for back-compat. Manually dragging the boundary-size
   * slider turns this off.
   */
  wrapBoundary?: boolean
  /**
   * Subgroup of the boundary's symmetry group that `EDITOR_PLACE_TILE_ON_EDGE`
   * and `EDITOR_DELETE_TILE` propagate under (Step 17.4 re-enable).
   * Optional; defaults to `'none'` (single-edge placement, the 17.3
   * behaviour) on read of legacy patches.
   */
  symmetryMode?: SymmetryMode
  /**
   * When true, the editor surfaces boundary-section click targets in addition
   * to the standard exposed-edge picker — see `editor/boundaryInward.ts` and
   * the idea memo `project_editor_boundary_inward_mode_idea.md`. Additive: the
   * origin tile and its exposed edges remain clickable in parallel. Optional
   * for back-compat; absent / `false` keeps the legacy centre-out flow.
   */
  boundaryInward?: boolean
  tiles: EditorTile[]
}

export interface EditorConfig extends EditorPatch {
  /** Inner schema version. Bumped independently of the outer storage envelope. */
  version: 2
  /**
   * When set, this patch is a multi-tile **boundary configuration** (e.g.
   * 4.8.8 = octagon + square). The single-tile fields above are inert in
   * this case — every consumer reading patch shape/tiles/symmetry must go
   * through `activePatch` / `allPatches` (see `src/editor/active.ts`).
   * Absent on single-shape patches (the legacy and v1 default).
   */
  composition?: BoundaryComposition
}

/**
 * A unit cell of a multi-tile boundary configuration. The configuration's
 * lattice tiles by translation; rendering stamps the whole cell across the
 * viewport via `compositionLatticeStamps`. Each `BoundaryTile` carries its
 * own authored interior patch (`EditorPatch`).
 *
 * v1 ships a single configuration: `4.8.8` (truncated square: octagon at
 * cell origin + square at cell-centre, rotated π/4). Future configurations
 * (3.12.12, 4.6.12, 3.4.6.4, …) slot in by extending `configurationId`.
 */
export interface BoundaryComposition {
  configurationId: '4.8.8'
  /** Edge length shared by every boundary tile in the cell — the value the
   * cell-lattice basis is computed from. Replaces the per-patch `boundarySize`
   * for composition layouts. */
  edgeLength: number
  /** Which boundary tile the user is currently editing in Design mode.
   * Strand mode renders all tiles together regardless. Switching tiles is a
   * UI pane swap, not a design mutation — excluded from the undo stack. */
  activeTileId: string
  tiles: BoundaryTile[]
}

export interface BoundaryTile {
  /** Stable identifier within the composition (e.g. `'octagon'`, `'square'`). */
  id: string
  /** Outline shape of this boundary tile. May include `'octagon'` etc. */
  shape: BoundaryShape
  /** Position of this tile's centre within the unit cell (in world units). */
  center: Vec2
  /** Local rotation of this tile's boundary outline within the cell. For
   * 4.8.8: octagon rotation 0 (uses BOUNDARY_ROTATION default — flat-top);
   * square rotation π/4 (diamond, so its edges align with the octagon's
   * diagonal edges). */
  rotation: number
  /** The authored interior — an `EditorPatch` exactly like a single-shape
   * patch, with its own tiles, symmetryMode, edgeLength, etc. */
  patch: EditorPatch
}
