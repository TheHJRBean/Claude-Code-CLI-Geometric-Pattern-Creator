import { useCallback, useEffect, useRef, useState } from 'react'
import type { Action } from '../state/actions'
import type { DecorationConfig, EditorConfig } from '../types/editor'
import {
  DESIGN_MODE_ACTIONS,
  HISTORY_COALESCE_MS,
  HISTORY_DEPTH,
  historyCoalesceKey,
  restoreSnapshotActions,
  type HistorySnapshot,
} from './history'

/**
 * Step 17.9 — undo/redo hook. Wraps a base `dispatch` so that Design-Phase
 * Builder mutations push snapshots to a local history stack.
 *
 * Returns a wrapped `dispatch` that consumers should use *instead of* the
 * base dispatch — bypassing it skips history. Also returns `undo` / `redo`
 * functions and `canUndo` / `canRedo` flags driven by the live stack
 * state, so toolbar buttons can reflect availability.
 *
 * The wrapped dispatch coalesces consecutive same-type Design-Phase actions
 * fired within `HISTORY_COALESCE_MS` so a slider drag is one history entry
 * rather than dozens.
 *
 * A snapshot is a **pair** (`HistorySnapshot`), because the state a user can
 * undo has two homes — see `restoreSnapshotActions`, which owns how one goes
 * back.
 */
export function useEditorHistory(
  editor: EditorConfig | null | undefined,
  decoration: DecorationConfig | undefined,
  baseDispatch: React.Dispatch<Action>,
) {
  // Mirror the live state in refs so the dispatch wrapper sees the latest
  // values without re-binding on every render.
  const editorRef = useRef<EditorConfig | null>(editor ?? null)
  useEffect(() => { editorRef.current = editor ?? null }, [editor])
  const decorationRef = useRef<DecorationConfig | undefined>(decoration)
  useEffect(() => { decorationRef.current = decoration }, [decoration])
  const snapshot = useCallback((): HistorySnapshot => ({
    editor: editorRef.current,
    decoration: decorationRef.current,
  }), [])

  const past = useRef<HistorySnapshot[]>([])
  const future = useRef<HistorySnapshot[]>([])
  const lastAction = useRef<{ key: string; t: number } | null>(null)

  // `tick` forces a re-render when stacks mutate so canUndo / canRedo update.
  const [, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])

  const dispatch = useCallback((action: Action) => {
    if (action.type === 'LOAD_CONFIG') {
      // Q12: library load clears the stack.
      past.current = []
      future.current = []
      lastAction.current = null
      bump()
      baseDispatch(action)
      return
    }
    if (DESIGN_MODE_ACTIONS.has(action.type)) {
      const now = performance.now()
      const last = lastAction.current
      // Coalesce on type + target Cell (see historyCoalesceKey): a slider
      // drag on Cell A must not merge with the same control dragged on
      // Cell B right after, or undo silently skips the first edit.
      const key = historyCoalesceKey(action)
      const coalesce = !!last
        && last.key === key
        && now - last.t < HISTORY_COALESCE_MS
      if (!coalesce) {
        past.current.push(snapshot())
        if (past.current.length > HISTORY_DEPTH) past.current.shift()
        future.current = []
        bump()
      }
      lastAction.current = { key, t: now }
    }
    baseDispatch(action)
  }, [baseDispatch, bump, snapshot])

  const restore = useCallback((snap: HistorySnapshot) => {
    // Both dispatches land in one render (React batches inside the handler).
    for (const a of restoreSnapshotActions(snap, editorRef.current)) baseDispatch(a)
  }, [baseDispatch])

  const undo = useCallback(() => {
    if (past.current.length === 0) return
    const prev = past.current.pop()!
    future.current.push(snapshot())
    if (future.current.length > HISTORY_DEPTH) future.current.shift()
    // Break coalescing — the next Design-Phase action should start a fresh
    // history entry rather than merge into the action we just undid.
    lastAction.current = null
    bump()
    restore(prev)
  }, [bump, restore, snapshot])

  const redo = useCallback(() => {
    if (future.current.length === 0) return
    const next = future.current.pop()!
    past.current.push(snapshot())
    if (past.current.length > HISTORY_DEPTH) past.current.shift()
    lastAction.current = null
    bump()
    restore(next)
  }, [bump, restore, snapshot])

  return {
    dispatch,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
