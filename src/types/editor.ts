import type { Vec2 } from '../utils/math'
import type { StrandLineStyle } from './pattern'

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
export type ConfigurationId = '4.8.8' | '3.12.12' | '4.6.12' | '3.6.3.6' | '3.4.6.4' | '3.3.3.4.4'

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
 * Step 17 Framing — Frame *type*. There is a single noun, **Frame**
 * (CONTEXT.md), distinguished by its type:
 * - `'shape'`  — an imposed geometric outline (square / hexagon / octagon;
 *   `aspect` ≠ 1 gives the √2 rectangle). Doubles as a *completion boundary*:
 *   the pattern is tiled out to the edge with **Frame nodes** spaced one seed
 *   `edgeLength` apart; hard clip is the fallback.
 * - `'n-ring'` — N shells of neighbouring Patch stamps; clip-only (no gap).
 */
export type FrameType = 'shape' | 'n-ring'

/** Outline shape of a `'shape'`-type Frame. The √2 rectangle is `'square'`
 * with `aspect = √2`. */
export type FrameShape = 'square' | 'pentagon' | 'hexagon' | 'octagon'

/** How the pattern meets a Shape Frame's edge: tiled out to it, or clipped. */
export type FrameBoundaryTreatment = 'complete' | 'clip'

/**
 * Decorative border stroke drawn along the Frame outline (set from the
 * Decoration panel — this is the "border styling defers to Decoration" slot
 * ADR-0004 reserved). When enabled it replaces the editor's accent guide
 * line. `width` is in world units so the border scales with the pattern.
 */
export interface FrameStroke {
  enabled: boolean
  /** CSS colour of the border stroke. */
  colour: string
  /** Stroke width in world units (matches Strand width semantics). */
  width: number
  /** Stroke style, same vocabulary as Strands (`StrandStyle.lineStyle`).
   * Double/Triple cut the centre out with a mask so the pattern shows
   * through between the parallel lines. Default solid. */
  lineStyle?: StrandLineStyle
}

/**
 * Step 17 Framing — the **Frame** wrapped around the Composition in the
 * Framing Phase. Lives on `PatternConfig.editor` (Builder-only). Optional;
 * absent ⇒ no Frame. Structural only (ADR-0004): geometry lives here, border
 * *styling* defers to Decoration.
 */
export interface FrameConfig {
  type: FrameType
  /** Frame centre in world coordinates. Default `(0, 0)` (`frameOrigin`). */
  origin?: Vec2
  // ── Shape frames ──
  /** Outline shape. */
  shape?: FrameShape
  /** Half-extent in world units (centre → edge before aspect/rotation). */
  size?: number
  /** Width/height aspect ratio. `1` = regular; `√2` = A-series rectangle. */
  aspect?: number
  /** Rotation in radians about `origin`. */
  rotation?: number
  /** How the pattern meets the edge. Default `'complete'`. */
  boundaryTreatment?: FrameBoundaryTreatment
  /** Frame-scoped boundary-completion Tiles, in world space. NOT Cell Tiles —
   * they don't repeat under the **Lattice**. Populated by completion-to-frame. */
  completedTiles?: EditorTile[]
  /** Decorative border stroke along the outline (Decoration styling). */
  stroke?: FrameStroke
  // ── n-ring frames ──
  /** Number of Patch-stamp shells (≥ 1). */
  rings?: number
}

/**
 * Step 19 — Decoration Phase **Grouping scope** (CONTEXT.md, ADR-0005).
 *
 * The rung deciding how many targets share one colour, coarse → fine:
 * - `'congruent'` — every same-shape target, anywhere (Stage 1).
 * - `'patch'`     — targets at the same position in the Patch repeat unit
 *                   (Lattice orbit). *Stage 2.*
 * - `'cell'`      — targets within a Cell, grouped by that Cell's symmetry
 *                   orbit. *Stage 2.*
 * - `'instance'`  — one specific target, no grouping. *Stage 3.*
 *
 * Stage 1 only ever emits `'congruent'`; the others are reserved so the
 * schema doesn't change when the later rungs land.
 */
export type GroupingScope = 'congruent' | 'patch' | 'cell' | 'instance'

/**
 * Step 19 — one Decoration colour assignment (ADR-0005). The same shape backs
 * every rung of the **Grouping scope** ladder; only the meaning of `key`
 * changes per `scope`. Because `key` is *identity* (not a world position),
 * colours stay stable as the field pans (which is what lets Decoration run
 * over a viewport bound, not only a **Frame**).
 */
export interface ColourRecord {
  /** Which Grouping-scope rung this assignment binds at. Stage 1 = `'congruent'`. */
  scope: GroupingScope
  /**
   * Identity key, interpreted per `scope`:
   * - `congruent` → a stable shape signature (`'*'` for "all strands");
   * - `patch`     → Lattice-orbit id   (Stage 2);
   * - `cell`      → Cell-symmetry-orbit id (Stage 2);
   * - `instance`  → world-space id     (Stage 3).
   */
  key: string
  /** CSS colour string applied to every target in this group. For Strand
   * records the sentinel `'none'` HIDES the group's strands (no stroke), so
   * removed strand paint leaves the touching Void fills meeting seamlessly
   * instead of reverting to the global strand colour as a band between them. */
  colour: string
}

/**
 * Step 19 — the Builder **Decoration** Phase's data (ADR-0005). Lives on
 * `EditorConfig.decoration` (Builder-only; the Gallery is not decorated).
 * Optional; absent ⇒ no decoration (Strands fall back to the global
 * `StrandStyle`, Voids show the canvas background).
 *
 * Two independently-scoped targets: **Strand colour** and **Void Fill**. Both
 * are ladder-ready `ColourRecord[]`; Stage 1 populates only `scope: 'congruent'`
 * entries (`strandColours` has at most one `key: '*'` record; `voidFills` has
 * one record per painted congruent Void shape signature).
 */
export interface DecorationConfig {
  /** Inner schema version for the decoration block. */
  version: 1
  /** Strand-colour assignments. Overrides `PatternConfig.strand.color` for
   * Builder render when a matching record exists. */
  strandColours: ColourRecord[]
  /** Void-fill assignments, keyed by Void shape signature in Stage 1. */
  voidFills: ColourRecord[]
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
  /** Step 17 Framing — the **Frame** wrapping the Composition. Optional;
   * absent ⇒ no Frame. Set in the Framing Phase. */
  frame?: FrameConfig
  /** Step 19 — Decoration Phase colour assignments (ADR-0005). Optional;
   * absent ⇒ no decoration. Builder-only. */
  decoration?: DecorationConfig
  /**
   * Gallery↔Lab convergence (ADR-0006) — provenance marker for Patches
   * produced by preset conversion (`editor/presetConversion.ts`). Carries the
   * source preset's tiling id (e.g. `"4.8.8"`, `"hexagonal"`). Drives the
   * one-time "editing a copy of a preset" note and the Presets-shelf
   * provenance badge. Absent on user-authored Patches.
   */
  presetId?: string
  /**
   * Multi-cell "Alternate orientation": when true, the whole Patch is rotated
   * *rigidly* by a Configuration-specific angle (`compositionAlternateAngle`) —
   * every Cell, the lattice basis, the boundary outlines, and the Design-Phase
   * picker overlays turn together. This is the composite analogue of the
   * single-cell per-Cell `EditorCell.alternateBoundary` flip; single-cell
   * Patches leave this absent and use the per-Cell flag instead. Optional for
   * back-compat. */
  alternateOrientation?: boolean
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
