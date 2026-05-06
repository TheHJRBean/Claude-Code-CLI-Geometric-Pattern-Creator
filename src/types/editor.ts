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

export type BoundaryShape = 'triangle' | 'square' | 'hexagon'

/**
 * Provenance of a tile inside the patch.
 *
 * Decision 12 says completed tiles are first-class polygons with the same
 * data model as user-placed tiles, so we keep them in a single array and
 * track origin as a discriminator. `'origin'` marks the auto-placed centre
 * polygon (Decision 6); `'placed'` is a manual user placement; `'completed'`
 * came from the Complete operation (Decisions 9–12).
 */
export type EditorTileOrigin = 'origin' | 'placed' | 'completed'

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
  origin: EditorTileOrigin
}

/**
 * Irregular tile (bowtie, kite, etc.) produced by Complete when no regular
 * polygon fits the gap (Decision 10). Vertices in CCW order.
 */
export interface EditorIrregularTile {
  id: string
  kind: 'irregular'
  vertices: Vec2[]
  origin: 'completed'
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

export interface EditorConfig {
  /** Inner schema version. Bumped independently of the outer storage envelope. */
  version: 1
  boundaryShape: BoundaryShape
  /** Lattice cell size in world units (Q9 Option B: rescales the cell only). */
  boundarySize: number
  /** Side count of the auto-placed origin polygon (Decision 6). */
  originSides: number
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
  tiles: EditorTile[]
}
