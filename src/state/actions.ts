import type { FigureRouting, PatternConfig, StrandStyle } from '../types/pattern'
import type { BoundaryShape, ConfigurationId, EditorConfig, FrameConfig, SymmetryMode } from '../types/editor'
import type { Vec2 } from '../utils/math'

/** Which strand type a curve mutation targets. 'edge' = star-arm lines (the
 *  shared `curve`); 'vertex' = vertex lines' own `vertexCurve` (decoupled). */
export type CurveTarget = 'edge' | 'vertex'

export type Action =
  | { type: 'SET_TILING_TYPE'; payload: string }
  | { type: 'SET_SCALE'; payload: number }
  | { type: 'SET_CONTACT_ANGLE'; payload: { tileTypeId: string; angle: number } }
  | { type: 'SET_LINE_LENGTH'; payload: { tileTypeId: string; lineLength: number } }
  | { type: 'SET_AUTO_LINE_LENGTH'; payload: { tileTypeId: string; auto: boolean } }
  | { type: 'SET_SNAP_LINE_LENGTH'; payload: { tileTypeId: string; snap: boolean } }
  | { type: 'SET_STRAND_STYLE'; payload: Partial<StrandStyle> }
  | { type: 'SET_EDGE_LINES_ENABLED'; payload: { tileTypeId: string; enabled: boolean } }
  | { type: 'SET_VERTEX_LINES_ENABLED'; payload: { tileTypeId: string; enabled: boolean } }
  | { type: 'SET_VERTEX_LINES_DECOUPLED'; payload: { tileTypeId: string; decoupled: boolean } }
  | { type: 'SET_VERTEX_CONTACT_ANGLE'; payload: { tileTypeId: string; angle: number } }
  | { type: 'SET_VERTEX_LINE_LENGTH'; payload: { tileTypeId: string; lineLength: number } }
  | { type: 'SET_VERTEX_AUTO_LINE_LENGTH'; payload: { tileTypeId: string; auto: boolean } }
  | { type: 'SET_CURVE_ENABLED'; payload: { tileTypeId: string; enabled: boolean; target?: CurveTarget } }
  | { type: 'SET_CURVE_POINT_COUNT'; payload: { tileTypeId: string; count: number; target?: CurveTarget } }
  | { type: 'SET_CURVE_POINT'; payload: { tileTypeId: string; index: number; point: Partial<{ position: number; offset: number }>; target?: CurveTarget } }
  | { type: 'SET_CURVE_ALTERNATING'; payload: { tileTypeId: string; alternating: boolean; target?: CurveTarget } }
  | { type: 'SET_CURVE_DIRECTION'; payload: { tileTypeId: string; direction: 'left' | 'right'; target?: CurveTarget } }
  | { type: 'SET_SMOOTH_TRANSITIONS'; payload: boolean }
  | { type: 'SET_FIGURE_ROUTING'; payload: FigureRouting }
  // Reset every FigureConfig in `figures` back to its tiling default
  // (TILINGS[type].defaultConfig.figures) for Gallery mode, or to
  // DEFAULT_EDITOR_FIGURE for Builder Patches. Wipes the user's per-Tile-type
  // strand tuning across the whole pattern.
  | { type: 'RESET_FIGURES' }
  | { type: 'LOAD_CONFIG'; payload: PatternConfig }
  // Step 17 — Builder (Design Phase shell, sub-step 17.2)
  | { type: 'EDITOR_NEW' }
  | { type: 'EDITOR_CLEAR' }
  // Active Cell mutations (ADR-0001 vocabulary).
  | { type: 'SET_CELL_SHAPE'; payload: BoundaryShape }
  | { type: 'SET_CELL_BOUNDARY_SIZE'; payload: number }
  | { type: 'SET_EDITOR_ALTERNATE_BOUNDARY'; payload: boolean }
  | { type: 'SET_CELL_SEED_SIDES'; payload: number }
  // `force` (2026-06-01 flexible-placement) commits the placement even when it
  // would overlap an existing Tile (or, under symmetry, an orbit sibling) —
  // the user accepted a skippable overlap warning in the picker.
  | { type: 'EDITOR_PLACE_TILE_ON_EDGE'; payload: { tileId: string; edgeIndex: number; sides: number; force?: boolean } }
  // Step 17.12b — Boundary-inward placement. Drops a regular n-gon flush
  // against the picked Boundary section; the new Tile's edge length becomes
  // the Patch's `edgeLength` on the FIRST boundary placement (so the lattice
  // tracks the boundary-anchored Tile). Single-cell only in v1 (per locked
  // decision b). Always-available in Design Phase — no enabling flag.
  | { type: 'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION'; payload: { edgeIndex: number; sectionIndex: number; sides: number; force?: boolean } }
  // Step 17.13b — Vertex placement. Anchors a regular n-gon at an exposed
  // Cell corner (or an inward-only Boundary corner). `vertexKey` is the
  // stable rounded-coord identifier produced by `vertexKeyOf`; `rotation`
  // is the angle of the new Tile's edge 0→1 leaving the anchor (radians)
  // — picked from `vertexPlacementOrientations`. Symmetry-orbit aware:
  // propagates under the Cell's `symmetryMode` via `placeTilesOnVertexOrbit`.
  | { type: 'EDITOR_PLACE_TILE_ON_VERTEX'; payload: { vertexKey: string; sides: number; rotation: number; force?: boolean } }
  // Toggle the auto-placed Seed Tile on/off for the active Cell. When on
  // (default), the Cell carries a Seed Tile at the centre. When off, the
  // Cell starts empty and the user builds from the boundary inward (or via
  // Complete picking boundary corners). Refused while the Cell holds any
  // non-Seed Tile — see reducer for the lock semantic.
  | { type: 'SET_CELL_NO_SEED'; payload: boolean }
  | { type: 'EDITOR_DELETE_TILE'; payload: { tileId: string } }
  // Step 17.5 — Complete operation (manual, 2-vertex chord)
  | { type: 'EDITOR_COMPLETE_GAP'; payload: { pA: Vec2; pB: Vec2 } }
  // Step 17.11 — Complete operation (multi-vertex polygon pick)
  | { type: 'EDITOR_COMPLETE_N_GAP'; payload: { picks: Vec2[]; force?: boolean } }
  // Step 17.7 — Auto-complete on phase-switch (Decision 11)
  | { type: 'SET_EDITOR_AUTO_COMPLETE_ENABLED'; payload: boolean }
  | { type: 'EDITOR_RUN_AUTO_COMPLETE' }
  // Wrap boundary — Design-Phase Boundary fitting (formerly match-boundary).
  | { type: 'SET_EDITOR_WRAP_BOUNDARY'; payload: boolean }
  // Step 17.4 (re-enabled) — orbit propagation subgroup picker.
  | { type: 'SET_EDITOR_SYMMETRY_MODE'; payload: SymmetryMode }
  // Step 17.9 — undo/redo restores a snapshot. `null` means "no editor".
  | { type: 'EDITOR_RESTORE_SNAPSHOT'; payload: EditorConfig | null }
  // Switch the Patch between single-Cell and a multi-Cell **Configuration**
  // (e.g. 4.8.8, 3.12.12). `null` returns to a single-Cell Patch; an id
  // seeds a fresh Cell set for that Configuration.
  | { type: 'SET_BUILDER_CONFIGURATION'; payload: ConfigurationId | null }
  | { type: 'SET_FRAME'; payload: FrameConfig | null }
  // Gallery-mode Frame (clip-only, top-level `config.frame`). Distinct from
  // SET_FRAME, which targets the Builder's `editor.frame`. `null` clears it.
  | { type: 'SET_GALLERY_FRAME'; payload: FrameConfig | null }
  // Switch which Cell the user is editing in Design Phase (multi-Cell only).
  // Pure pane swap — does NOT push a history snapshot.
  | { type: 'SET_ACTIVE_CELL'; payload: { cellId: string } }
