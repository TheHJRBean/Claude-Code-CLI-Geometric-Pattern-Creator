import type { Action } from './actions'
import type { FigureConfig } from '../types/pattern'

/**
 * "Apply to all Tiles" — fan one per-Tile-type Figure edit out across every
 * Tile type in the current Configuration.
 *
 * This lives at the **dispatch** layer, not the reducer, deliberately: the
 * toggle is a UI mode (session state, never part of `PatternConfig`), and
 * routing it here means every path that edits a Figure recipe — the Strands
 * panel cards AND on-canvas control-point dragging — obeys it without each
 * call site opting in. The reducer keeps its one-Tile-type contract.
 */

/**
 * The Figure-recipe actions that fan out. Every one carries a `tileTypeId`
 * naming the Tile type it edits. Note `SET_MORPH_ORIGIN_ANGLE` also carries a
 * `tileTypeId` and is deliberately absent: it edits a Morph stop's overlay,
 * not the Figure recipe, and has its own per-origin UI.
 */
const BROADCAST_ACTIONS: ReadonlySet<string> = new Set([
  'SET_CONTACT_ANGLE',
  'SET_LINE_LENGTH',
  'SET_AUTO_LINE_LENGTH',
  'SET_SNAP_LINE_LENGTH',
  'SET_EDGE_LINES_ENABLED',
  'SET_VERTEX_LINES_ENABLED',
  'SET_VERTEX_LINES_DECOUPLED',
  'SET_VERTEX_CONTACT_ANGLE',
  'SET_VERTEX_LINE_LENGTH',
  'SET_VERTEX_AUTO_LINE_LENGTH',
  'SET_CURVE_ENABLED',
  'SET_CURVE_POINT_COUNT',
  'SET_CURVE_POINT',
  'SET_CURVE_ALTERNATING',
  'SET_CURVE_DIRECTION',
  'ADD_FIGURE_SET',
  'UPDATE_FIGURE_SET',
  'REMOVE_FIGURE_SET',
])

/** Shape shared by every broadcastable payload; `setId` only on set edits. */
interface FigurePayload {
  tileTypeId: string
  setId?: string
}

type FigureAction = Action & { payload: FigurePayload }

function isFigureAction(action: Action): action is FigureAction {
  return BROADCAST_ACTIONS.has(action.type)
    && typeof (action as { payload?: unknown }).payload === 'object'
    && (action as FigureAction).payload !== null
    && typeof (action as FigureAction).payload.tileTypeId === 'string'
}

/**
 * A line-set edit only reaches another Tile type when that Tile has a set with
 * the **same id and the same kind**. Set ids are per-Figure (`set-1`, `set-2`,
 * …), so an id can collide across Tile types that were built independently —
 * and `REMOVE_FIGURE_SET` has no undo (Figure actions aren't on the history
 * allowlist). Matching on kind as well keeps a broadcast from silently
 * deleting or rewriting an unrelated set. `ADD_FIGURE_SET` has no id yet and
 * always reaches every Tile type.
 */
function setActionApplies(
  action: FigureAction,
  targetId: string,
  figures: Record<string, FigureConfig>,
): boolean {
  const setId = action.payload.setId
  if (setId === undefined) return true
  const source = figures[action.payload.tileTypeId]?.extraSets?.find(s => s.id === setId)
  const target = figures[targetId]?.extraSets?.find(s => s.id === setId)
  return !!source && !!target && source.kind === target.kind
}

/**
 * Expand `action` into the list to dispatch, source action first.
 *
 * Returns `[action]` untouched when the toggle is off, when the action isn't a
 * Figure edit, or when there is nothing else to reach. `tileTypeIds` must be
 * the **live** Tile types on canvas, not `Object.keys(figures)` — a loaded
 * config's `figures` map can carry stale keys for Tile types that no longer
 * exist, and broadcasting to those would resurrect them as live-looking edits.
 */
export function broadcastFigureAction(
  action: Action,
  applyToAll: boolean,
  tileTypeIds: readonly string[],
  figures: Record<string, FigureConfig>,
): Action[] {
  if (!applyToAll || !isFigureAction(action)) return [action]
  const source = action.payload.tileTypeId
  const targets = tileTypeIds.filter(id => id !== source && setActionApplies(action, id, figures))
  if (targets.length === 0) return [action]
  // Every Action is `{ type, payload }`, so rebuilding the pair reproduces the
  // action faithfully — spreading the union itself doesn't type-check, since
  // some members carry no payload at all.
  const base = action as unknown as { type: string; payload: FigurePayload & Record<string, unknown> }
  return [
    action,
    ...targets.map(id =>
      ({ type: base.type, payload: { ...base.payload, tileTypeId: id } }) as unknown as Action),
  ]
}

/** Exposed for tests / bug capture: is this action one the toggle fans out? */
export function isBroadcastFigureAction(action: Action): boolean {
  return isFigureAction(action)
}
