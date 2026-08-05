import type { DecorationConfig, EditorConfig } from '../types/editor'
import type { Action } from '../state/actions'

/**
 * Step 17.9 — undo/redo for the Builder (Q12 resolution).
 *
 * Design-Phase mutations push the prior `EditorConfig` snapshot to a `past`
 * stack. Undo pops the past, replaces the live editor, and pushes the
 * current editor onto `future`. Redo is symmetric. Stacks are capped at
 * `HISTORY_DEPTH` to bound memory.
 *
 * Composition-Phase mutations (figure-level: contact angle, line length,
 * Strand style, curves, etc.) are explicitly out of scope — only
 * `DESIGN_MODE_ACTIONS` push to the stack. Decoration-Phase paint actions ARE
 * on it: painting is the one place a single click can wipe work that took
 * many. History is preserved across every phase-switch.
 *
 * `LOAD_CONFIG` (library load) clears the entire stack per Q12.
 */

/**
 * One undo step. A **pair**, because the state a user can undo has two homes
 * (see `decoration/store.ts`): the Builder Patch, and — on a legacy substrate,
 * which has no Patch — the top-level `config.decoration` the Decoration Phase
 * paints.
 */
export interface HistorySnapshot {
  editor: EditorConfig | null
  /** The LEGACY decoration home only. A Patch's decoration is inside `editor`. */
  decoration: DecorationConfig | undefined
}

/**
 * The actions that put `snap` back, given the live Patch (`liveEditor`).
 *
 * The Patch restore is **omitted** when there is no Patch on either side of
 * the move: `EDITOR_RESTORE_SNAPSHOT(null)` *clears the Lab* — it drops
 * `editor` and blanks `tiling.type` — which on a legacy substrate would delete
 * the very pattern the user is painting. That was the live bug once Decoration
 * actions started pushing snapshots on a Patch-less config: every paint stored
 * a `null` Patch, and one Ctrl+Z emptied the canvas.
 *
 * The decoration restore is unconditional — the reducer ignores it whenever a
 * Patch is present, since that Patch's decoration travelled inside the
 * snapshot above.
 */
export function restoreSnapshotActions(
  snap: HistorySnapshot,
  liveEditor: EditorConfig | null,
): Action[] {
  const actions: Action[] = []
  if (snap.editor !== null || liveEditor !== null) {
    actions.push({ type: 'EDITOR_RESTORE_SNAPSHOT', payload: snap.editor })
  }
  actions.push({ type: 'RESTORE_DECORATION_SNAPSHOT', payload: snap.decoration })
  return actions
}

export interface EditorHistory {
  /** Snapshots prior to each undoable mutation. Most recent at the end. */
  past: HistorySnapshot[]
  /** Snapshots from undone mutations, ready to redo. Most recent at the end. */
  future: HistorySnapshot[]
}

export const EMPTY_HISTORY: EditorHistory = { past: [], future: [] }

export const HISTORY_DEPTH = 50

/**
 * Coalesce window for consecutive same-type Design-Phase actions. A slider
 * drag fires many `SET_CELL_BOUNDARY_SIZE` actions per second; without
 * coalescing the stack would fill with intermediate values. Within this
 * window, repeats of the same action type don't push another snapshot —
 * the original "before drag" state already sits at the top of `past`.
 */
export const HISTORY_COALESCE_MS = 500

/**
 * Identity used for coalescing: action type + target Cell. The Design panel
 * shows every Cell's controls at once, so the same control can be edited on
 * Cell A then Cell B inside the coalesce window — type alone would merge
 * those into one undo step and undo would silently skip the first edit.
 * Actions without a Cell target coalesce on type as before.
 */
export function historyCoalesceKey(action: { type: string; payload?: unknown }): string {
  const payload = action.payload as {
    cellId?: string
    hostCellId?: string
    guideId?: string
    key?: string
  } | undefined
  // Decoration actions target a Void / Strand group by `{ scope, key }` rather
  // than a Cell. Keying on it makes a gradient-handle drag one undo step (same
  // group, many actions) while two shapes painted in quick succession stay two
  // — without it, rapid painting merges into a single step and undo jumps back
  // further than the user's last click.
  return `${action.type}@${payload?.cellId ?? payload?.hostCellId ?? payload?.guideId ?? payload?.key ?? ''}`
}

/**
 * Action types that snapshot to the Design-Phase undo stack. Any other
 * Builder or non-Builder action passes through without history impact.
 *
 * NB: `EDITOR_RESTORE_SNAPSHOT` is the action used by undo/redo itself —
 * it must NOT push a snapshot or the stacks would feedback.
 */
export const DESIGN_MODE_ACTIONS: ReadonlySet<string> = new Set([
  'EDITOR_NEW',
  'EDITOR_CLEAR',
  'SET_CELL_SHAPE',
  'SET_CELL_BOUNDARY_SIZE',
  'SET_EDITOR_ALTERNATE_BOUNDARY',
  'SET_CELL_SEED_SIDES',
  'EDITOR_PLACE_TILE_ON_EDGE',
  // Boundary-inward placement (mutates Tiles + possibly `patch.edgeLength`)
  // and the No-Seed toggle (Cell field that resets the Cell when flipped).
  'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION',
  // Step 17.13b — vertex-anchored placement (Tile mutation + possible orbit
  // multi-place under `symmetryMode`).
  'EDITOR_PLACE_TILE_ON_VERTEX',
  // Guides slice 3 / #33 — Anchor placement (world-space guideTile or Cell Tile).
  'EDITOR_PLACE_TILE_ON_ANCHOR',
  'SET_CELL_NO_SEED',
  'EDITOR_DELETE_TILE',
  'EDITOR_COMPLETE_GAP',
  'EDITOR_COMPLETE_N_GAP',
  'SET_EDITOR_AUTO_COMPLETE_ENABLED',
  'EDITOR_RUN_AUTO_COMPLETE',
  'SET_EDITOR_WRAP_BOUNDARY',
  'SET_EDITOR_SYMMETRY_MODE',
  // **Configuration** picker — picking 4.8.8 (or returning to single-Cell)
  // discards the current Patch, so it must snapshot for undo. Active-Cell
  // swaps within a multi-Cell Patch are pure UI (excluded — never push a
  // snapshot).
  'SET_BUILDER_CONFIGURATION',
  // Frame overlay — setting / clearing the Frame is undoable. Frame-node
  // completions land via EDITOR_COMPLETE_N_GAP (already in this set).
  'SET_FRAME',
  // Guides (Construct mode) — draw / edit / delete are undoable. UPDATE
  // coalesces per `guideId` (endpoint drags fire many updates per second).
  'EDITOR_ADD_GUIDE',
  'EDITOR_UPDATE_GUIDE',
  'EDITOR_DELETE_GUIDE',
  // Step 19 Decoration — every paint action is undoable, on BOTH substrates.
  // A Patch's decoration lives inside `EditorConfig`, so these snapshots ride
  // along in the editor snapshot; a legacy substrate's lives at
  // `config.decoration` and is carried separately by `useEditorHistory`.
  // Gradients and Stamps were missing here until 2026-08-04 — they were the
  // one part of the Decoration Phase Ctrl+Z silently skipped.
  'SET_DECORATION_VOID_FILL',
  'SET_DECORATION_VOID_GRADIENT',
  'SET_DECORATION_STRAND_COLOR',
  'SET_DECORATION_VOID_STAMP',
  'REMOVE_DECORATION_VOID_STAMP',
  'REORDER_DECORATION_VOID_STAMP',
  'SET_DECORATION_FRAME_GRADIENT',
  'SET_DECORATION_STRAND_GRADIENT',
  'SET_STRAND_GRADIENT_SCOPE',
  // Combine — fusing Voids and separating them again are edits to the
  // decoration block like any paint, and restructure what every later paint
  // lands on, so they must be undoable in the same stack.
  'COMBINE_VOIDS',
  'SEPARATE_VOIDS',
  // Junction ornaments — a paint like any other (and "Remove all" can clear a
  // whole field's worth in one click). Coalescing keys on the painted group's
  // `key`, so ornamenting two junctions in quick succession stays two steps.
  'SET_JUNCTION_ORNAMENT',
  'CLEAR_JUNCTION_ORNAMENTS',
  'CLEAR_DECORATION',
])
