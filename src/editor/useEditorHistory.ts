import { useCallback, useEffect, useRef, useState } from 'react'
import type { Action } from '../state/actions'
import type { EditorConfig } from '../types/editor'
import {
  DESIGN_MODE_ACTIONS,
  HISTORY_COALESCE_MS,
  HISTORY_DEPTH,
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
 */
export function useEditorHistory(
  editor: EditorConfig | null | undefined,
  baseDispatch: React.Dispatch<Action>,
) {
  // Mirror the live editor in a ref so the dispatch wrapper sees the latest
  // value without re-binding on every render.
  const editorRef = useRef<EditorConfig | null>(editor ?? null)
  useEffect(() => { editorRef.current = editor ?? null }, [editor])

  const past = useRef<(EditorConfig | null)[]>([])
  const future = useRef<(EditorConfig | null)[]>([])
  const lastAction = useRef<{ type: string; t: number } | null>(null)

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
      const coalesce = !!last
        && last.type === action.type
        && now - last.t < HISTORY_COALESCE_MS
      if (!coalesce) {
        past.current.push(editorRef.current)
        if (past.current.length > HISTORY_DEPTH) past.current.shift()
        future.current = []
        bump()
      }
      lastAction.current = { type: action.type, t: now }
    }
    baseDispatch(action)
  }, [baseDispatch, bump])

  const undo = useCallback(() => {
    if (past.current.length === 0) return
    const prev = past.current.pop()!
    future.current.push(editorRef.current)
    if (future.current.length > HISTORY_DEPTH) future.current.shift()
    // Break coalescing — the next Design-Phase action should start a fresh
    // history entry rather than merge into the action we just undid.
    lastAction.current = null
    bump()
    baseDispatch({ type: 'EDITOR_RESTORE_SNAPSHOT', payload: prev })
  }, [baseDispatch, bump])

  const redo = useCallback(() => {
    if (future.current.length === 0) return
    const next = future.current.pop()!
    past.current.push(editorRef.current)
    if (past.current.length > HISTORY_DEPTH) past.current.shift()
    lastAction.current = null
    bump()
    baseDispatch({ type: 'EDITOR_RESTORE_SNAPSHOT', payload: next })
  }, [baseDispatch, bump])

  return {
    dispatch,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
