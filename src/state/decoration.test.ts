import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import type { GradientSpec, VoidMergeRecord } from '../types/editor'
import { migrateDecoration, migrateEditorConfig } from '../editor/migrations'
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

  it('decoration actions are no-ops with no substrate at all (empty Lab)', () => {
    // EDITOR_CLEAR leaves `tiling.type === ''` and no patch — nothing to
    // decorate, so a stray paint must not attach records that would be
    // unreachable and ride along into every later save.
    const s: PatternConfig = { ...structuredClone(DEFAULT_CONFIG), tiling: { type: '', scale: 1 } }
    expect(reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'x', colour: '#000' } } as Action)).toBe(s)
  })
})

describe('Decoration on a legacy substrate (no Builder Patch)', () => {
  // A Gallery preset / Generator sample has no Patch to hang decoration on,
  // so it lives at the top level. `decoration/store.ts` owns the choice; the
  // reducer never touches either field directly.
  const legacy = (): PatternConfig => structuredClone(DEFAULT_CONFIG)

  it('writes to config.decoration, not editor.decoration', () => {
    let s = legacy()
    expect(s.editor).toBeUndefined()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#111' } } as Action)
    expect(s.decoration).toEqual({
      version: 1,
      strandColours: [],
      voidFills: [{ scope: 'congruent', key: 'abc', colour: '#111' }],
    })
    expect(s.editor).toBeUndefined()
  })

  it('runs the same upsert / toggle-off ladder as a Patch', () => {
    let s = legacy()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'instance', key: 'abc@1.00,2.00', colour: '#111' } } as Action)
    expect(s.decoration!.voidFills).toHaveLength(1)
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'instance', key: 'abc@1.00,2.00', colour: '#111' } } as Action)
    expect(s.decoration!.voidFills).toEqual([])
  })

  it('CLEAR_DECORATION deletes the key rather than setting it undefined', () => {
    let s = legacy()
    s = reducer(s, { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: 'sig', colour: '#111' } } as Action)
    expect(s.decoration!.strandColours).toHaveLength(1)
    s = reducer(s, { type: 'CLEAR_DECORATION' } as Action)
    expect('decoration' in s).toBe(false)
  })

  it('swapping the substrate drops the decoration it was keyed to', () => {
    // Records are shape signatures and world positions of the OLD substrate's
    // Voids — none can match the new one, and left behind they are invisible
    // and ride into every later save.
    let s = legacy()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#111' } } as Action)
    expect(s.decoration).toBeDefined()

    // ...to a different tiling
    const retiled = reducer(s, { type: 'SET_TILING_TYPE', payload: '4.8.8' } as Action)
    expect('decoration' in retiled).toBe(false)

    // ...to a fresh Builder Patch
    const patched = reducer(s, { type: 'EDITOR_NEW' } as Action)
    expect('decoration' in patched).toBe(false)
    expect(patched.editor!.decoration).toBeUndefined()

    // ...and out again to an empty Lab
    const cleared = reducer(patched, { type: 'EDITOR_CLEAR' } as Action)
    expect('decoration' in cleared).toBe(false)
    expect(cleared.editor).toBeUndefined()
  })

  it('a Patch keeps its decoration on the Patch — the two homes never mix', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'abc', colour: '#111' } } as Action)
    expect(s.editor!.decoration!.voidFills).toHaveLength(1)
    expect(s.decoration).toBeUndefined()
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

  it('narrows the wash to one congruent Strand group — congruent normalises away scope', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: { scope: 'congruent', key: '5' } } as Action)
    // Congruent is the ladder default — stored as a bare scopeKey (no `scope`).
    expect(s.editor!.decoration!.strandGradient).toEqual({ ...sg, scopeKey: '5' })
    expect('scope' in s.editor!.decoration!.strandGradient!).toBe(false)
  })

  it('carries an explicit scope for the cell (Twins) rung', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: { scope: 'cell', key: '5#c0:deadbeef' } } as Action)
    expect(s.editor!.decoration!.strandGradient).toEqual({ ...sg, scope: 'cell', scopeKey: '5#c0:deadbeef' })
  })

  it('carries an explicit scope for the patch (Single) rung', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: { scope: 'patch', key: '5@12.00,-8.00' } } as Action)
    expect(s.editor!.decoration!.strandGradient).toEqual({ ...sg, scope: 'patch', scopeKey: '5@12.00,-8.00' })
  })

  it('null clears the scope back to the global wash (drops scope + scopeKey)', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: { scope: 'cell', key: '5#c0:deadbeef' } } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: null } as Action)
    expect(s.editor!.decoration!.strandGradient).toEqual(sg)
    expect('scopeKey' in s.editor!.decoration!.strandGradient!).toBe(false)
    expect('scope' in s.editor!.decoration!.strandGradient!).toBe(false)
  })

  it('re-scopes from a positioned rung to congruent, clearing the stale scope', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: { scope: 'patch', key: '5@12.00,-8.00' } } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: { scope: 'congruent', key: '8i:abcd1234' } } as Action)
    expect(s.editor!.decoration!.strandGradient!.scopeKey).toBe('8i:abcd1234')
    expect('scope' in s.editor!.decoration!.strandGradient!).toBe(false)
  })

  it('is a no-op when no strand gradient exists yet', () => {
    const s0 = base()
    const s = reducer(s0, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: { scope: 'congruent', key: '5' } } as Action)
    expect(s).toBe(s0)
  })

  it('preserves scope + scopeKey across a gradient type flip when the UI carries them', () => {
    // SET_DECORATION_STRAND_GRADIENT is a dumb replace; the UI spreads both.
    let s = reducer(base(), { type: 'SET_DECORATION_STRAND_GRADIENT', payload: sg } as Action)
    s = reducer(s, { type: 'SET_STRAND_GRADIENT_SCOPE', payload: { scope: 'cell', key: '5#c0:deadbeef' } } as Action)
    const radial = { enabled: true, scope: 'cell' as const, scopeKey: '5#c0:deadbeef', type: 'radial' as const, stops: sg.stops, centre: { x: 10, y: 10 }, radius: 80 }
    s = reducer(s, { type: 'SET_DECORATION_STRAND_GRADIENT', payload: radial } as Action)
    expect(s.editor!.decoration!.strandGradient!.scope).toBe('cell')
    expect(s.editor!.decoration!.strandGradient!.scopeKey).toBe('5#c0:deadbeef')
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

  it('re-stamping keeps the record IN PLACE so the stacking order survives', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: stamp } as Action)
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: { ...stamp, key: 'deadbeef' } } as Action)
    // Replace the image of the BACK record — it must not jump to the front.
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: { ...stamp, image: 'data:image/webp;base64,z' } } as Action)
    expect(s.editor!.decoration!.voidStamps!.map(r => r.key)).toEqual([stamp.key, 'deadbeef'])
    expect(s.editor!.decoration!.voidStamps![0].image).toBe('data:image/webp;base64,z')
  })

  it('REORDER_DECORATION_VOID_STAMP moves a record through the paint order', () => {
    const keys = () => s.editor!.decoration!.voidStamps!.map(r => r.key)
    let s = base()
    for (const key of ['a', 'b', 'c']) {
      s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: { ...stamp, key } } as Action)
    }
    expect(keys()).toEqual(['a', 'b', 'c'])
    s = reducer(s, { type: 'REORDER_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: 'a', move: 'forward' } } as Action)
    expect(keys()).toEqual(['b', 'a', 'c'])
    s = reducer(s, { type: 'REORDER_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: 'a', move: 'front' } } as Action)
    expect(keys()).toEqual(['b', 'c', 'a'])
    s = reducer(s, { type: 'REORDER_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: 'a', move: 'back' } } as Action)
    expect(keys()).toEqual(['a', 'b', 'c'])
    s = reducer(s, { type: 'REORDER_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: 'c', move: 'backward' } } as Action)
    expect(keys()).toEqual(['a', 'c', 'b'])
  })

  it('REORDER_DECORATION_VOID_STAMP is identity at the ends and for unknown keys', () => {
    let s = base()
    s = reducer(s, { type: 'SET_DECORATION_VOID_STAMP', payload: stamp } as Action)
    const s0 = s
    for (const move of ['forward', 'backward', 'front', 'back'] as const) {
      expect(reducer(s0, { type: 'REORDER_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: stamp.key, move } } as Action)).toBe(s0)
    }
    expect(reducer(s0, { type: 'REORDER_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: 'nope', move: 'forward' } } as Action)).toBe(s0)
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

describe('Combine — merge records on the decoration block', () => {
  const merge = (key: string): VoidMergeRecord => ({
    scope: 'instance',
    key,
    signature: 'abc',
    members: [{ signature: 'def', offset: { x: 3, y: 0 } }],
  })

  it('COMBINE_VOIDS appends to voidMerges, creating the block', () => {
    let s = base()
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@0.00,0.00') } as Action)
    expect(s.editor!.decoration!.voidMerges).toHaveLength(1)
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@9.00,0.00') } as Action)
    expect(s.editor!.decoration!.voidMerges).toHaveLength(2)
  })

  it('appends rather than replacing a same-key record, so first-come still decides', () => {
    // Two records with the same anchor key are legitimately different combines
    // (different member sets). Upserting like a paint would silently discard
    // the older one and re-partition the field.
    let s = base()
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@0.00,0.00') } as Action)
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@0.00,0.00') } as Action)
    expect(s.editor!.decoration!.voidMerges).toHaveLength(2)
  })

  it('SEPARATE_VOIDS drops one by index and deletes the key when empty', () => {
    let s = base()
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@0.00,0.00') } as Action)
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@9.00,0.00') } as Action)
    s = reducer(s, { type: 'SEPARATE_VOIDS', payload: { index: 0 } } as Action)
    expect(s.editor!.decoration!.voidMerges).toEqual([merge('abc@9.00,0.00')])
    s = reducer(s, { type: 'SEPARATE_VOIDS', payload: { index: 0 } } as Action)
    expect('voidMerges' in s.editor!.decoration!).toBe(false)
  })

  it('ignores an out-of-range SEPARATE_VOIDS rather than dropping the wrong record', () => {
    let s = base()
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@0.00,0.00') } as Action)
    const before = s
    s = reducer(s, { type: 'SEPARATE_VOIDS', payload: { index: 5 } } as Action)
    expect(s).toBe(before)
  })

  it('CLEAR_DECORATION drops combines with everything else', () => {
    let s = base()
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@0.00,0.00') } as Action)
    s = reducer(s, { type: 'CLEAR_DECORATION' } as Action)
    expect(s.editor!.decoration).toBeUndefined()
  })

  it('round-trips through load validation', () => {
    let s = base()
    s = reducer(s, { type: 'COMBINE_VOIDS', payload: merge('abc@0.00,0.00') } as Action)
    const loaded = migrateEditorConfig(JSON.parse(JSON.stringify(s.editor)))
    expect(loaded!.decoration!.voidMerges).toEqual([merge('abc@0.00,0.00')])
  })

  it('drops a malformed merge record without losing the rest of the block', () => {
    const raw = {
      version: 1,
      strandColours: [],
      voidFills: [{ scope: 'congruent', key: 'abc', colour: '#111' }],
      voidMerges: [
        merge('abc@0.00,0.00'),
        { scope: 'instance', key: 'x', signature: 'y', members: [] },
        { scope: 'nonsense', key: 'x', signature: 'y', members: [{ signature: 'z', offset: { x: 1, y: 1 } }] },
      ],
    }
    const out = migrateDecoration(raw)
    expect(out!.voidMerges).toEqual([merge('abc@0.00,0.00')])
    expect(out!.voidFills).toHaveLength(1)
  })
})
