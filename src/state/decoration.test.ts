import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import type { GradientSpec } from '../types/editor'
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

  it('paint-what-you-see: a coarser canvas paint clears finer records masking the clicked target', () => {
    let s = base()
    // Void previously painted Single (instance) red…
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'instance', key: 'abc@10.00,20.00', colour: '#f00' } } as Action)
    // …then clicked with Matching (congruent) blue: the instance record would
    // mask the new colour on the clicked Void, so it must be cleared.
    s = reducer(s, {
      type: 'SET_DECORATION_VOID_FILL',
      payload: {
        scope: 'congruent', key: 'abc', colour: '#00f',
        clicked: { signature: 'abc', cellKey: 'abc#c0:dead', patchKey: 'abc@10.00,20.00', instanceKey: 'abc@10.01,19.99' },
      },
    } as Action)
    expect(s.editor!.decoration!.voidFills).toEqual([{ scope: 'congruent', key: 'abc', colour: '#00f' }])
  })

  it('paint-what-you-see: finer records on OTHER targets survive a coarser repaint', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'instance', key: 'abc@99.00,99.00', colour: '#f00' } } as Action)
    s = reducer(s, {
      type: 'SET_DECORATION_VOID_FILL',
      payload: {
        scope: 'congruent', key: 'abc', colour: '#00f',
        clicked: { signature: 'abc', instanceKey: 'abc@10.00,20.00' },
      },
    } as Action)
    expect(s.editor!.decoration!.voidFills).toHaveLength(2)
  })

  it('same-colour toggle is suppressed when the click unmasked something', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#00f' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'instance', key: 'abc@10.00,20.00', colour: '#f00' } } as Action)
    // The void LOOKS red; clicking Matching blue must make it blue — not
    // toggle the (masked, invisible-on-this-void) congruent blue off.
    s = reducer(s, {
      type: 'SET_DECORATION_VOID_FILL',
      payload: {
        scope: 'congruent', key: 'abc', colour: '#00f',
        clicked: { signature: 'abc', instanceKey: 'abc@10.00,20.00' },
      },
    } as Action)
    expect(s.editor!.decoration!.voidFills).toEqual([{ scope: 'congruent', key: 'abc', colour: '#00f' }])
    // A second identical click is now a true no-op → toggles off.
    s = reducer(s, {
      type: 'SET_DECORATION_VOID_FILL',
      payload: {
        scope: 'congruent', key: 'abc', colour: '#00f',
        clicked: { signature: 'abc', instanceKey: 'abc@10.00,20.00' },
      },
    } as Action)
    expect(s.editor!.decoration!.voidFills).toEqual([])
  })

  it("strand 'all' paint clears the clicked strand's own finer records", () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: 'sigA', colour: '#f00' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'patch', key: 'sigA@5.00,5.00', colour: '#0f0' } } as Action)
    s = reducer(s, {
      type: 'SET_DECORATION_STRAND_COLOR',
      payload: {
        scope: 'congruent', key: '*', colour: '#00f',
        clicked: { signature: 'sigA', cellKey: 'sigA#c0:beef', patchKey: 'sigA@5.00,5.00' },
      },
    } as Action)
    expect(s.editor!.decoration!.strandColours).toEqual([{ scope: 'congruent', key: '*', colour: '#00f' }])
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

describe('Gradient Void fills (#44) — SET_DECORATION_VOID_GRADIENT', () => {
  const stops = [{ offset: 0, colour: '#111' }, { offset: 1, colour: '#eee' }]
  const grad = { type: 'linear' as const, stops, start: { x: 40, y: 0 }, end: { x: 40, y: 30 } }
  const paint = (gradient: GradientSpec = grad, extra: Record<string, unknown> = {}): Action => ({
    type: 'SET_DECORATION_VOID_GRADIENT',
    payload: { scope: 'congruent', key: 'sig', colour: '#111', gradient, toggle: true, ...extra },
  } as Action)

  it('creates a voidFills record carrying the gradient', () => {
    const s = reducer(base(), paint())
    expect(s.editor!.decoration!.voidFills).toEqual([
      { scope: 'congruent', key: 'sig', colour: '#111', gradient: grad },
    ])
  })

  it('re-clicking with the same type + stops toggles the record off', () => {
    let s = reducer(base(), paint())
    s = reducer(s, paint())
    expect(s.editor!.decoration!.voidFills).toEqual([])
  })

  it('toggle-off ignores geometry differences (focus-edited records still unpaint)', () => {
    let s = reducer(base(), paint())
    // Focus-editor Apply (no toggle) reshapes the geometry.
    const shaped = { ...grad, start: { x: 0, y: 0 }, end: { x: 80, y: 30 } }
    s = reducer(s, paint(shaped, { toggle: undefined }))
    expect(s.editor!.decoration!.voidFills[0].gradient).toEqual(shaped)
    // A canvas re-click with the original seeded geometry still unpaints.
    s = reducer(s, paint())
    expect(s.editor!.decoration!.voidFills).toEqual([])
  })

  it('canvas re-paint with new stops preserves focus-edited geometry', () => {
    let s = reducer(base(), paint())
    const shaped = { ...grad, start: { x: 0, y: 0 }, end: { x: 80, y: 30 } }
    s = reducer(s, paint(shaped, { toggle: undefined }))
    const newStops = [{ offset: 0, colour: '#222' }, { offset: 1, colour: '#fff' }]
    s = reducer(s, paint({ ...grad, stops: newStops }))
    expect(s.editor!.decoration!.voidFills[0].gradient).toEqual({ ...shaped, stops: newStops })
  })

  it('a type flip replaces the geometry outright', () => {
    let s = reducer(base(), paint())
    const radial = { type: 'radial' as const, stops, centre: { x: 40, y: 15 }, radius: 40 }
    s = reducer(s, paint(radial))
    expect(s.editor!.decoration!.voidFills[0].gradient).toEqual(radial)
  })

  it('gradient and flat records upsert into the same (scope, key) slot', () => {
    let s = reducer(base(), paint())
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'sig', colour: '#333' } } as Action)
    expect(s.editor!.decoration!.voidFills).toEqual([
      { scope: 'congruent', key: 'sig', colour: '#333' },
    ])
  })
})

describe('Across-frame gradient (#45) — SET_DECORATION_FRAME_GRADIENT', () => {
  const fg = { enabled: true, type: 'linear' as const, stops: [{ offset: 0, colour: '#111' }, { offset: 1, colour: '#000' }], start: { x: 0, y: 0 }, end: { x: 0, y: 100 } }

  it('sets the frame gradient, creating editor.decoration if absent', () => {
    const s = reducer(base(), { type: 'SET_DECORATION_FRAME_GRADIENT', payload: fg } as Action)
    expect(s.editor!.decoration).toEqual({ version: 1, strandColours: [], voidFills: [], frameGradient: fg })
  })

  it('replaces the existing frame gradient (e.g. a drag/type flip)', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_FRAME_GRADIENT', payload: fg } as Action)
    const radial = { enabled: true, type: 'radial' as const, stops: fg.stops, centre: { x: 0, y: 0 }, radius: 70 }
    s = reducer(s, { type: 'SET_DECORATION_FRAME_GRADIENT', payload: radial } as Action)
    expect(s.editor!.decoration!.frameGradient).toEqual(radial)
  })

  it('null clears only the frame gradient, leaving other decoration intact', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#111' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_FRAME_GRADIENT', payload: fg } as Action)
    s = reducer(s, { type: 'SET_DECORATION_FRAME_GRADIENT', payload: null } as Action)
    expect(s.editor!.decoration!.frameGradient).toBeUndefined()
    expect(s.editor!.decoration!.voidFills).toHaveLength(1)
  })

  it('disabled frame gradient still persists its geometry (re-enable without reseeding)', () => {
    const s = reducer(base(), { type: 'SET_DECORATION_FRAME_GRADIENT', payload: { ...fg, enabled: false } } as Action)
    expect(s.editor!.decoration!.frameGradient).toEqual({ ...fg, enabled: false })
  })
})

describe('Strand gradient (#46) — SET_DECORATION_STRAND_GRADIENT', () => {
  const sg = { enabled: true, type: 'linear' as const, stops: [{ offset: 0, colour: '#c0392b' }, { offset: 1, colour: '#2c3e50' }], start: { x: 0, y: 0 }, end: { x: 0, y: 120 } }

  it('sets the strand gradient, creating editor.decoration if absent', () => {
    const s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    expect(s.editor!.decoration).toEqual({ version: 1, strandColours: [], voidFills: [], strandGradient: sg })
  })

  it('replaces the existing strand gradient (drag / type flip)', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    const radial = { enabled: true, type: 'radial' as const, stops: sg.stops, centre: { x: 10, y: 10 }, radius: 80 }
    s = reducer(s, { type: 'SET_DECORATION_STRAND_GRADIENT', payload: radial } as Action)
    expect(s.editor!.decoration!.strandGradient).toEqual(radial)
  })

  it('null clears only the strand gradient, leaving other decoration intact', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: '#111' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_DECORATION_STRAND_GRADIENT', payload: null } as Action)
    expect(s.editor!.decoration!.strandGradient).toBeUndefined()
    expect(s.editor!.decoration!.strandColours).toHaveLength(1)
  })

  it('coexists with the frame gradient (independent slots)', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_FRAME_GRADIENT', payload: { ...sg, enabled: true } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    expect(s.editor!.decoration!.frameGradient).toBeDefined()
    expect(s.editor!.decoration!.strandGradient).toEqual(sg)
  })

  it('disabled strand gradient still persists its geometry (re-enable without reseeding)', () => {
    const s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: { ...sg, enabled: false } } as Action)
    expect(s.editor!.decoration!.strandGradient).toEqual({ ...sg, enabled: false })
  })
})

describe('Strand gradient scope (#46 follow-up) — SET_STRAND_GRADIENT_SCOPE', () => {
  const sg = { enabled: true, type: 'linear' as const, stops: [{ offset: 0, colour: '#c0392b' }, { offset: 1, colour: '#2c3e50' }], start: { x: 0, y: 0 }, end: { x: 0, y: 120 } }

  it('narrows the wash to one congruent Strand group (signature key)', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: '5' } as Action)
    expect(s.editor!.decoration!.strandGradient).toEqual({ ...sg, scopeKey: '5' })
  })

  it('null clears the scope back to the global wash (drops scopeKey)', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: '5' } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: null } as Action)
    expect(s.editor!.decoration!.strandGradient).toEqual(sg)
    expect('scopeKey' in s.editor!.decoration!.strandGradient!).toBe(false)
  })

  it('re-scopes to a different signature (replace, not merge)', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: '5' } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: '8i:abcd1234' } as Action)
    expect(s.editor!.decoration!.strandGradient!.scopeKey).toBe('8i:abcd1234')
  })

  it('is a no-op when no strand gradient exists yet', () => {
    const s0 = base()
    const s = reducer(s0, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: '5' } as Action)
    expect(s).toBe(s0)
  })

  it('preserves scopeKey across a gradient type flip when the UI carries it', () => {
    // SET_DECORATION_STRAND_GRADIENT is a dumb replace; the UI spreads scopeKey.
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: '5' } as Action)
    const radial = { enabled: true, scopeKey: '5', type: 'radial' as const, stops: sg.stops, centre: { x: 10, y: 10 }, radius: 80 }
    s = reducer(s, { type: 'SET_DECORATION_STRAND_GRADIENT', payload: radial } as Action)
    expect(s.editor!.decoration!.strandGradient!.scopeKey).toBe('5')
  })
})

describe('Void Stamps — reducer actions', () => {
  const stamp = { scope: 'congruent' as const, key: 'a1b2c3d4', image: 'data:image/webp;base64,x', width: 800, height: 600, fit: 'cover' as const }

  it('SET_DECORATION_VOID_STAMP creates decoration and upserts by (scope, key)', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: stamp } as Action)
    expect(s.editor!.decoration!.voidStamps).toEqual([stamp])
    // Re-stamping the same key replaces the image.
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: { ...stamp, image: 'data:image/webp;base64,y' } } as Action)
    expect(s.editor!.decoration!.voidStamps).toHaveLength(1)
    expect(s.editor!.decoration!.voidStamps![0].image).toBe('data:image/webp;base64,y')
    // A second signature appends.
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: { ...stamp, key: 'deadbeef' } } as Action)
    expect(s.editor!.decoration!.voidStamps).toHaveLength(2)
  })

  it('REMOVE_DECORATION_VOID_STAMP deletes the record; the field drops when empty', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: stamp } as Action)
    s = reducer(s, { type: 'REMOVE_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: 'other' } } as Action)
    expect(s.editor!.decoration!.voidStamps).toHaveLength(1)
    s = reducer(s, { type: 'REMOVE_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: stamp.key } } as Action)
    expect(s.editor!.decoration!.voidStamps).toBeUndefined()
  })

  it('stamps coexist with fills and CLEAR_DECORATION drops both', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'a1b2c3d4', colour: '#111' } } as Action)
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: stamp } as Action)
    expect(s.editor!.decoration!.voidFills).toHaveLength(1)
    expect(s.editor!.decoration!.voidStamps).toHaveLength(1)
    s = reducer(s, { type: 'CLEAR_DECORATION' } as Action)
    expect(s.editor!.decoration).toBeUndefined()
  })
})
