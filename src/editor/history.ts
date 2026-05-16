import type { EditorConfig } from '../types/editor'

/**
 * Step 17.9 — undo/redo for the Builder (Q12 resolution).
 *
 * Design-Phase mutations push the prior `EditorConfig` snapshot to a `past`
 * stack. Undo pops the past, replaces the live editor, and pushes the
 * current editor onto `future`. Redo is symmetric. Stacks are capped at
 * `HISTORY_DEPTH` to bound memory.
 *
 * Composition-Phase mutations (figure-level: contact angle, line length,
 * lacing, curves, etc.) are explicitly out of scope — only
 * `DESIGN_MODE_ACTIONS` push to the stack. History is preserved across
 * Design ↔ Composition phase-switches.
 *
 * `LOAD_CONFIG` (library load) clears the entire stack per Q12.
 */

export interface EditorHistory {
  /** Snapshots prior to each Design-Phase mutation. Most recent at the end. */
  past: (EditorConfig | null)[]
  /** Snapshots from undone mutations, ready to redo. Most recent at the end. */
  future: (EditorConfig | null)[]
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
])
