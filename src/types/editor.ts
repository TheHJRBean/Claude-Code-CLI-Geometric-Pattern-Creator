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
export type ConfigurationId = '4.8.8' | '3.12.12' | '4.6.12' | '3.6.3.6' | '3.4.6.4' | '3.3.3.4.4' | '3.3.4.3.4' | '3.3.3.3.6'

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
  /** Fill colour painted in the centre gap of `double`/`triple` styles.
   * Absent ⇒ the gap stays cut out (the pattern shows through). */
  innerFill?: string
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

/** One colour stop of a `GradientSpec`. */
export interface GradientStop {
  /** Position along the gradient, 0..1. */
  offset: number
  /** CSS colour string. */
  colour: string
}

/** Soft cap on gradient stops (DECORATION_GRADIENTS_SPEC decision 2). */
export const GRADIENT_MAX_STOPS = 8

/**
 * A gradient fill (DECORATION_GRADIENTS_SPEC). Shared by per-shape Void
 * records (geometry in **canonical-pose** coordinates — `decoration/stamps.ts`
 * `canonicalPose`, so one spec lands consistently rotated/mirrored on every
 * congruent instance) and, in slice 2, the across-frame gradient (geometry in
 * **world** coordinates). Stops: min 2, soft cap `GRADIENT_MAX_STOPS`.
 */
export type GradientSpec =
  | { type: 'linear'; stops: GradientStop[]; start: Vec2; end: Vec2 }
  | { type: 'radial'; stops: GradientStop[]; centre: Vec2; radius: number }

/**
 * The single **across-frame** gradient (DECORATION_GRADIENTS_SPEC slice 2, #45).
 * ONE per composition, geometry in **world** coordinates. Rendered as the
 * default fill of every UNPAINTED Void (an underlay — painted groups cover it
 * because each Void resolves to exactly one fill: its paint spec, or this).
 * Off by default; `enabled: false` keeps the seeded geometry so re-enabling
 * doesn't reseed.
 */
export type FrameGradient = { enabled: boolean } & GradientSpec

/**
 * The single **strand gradient** (DECORATION_GRADIENTS_SPEC v2, #46). ONE
 * world-space gradient stroked across **every** Strand via a single
 * `userSpaceOnUse` def — a continuous colour wash flowing over the whole
 * strand field (spec V2 "one shared gradient definition"). Geometry in
 * **world** coordinates, exactly like `FrameGradient`. Off by default;
 * `enabled: false` keeps the seeded geometry so re-enabling doesn't reseed.
 * `scopeKey` (#46 follow-up) optionally narrows the wash to one Strand group
 * along the **Reach ladder** (`scope`); absent / `'*'` ⇒ every Strand (the
 * default global wash). Non-matching Strands keep their flat / record stroke.
 * `scope` names the rung the `scopeKey` binds at, mirroring the flat strand
 * colour ladder (`StrandPaintScope`): absent ⇒ `'congruent'` (a strand
 * signature — the #46 default and pre-ladder saves); `'cell'` ⇒ a
 * Cell-symmetry-orbit key (Twins); `'patch'` ⇒ a Lattice-orbit key (Single).
 * Membership is resolved by the same `resolveColour`/`buildColourIndex` the
 * flat ladder uses (see `StrandLayer.gradientOn`).
 */
export type StrandGradient = { enabled: boolean; scope?: GroupingScope; scopeKey?: string } & GradientSpec

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
  /** Optional gradient fill. When present it wins over `colour` at render;
   * `colour` stays as the representative flat colour (swatches, recents,
   * legacy fallback). Additive — absent ⇒ pre-gradient behaviour. */
  gradient?: GradientSpec
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
  /** Void **Stamp** assignments — an uploaded image clipped into every Void
   * the record's scope reaches (v1: `congruent` only, keyed by signature).
   * Optional + additive so decoration blocks without stamps stay version 1. */
  voidStamps?: VoidStampRecord[]
  /** Slice 2 (#45) — the single across-frame gradient underlay (world-space).
   * Optional + additive; absent ⇒ pre-slice-2 behaviour byte-identical. */
  frameGradient?: FrameGradient
  /** V2 (#46) — the single strand gradient (world-space) stroked across every
   * Strand. Optional + additive; absent ⇒ pre-v2 behaviour byte-identical. */
  strandGradient?: StrandGradient
}

/**
 * One Void **Stamp** assignment: an uploaded image (downscaled data-URL, so
 * it travels inside the saved config) placed in every Void the scope reaches,
 * clipped to the Void outline. The image is laid out in the Void's
 * **canonical pose** (see `decoration/stamps.ts`), so one record lands
 * consistently rotated/mirrored on every congruent instance — and a canvas
 * exported for the same signature round-trips at exactly the right size.
 */
export interface VoidStampRecord {
  /** Grouping-scope rung. v1 only emits `'congruent'`; the ladder is
   * reserved (mirrors `ColourRecord`). */
  scope: GroupingScope
  /** Identity key per scope — v1: the Void's congruent signature. */
  key: string
  /** Image as a data URL (compressed + downscaled at import). */
  image: string
  /** Natural pixel size of `image` — stored so render never has to load the
   * image to compute the fit transform. */
  width: number
  height: number
  /** How the image maps onto the canonical-pose bounding box: `cover` fills
   * the box and crops overflow (default), `contain` letterboxes. */
  fit: 'cover' | 'contain'
  /** Optional user adjustment on top of the base fit (Focus mode). Absent =
   * identity. Additive so pre-existing stamp records stay valid. */
  transform?: StampUserTransform
}

/**
 * User adjustment of how a stamp image sits inside its Void, expressed in
 * the Void's canonical pose so every congruent instance inherits it. Pan is
 * stored as fractions of the canonical bounding box (resolution-independent);
 * zoom and rotation act about the box centre.
 */
export interface StampUserTransform {
  /** Image offset as a fraction of the canonical box width (+x → right). */
  offsetX: number
  /** Image offset as a fraction of the canonical box height (+y → down). */
  offsetY: number
  /** Extra zoom on top of the cover/contain base fit (1 = no change). */
  scale: number
  /** Rotation in degrees about the canonical box centre. */
  rotation: number
}

/**
 * Guides (CONSTRUCTION_GUIDES_SPEC.md, ADR-0008) — compass-and-straightedge
 * scaffolding drawn in the Design-Phase **Construct** mode. Guides expose
 * **Anchors** (intersections / ticks / manual points) that join the Place +
 * Complete pickable set (slice 3); Guides produce Tiles, never pattern lines.
 *
 * How a Guide line extends beyond its drawn segment:
 * - `'none'`  — the finite two-click segment.
 * - `'start'` — infinite ray back through the start point.
 * - `'end'`   — infinite ray forward through the end point.
 * - `'both'`  — infinite line.
 */
export type GuideExtend = 'none' | 'start' | 'end' | 'both'

/**
 * A Guide line — two-click segment in Patch-local world coordinates.
 * The `EditorGuide` union also carries `EditorGuideCircle` (slice 2).
 */
export interface EditorGuideLine {
  /** Stable identifier within the Patch. */
  id: string
  kind: 'line'
  /** First-click endpoint, Patch-local world coords. */
  start: Vec2
  /** Second-click endpoint, Patch-local world coords. */
  end: Vec2
  /**
   * Stamp toggle (spec Decision 2), default OFF. OFF = one-off, world-space;
   * ON = Patch-relative, repeats in every Lattice stamp. Rendering under the
   * Lattice is slice 5 — this slice only persists the flag and shows it via
   * the fixed stamp/static system colours.
   */
  stamp: boolean
  /** Extension beyond the drawn segment. */
  extend: GuideExtend
  /**
   * Spaced-tick Anchors along the Guide (spec Decision 5): spacing in world
   * units; absent → the Seed-Tile edge length (`patchTickEdgeLength`), so
   * consecutive ticks are one Tile apart and Anchors land on the tessellation
   * grid. The popup sets it in whole edge-length multiples. `ticksEnabled`
   * absent → true (ticks are on by default).
   */
  tickSpacing?: number
  ticksEnabled?: boolean
  /**
   * Manual Anchors dropped on the Guide, as parametric positions along
   * start→end (t = 0 at start, 1 at end; outside [0, 1] on extended lines).
   * Parametric so they ride along when an endpoint is dragged. Creation UI
   * arrives with the Anchor wiring in slice 3; the schema ships now so saved
   * configs don't change shape later.
   */
  manualAnchors: number[]
}

/**
 * A Guide circle (slice 2) — centre + radius, drawn centre-click then
 * radius-click in Patch-local world coordinates. A **divided** Guide circle
 * is the same shape with `divisions > 0`: it exposes 2·`divisions` equal
 * division Anchors round the rim (the traditional rosette scaffold — see
 * RESEARCH §2.1 "a circle divided into 2n equal parts"). Circles are closed,
 * so there is no `extend`; ticks are spaced along the **arc** instead.
 */
export interface EditorGuideCircle {
  /** Stable identifier within the Patch. */
  id: string
  kind: 'circle'
  /** Centre, Patch-local world coords. */
  center: Vec2
  /** Radius in world units (> 0). */
  radius: number
  /**
   * Orientation angle (radians) of the drawn radius, i.e. the direction of
   * the second click from the centre. The radius handle, the first division
   * Anchor and the first arc tick all start here so a division can be aimed
   * at a snapped vertex. Absent → 0 (east). Purely a rotation of an otherwise
   * rotationally-symmetric scaffold. */
  phase?: number
  /**
   * Division count n (spec Decision 6): when set (> 0) the circle is
   * **divided** — 2n equal Anchors round the rim. Absent / 0 → a plain circle
   * (no division Anchors). */
  divisions?: number
  /** Stamp toggle — see `EditorGuideLine.stamp`. */
  stamp: boolean
  /**
   * Arc-spaced tick Anchors (spec Decision 5): spacing measured **along the
   * arc** in world units; absent → the Seed-Tile edge length
   * (`patchTickEdgeLength`). `ticksEnabled` absent → true. The tick count is
   * `round(circumference / spacing)` so the ticks land evenly and close the
   * loop. */
  tickSpacing?: number
  ticksEnabled?: boolean
  /**
   * Manual Anchors round the rim, as angle fractions (t ∈ [0, 1), measured
   * CCW from `phase`). Ride along under radius/phase edits. Creation UI lands
   * with the Anchor wiring (slice 3); the schema ships now for save-shape
   * stability. */
  manualAnchors: number[]
}

/**
 * A drawn construction element (ADR-0008). Guide lines (slice 1) plus Guide
 * circles / divided Guide circles (slice 2).
 */
export type EditorGuide = EditorGuideLine | EditorGuideCircle

/**
 * A partial edit applied to a single Guide by `EDITOR_UPDATE_GUIDE` / the
 * per-Guide popup. Union-friendly: every editable field of both variants,
 * all optional. `id` / `kind` are never patchable (the reducer re-pins them).
 * Only fields relevant to the target Guide's kind are ever sent.
 */
export type EditorGuidePatch =
  Partial<Omit<EditorGuideLine, 'id' | 'kind'>> &
  Partial<Omit<EditorGuideCircle, 'id' | 'kind'>>

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
   * Guides drawn in Construct mode (CONSTRUCTION_GUIDES_SPEC.md). Optional +
   * additive so patches without Guides keep their shape; absent ⇒ no Guides.
   */
  guides?: EditorGuide[]
  /**
   * Guides slice 3 — Tiles minted from a Complete / Place built off a
   * **non-stamping** (world-space) Guide Anchor. Stored in world coords like
   * `frame.completedTiles`: they render once and **never repeat under the
   * Lattice** (a stamping-Guide Anchor produces an ordinary Cell Tile instead).
   * Optional + additive; absent ⇒ none.
   */
  guideTiles?: EditorTile[]
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
