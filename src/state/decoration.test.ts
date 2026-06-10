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

describe('Step 19 — decoration reducer actions (scoped records)', () => {
  it('SET_DECORATION_VOID_FILL creates editor.decoration and upserts by (scope, key)', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#111' } } as Action)
    expect(s.editor!.decoration).toEqual({
      version: 1,
      strandColours: [],
      voidFills: [{ scope: 'congruent', key: 'abc', colour: '#111' }],
    })
    // Re-painting the same key replaces its colour (no duplicate).
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#222' } } as Action)
    expect(s.editor!.decoration!.voidFills).toEqual([{ scope: 'congruent', key: 'abc', colour: '#222' }])
    // A different key appends.
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'def', colour: '#333' } } as Action)
    expect(s.editor!.decoration!.voidFills).toHaveLength(2)
  })

  it('records at different scopes coexist on the same signature', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#111' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'patch', key: 'abc@10.00,20.00', colour: '#222' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'instance', key: 'abc@110.00,20.00', colour: '#333' } } as Action)
    expect(s.editor!.decoration!.voidFills).toHaveLength(3)
  })

  it('re-painting a key with its current colour toggles the record off', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'instance', key: 'abc@1.00,2.00', colour: '#111' } } as Action)
    expect(s.editor!.decoration!.voidFills).toHaveLength(1)
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'instance', key: 'abc@1.00,2.00', colour: '#111' } } as Action)
    expect(s.editor!.decoration!.voidFills).toEqual([])
  })

  it('SET_DECORATION_STRAND_COLOR sets then clears the congruent * record', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: '#b8860b' } } as Action)
    expect(s.editor!.decoration!.strandColours).toEqual([{ scope: 'congruent', key: '*', colour: '#b8860b' }])
    // Setting again with a different colour replaces (no duplicate).
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: '#c0392b' } } as Action)
    expect(s.editor!.decoration!.strandColours).toEqual([{ scope: 'congruent', key: '*', colour: '#c0392b' }])
    // null clears it.
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: null } } as Action)
    expect(s.editor!.decoration!.strandColours).toEqual([])
  })

  it('strand records at different keys coexist; same-colour repaint toggles off', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: '#111' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: 'sigA', colour: '#222' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'patch', key: 'sigA@5.00,5.00', colour: '#333' } } as Action)
    expect(s.editor!.decoration!.strandColours).toHaveLength(3)
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: 'sigA', colour: '#222' } } as Action)
    expect(s.editor!.decoration!.strandColours).toHaveLength(2)
    expect(s.editor!.decoration!.strandColours.some(r => r.key === 'sigA')).toBe(false)
  })

  it('CLEAR_DECORATION removes the whole block', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#111' } } as Action)
    s = reducer(s, { type: 'CLEAR_DECORATION' } as Action)
    expect(s.editor!.decoration).toBeUndefined()
  })

  it('decoration actions are no-ops without an editor patch', () => {
    const s = structuredClone(DEFAULT_CONFIG)
    expect(reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'x', colour: '#000' } } as Action)).toBe(s)
  })
})
