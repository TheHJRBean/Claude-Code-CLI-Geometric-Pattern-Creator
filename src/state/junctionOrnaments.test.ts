import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import type { JunctionOrnamentStyle } from '../types/editor'
import { DEFAULT_JUNCTION_ORNAMENT } from '../decoration/junctionOrnaments'
import { migrateDecoration } from '../editor/migrations'
import { hasDecoration, patternDecoration } from '../decoration/store'
import { DESIGN_MODE_ACTIONS, historyCoalesceKey } from '../editor/history'
import { loadPatternConfig } from './configValidation'
import type { Action } from './actions'

const base = (): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor: createDefaultEditorConfig(),
})

/** A legacy substrate (Gallery preset / Generator sample): no Patch, so its
 *  decoration lives at the top level (`decoration/store.ts`). */
const legacy = (): PatternConfig => structuredClone(DEFAULT_CONFIG)

const style = (over: Partial<JunctionOrnamentStyle> = {}): JunctionOrnamentStyle =>
  ({ ...DEFAULT_JUNCTION_ORNAMENT, ...over })

/** A CANVAS click: carries `toggle`, so an identical re-application clears. */
const place = (key: string, s: JunctionOrnamentStyle, scope: 'congruent' | 'patch' | 'instance' = 'congruent') =>
  ({ type: 'SET_JUNCTION_ORNAMENT', payload: { scope, key, style: s, toggle: true } } as Action)

/** A PANEL edit: no `toggle`, so it always upserts. */
const edit = (key: string, s: JunctionOrnamentStyle) =>
  ({ type: 'SET_JUNCTION_ORNAMENT', payload: { scope: 'congruent', key, style: s } } as Action)

describe('SET_JUNCTION_ORNAMENT', () => {
  it('creates the decoration block and upserts by (scope, key)', () => {
    let s = reducer(base(), place('jA', style({ colour: '#111' })))
    expect(s.editor!.decoration!.junctionOrnaments).toEqual([
      { scope: 'congruent', key: 'jA', ...style({ colour: '#111' }) },
    ])
    s = reducer(s, place('jA', style({ colour: '#222' })))
    expect(s.editor!.decoration!.junctionOrnaments).toHaveLength(1)
    expect(s.editor!.decoration!.junctionOrnaments![0].colour).toBe('#222')
  })

  it('re-applying an IDENTICAL ornament removes it (the click that places also clears)', () => {
    let s = reducer(base(), place('jA', style()))
    s = reducer(s, place('jA', style()))
    expect(s.editor!.decoration!.junctionOrnaments).toBeUndefined()
  })

  it('a PANEL edit never toggles off — the draft syncs live onto its group', () => {
    // Dragging a slider back through its previous value must not delete the
    // record it is editing.
    let s = reducer(base(), edit('jA', style({ size: 3 })))
    s = reducer(s, edit('jA', style({ size: 4 })))
    s = reducer(s, edit('jA', style({ size: 3 })))
    expect(s.editor!.decoration!.junctionOrnaments).toHaveLength(1)
    expect(s.editor!.decoration!.junctionOrnaments![0].size).toBe(3)
  })

  it('a difference the renderer can see is a restyle, not a toggle-off', () => {
    let s = reducer(base(), place('jA', style({ hollow: true })))
    s = reducer(s, place('jA', style({ hollow: true, hollowFill: '#fff' })))
    expect(s.editor!.decoration!.junctionOrnaments).toHaveLength(1)
    expect(s.editor!.decoration!.junctionOrnaments![0].hollowFill).toBe('#fff')
    // …including the two that change nothing about the SHAPE.
    s = reducer(s, place('jA', style({ hollow: true, hollowFill: '#fff', layer: 'under' })))
    s = reducer(s, place('jA', style({ hollow: true, hollowFill: '#fff', layer: 'under', matchStrandColour: true })))
    expect(s.editor!.decoration!.junctionOrnaments).toHaveLength(1)
    expect(s.editor!.decoration!.junctionOrnaments![0].matchStrandColour).toBe(true)
  })

  it('`style: null` removes the record explicitly', () => {
    let s = reducer(base(), place('jA', style()))
    s = reducer(s, { type: 'SET_JUNCTION_ORNAMENT', payload: { scope: 'congruent', key: 'jA', style: null } } as Action)
    expect(s.editor!.decoration!.junctionOrnaments).toBeUndefined()
  })

  it('clears FINER records masking the clicked junction ("paint what you see")', () => {
    // A Single ornament on one crossing, then a Matching ornament covering it:
    // without the unmask the instance record would keep winning and the click
    // would look dead.
    let s = reducer(base(), place('jA@1.00,2.00', style({ colour: '#111' }), 'instance'))
    s = reducer(s, {
      type: 'SET_JUNCTION_ORNAMENT',
      payload: {
        scope: 'congruent', key: 'jA', style: style({ colour: '#222' }),
        clicked: { signature: 'jA', instanceKey: 'jA@1.00,2.00' },
      },
    } as Action)
    expect(s.editor!.decoration!.junctionOrnaments).toEqual([
      { scope: 'congruent', key: 'jA', ...style({ colour: '#222' }) },
    ])
  })

  it('writes to the legacy substrate’s home when there is no Patch', () => {
    const s = reducer(legacy(), place('jA', style()))
    expect(s.editor).toBeUndefined()
    expect(s.decoration!.junctionOrnaments).toHaveLength(1)
    expect(patternDecoration(s)!.junctionOrnaments).toHaveLength(1)
  })

  it('refuses to attach ornaments to an empty Lab (no substrate to decorate)', () => {
    const empty: PatternConfig = { ...structuredClone(DEFAULT_CONFIG), tiling: { type: '', scale: 1 } }
    expect(reducer(empty, place('jA', style()))).toBe(empty)
  })
})

describe('CLEAR_JUNCTION_ORNAMENTS', () => {
  it('drops every ornament but keeps the rest of the decoration', () => {
    let s = reducer(base(), { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: 'v', colour: '#111' } } as Action)
    s = reducer(s, place('jA', style()))
    s = reducer(s, { type: 'CLEAR_JUNCTION_ORNAMENTS' } as Action)
    expect(s.editor!.decoration!.junctionOrnaments).toBeUndefined()
    expect(s.editor!.decoration!.voidFills).toHaveLength(1)
  })

  it('is a no-op with nothing to clear', () => {
    const s = base()
    expect(reducer(s, { type: 'CLEAR_JUNCTION_ORNAMENTS' } as Action)).toBe(s)
  })
})

describe('ornaments count as decoration', () => {
  it('hasDecoration sees a pattern carrying only ornaments', () => {
    // Drives the Clear-paint button: a pattern with nothing but ornaments must
    // not read as unpainted.
    expect(hasDecoration(reducer(base(), place('jA', style())))).toBe(true)
  })

  it('CLEAR_DECORATION removes them with everything else', () => {
    const s = reducer(reducer(base(), place('jA', style())), { type: 'CLEAR_DECORATION' } as Action)
    expect(patternDecoration(s)).toBeUndefined()
  })
})

describe('undo', () => {
  it('both ornament actions are on the Design-mode undo allowlist', () => {
    expect(DESIGN_MODE_ACTIONS.has('SET_JUNCTION_ORNAMENT')).toBe(true)
    expect(DESIGN_MODE_ACTIONS.has('CLEAR_JUNCTION_ORNAMENTS')).toBe(true)
  })

  it('two junctions ornamented in quick succession stay two undo steps', () => {
    const a = historyCoalesceKey(place('jA', style()) as { type: string; payload?: unknown })
    const b = historyCoalesceKey(place('jB', style()) as { type: string; payload?: unknown })
    expect(a).not.toBe(b)
  })
})

describe('persistence', () => {
  const record = { scope: 'congruent', key: 'jA', shape: 'star', size: 3, colour: '#abc', points: 5, hollow: true, hollowFill: '#fff', outlineWidth: 0.3, align: 'upright', angle: 12, layer: 'under', matchStrandColour: true }

  it('round-trips through the decoration validator', () => {
    const out = migrateDecoration({ version: 1, strandColours: [], voidFills: [], junctionOrnaments: [record] })
    expect(out!.junctionOrnaments).toEqual([record])
  })

  it('survives the OTHER schema gate too — the allow-list deletes unlisted fields', () => {
    // Decoration has two homes; a legacy substrate's block goes through
    // `loadPatternConfig`'s reader, and a field missing from that reader is
    // silently dropped on every save/load.
    const cfg = reducer(legacy(), place('jA', style({ shape: 'twinkle' })))
    const round = loadPatternConfig(JSON.parse(JSON.stringify(cfg)))
    expect(round.decoration!.junctionOrnaments).toHaveLength(1)
    expect(round.decoration!.junctionOrnaments![0].shape).toBe('twinkle')
  })

  it('drops a malformed record without losing the rest of the decoration', () => {
    const out = migrateDecoration({
      version: 1,
      strandColours: [],
      voidFills: [{ scope: 'congruent', key: 'v', colour: '#111' }],
      junctionOrnaments: [{ scope: 'congruent', key: 'jA', shape: 'blob', size: 3, colour: '#abc' }],
    })
    expect(out!.junctionOrnaments).toBeUndefined()
    expect(out!.voidFills).toHaveLength(1)
  })

  it('strips a malformed knob rather than dropping the ornament', () => {
    const out = migrateDecoration({
      version: 1,
      strandColours: [],
      voidFills: [],
      junctionOrnaments: [{ scope: 'congruent', key: 'jA', shape: 'dot', size: 3, colour: '#abc', points: 'six', align: 'sideways' }],
    })
    expect(out!.junctionOrnaments).toEqual([{ scope: 'congruent', key: 'jA', shape: 'dot', size: 3, colour: '#abc' }])
  })
})
