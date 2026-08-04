import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig } from '../editor/createDefault'
import { DESIGN_MODE_ACTIONS, historyCoalesceKey, restoreSnapshotActions, type HistorySnapshot } from '../editor/history'
import { hasDecoration, patternDecoration } from '../decoration/store'
import type { PatternConfig } from '../types/pattern'
import type { Action } from './actions'

/**
 * Undo / Clear for the Decoration Phase (2026-08-04).
 *
 * The two substrates keep decoration in different homes, so "undo my last
 * paint" is two different restores. These pin the pair, and in particular that
 * undoing a paint on a legacy substrate leaves the *pattern* alone — the
 * failure mode before the snapshot became a pair was Ctrl+Z blanking the
 * canvas after a single Void fill.
 */

const patch = (): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor: createDefaultEditorConfig(),
})

const legacy = (): PatternConfig => structuredClone(DEFAULT_CONFIG)

const fill = (key: string, colour: string): Action =>
  ({ type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key, colour } } as Action)

/** Replay one undo step the way `useEditorHistory` does. */
function applyRestore(state: PatternConfig, snap: HistorySnapshot): PatternConfig {
  return restoreSnapshotActions(snap, state.editor ?? null)
    .reduce((s, a) => reducer(s, a), state)
}

const snapshotOf = (s: PatternConfig): HistorySnapshot => ({
  editor: s.editor ?? null,
  decoration: s.decoration,
})

describe('every Decoration action is undoable', () => {
  it('the paint actions are all on the history allowlist', () => {
    for (const type of [
      'SET_DECORATION_VOID_FILL',
      'SET_DECORATION_VOID_GRADIENT',
      'SET_DECORATION_STRAND_COLOR',
      'SET_DECORATION_VOID_STAMP',
      'REMOVE_DECORATION_VOID_STAMP',
      'REORDER_DECORATION_VOID_STAMP',
      'SET_DECORATION_FRAME_GRADIENT',
      'SET_DECORATION_STRAND_GRADIENT',
      'SET_STRAND_GRADIENT_SCOPE',
      'CLEAR_DECORATION',
    ]) {
      expect(DESIGN_MODE_ACTIONS.has(type), type).toBe(true)
    }
  })

  it('coalesces per painted group, so two shapes painted quickly are two steps', () => {
    const a = historyCoalesceKey(fill('sigA', '#111'))
    const b = historyCoalesceKey(fill('sigB', '#111'))
    expect(a).not.toBe(b)
    // The same group re-painted (a gradient handle dragged) stays one step.
    expect(historyCoalesceKey(fill('sigA', '#222'))).toBe(a)
  })
})

describe('undo on a legacy substrate', () => {
  it('restores the previous decoration without touching the pattern', () => {
    const before = legacy()
    const painted = reducer(before, fill('abc', '#111'))
    expect(painted.decoration!.voidFills).toHaveLength(1)

    const undone = applyRestore(painted, snapshotOf(before))
    expect(undone.decoration).toBeUndefined()
    // The substrate itself survives: this is the bug the snapshot pair fixes.
    expect(undone.tiling.type).toBe(before.tiling.type)
    expect(undone.tiling.type).not.toBe('')
  })

  it('redo puts the paint back', () => {
    const before = legacy()
    const painted = reducer(before, fill('abc', '#111'))
    const undone = applyRestore(painted, snapshotOf(before))
    const redone = applyRestore(undone, snapshotOf(painted))
    expect(redone.decoration!.voidFills).toEqual([{ scope: 'congruent', key: 'abc', colour: '#111' }])
    expect(redone.tiling.type).toBe(before.tiling.type)
  })

  it('never emits the Patch restore when there is no Patch on either side', () => {
    // EDITOR_RESTORE_SNAPSHOT(null) clears the Lab — see the reducer case.
    const actions = restoreSnapshotActions({ editor: null, decoration: undefined }, null)
    expect(actions.map(a => a.type)).toEqual(['RESTORE_DECORATION_SNAPSHOT'])
  })
})

describe('undo on a Patch', () => {
  it("restores the Patch's own decoration home", () => {
    const before = patch()
    const painted = reducer(before, fill('abc', '#111'))
    expect(painted.editor!.decoration!.voidFills).toHaveLength(1)

    const undone = applyRestore(painted, snapshotOf(before))
    expect(undone.editor!.decoration).toBeUndefined()
    expect(undone.tiling.type).toBe('editor')
  })

  it('RESTORE_DECORATION_SNAPSHOT is inert while a Patch is loaded', () => {
    // The Patch's decoration travelled inside the editor snapshot; a second
    // write here would be reading a field this substrate never uses.
    const s = reducer(patch(), fill('abc', '#111'))
    expect(reducer(s, { type: 'RESTORE_DECORATION_SNAPSHOT', payload: undefined } as Action)).toBe(s)
  })

  it('EDITOR_NEW → undo still works (the Patch restore is emitted)', () => {
    const before = legacy()
    const withPatch = patch()
    const actions = restoreSnapshotActions(snapshotOf(before), withPatch.editor ?? null)
    expect(actions.map(a => a.type)).toEqual(['EDITOR_RESTORE_SNAPSHOT', 'RESTORE_DECORATION_SNAPSHOT'])
  })
})

describe('hasDecoration — the Clear-paint button gate', () => {
  it('is false on a bare config and true once anything is painted', () => {
    expect(hasDecoration(legacy())).toBe(false)
    expect(hasDecoration(patch())).toBe(false)
    expect(hasDecoration(reducer(patch(), fill('abc', '#111')))).toBe(true)
    expect(hasDecoration(reducer(legacy(), fill('abc', '#111')))).toBe(true)
  })

  it('counts a gradient-only config — the panel summary does not', () => {
    const s = reducer(legacy(), {
      type: 'SET_DECORATION_FRAME_GRADIENT',
      payload: {
        enabled: true,
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        stops: [{ offset: 0, colour: '#000' }, { offset: 1, colour: '#fff' }],
      },
    } as Action)
    const d = patternDecoration(s)!
    expect(d.strandColours).toHaveLength(0)
    expect(d.voidFills).toHaveLength(0)
    expect(hasDecoration(s)).toBe(true)
  })

  it('goes false again after CLEAR_DECORATION', () => {
    const s = reducer(reducer(patch(), fill('abc', '#111')), { type: 'CLEAR_DECORATION' } as Action)
    expect(hasDecoration(s)).toBe(false)
  })
})
