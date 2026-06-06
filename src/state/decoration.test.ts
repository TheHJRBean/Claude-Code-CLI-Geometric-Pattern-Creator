import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import type { Action } from './actions'

const base = (): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor: createDefaultEditorConfig(),
})

describe('Step 19.3 — decoration reducer actions', () => {
  it('SET_DECORATION_VOID_FILL creates editor.decoration and upserts by signature', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { signature: 'abc', colour: '#111' } } as Action)
    expect(s.editor!.decoration).toEqual({
      version: 1,
      strandColours: [],
      voidFills: [{ scope: 'congruent', key: 'abc', colour: '#111' }],
    })
    // Re-painting the same class replaces its colour (no duplicate).
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { signature: 'abc', colour: '#222' } } as Action)
    expect(s.editor!.decoration!.voidFills).toEqual([{ scope: 'congruent', key: 'abc', colour: '#222' }])
    // A different class appends.
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { signature: 'def', colour: '#333' } } as Action)
    expect(s.editor!.decoration!.voidFills).toHaveLength(2)
  })

  it('SET_DECORATION_STRAND_COLOR sets then clears the congruent * record', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { colour: '#b8860b' } } as Action)
    expect(s.editor!.decoration!.strandColours).toEqual([{ scope: 'congruent', key: '*', colour: '#b8860b' }])
    // Setting again replaces (no duplicate).
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { colour: '#c0392b' } } as Action)
    expect(s.editor!.decoration!.strandColours).toEqual([{ scope: 'congruent', key: '*', colour: '#c0392b' }])
    // null clears it.
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { colour: null } } as Action)
    expect(s.editor!.decoration!.strandColours).toEqual([])
  })

  it('CLEAR_DECORATION removes the whole block', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { signature: 'abc', colour: '#111' } } as Action)
    s = reducer(s, { type: 'CLEAR_DECORATION' } as Action)
    expect(s.editor!.decoration).toBeUndefined()
  })

  it('decoration actions are no-ops without an editor patch', () => {
    const s = structuredClone(DEFAULT_CONFIG)
    expect(reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { signature: 'x', colour: '#000' } } as Action)).toBe(s)
  })
})
