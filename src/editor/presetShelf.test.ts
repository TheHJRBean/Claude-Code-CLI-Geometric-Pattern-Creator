import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildPresetShelf,
  buildPresetConfig,
  isStructuralEditAction,
  shouldShowStructuralEditNote,
  actionResetsDirty,
} from './presetShelf'
import { TILINGS } from '../tilings/index'
import { isConvertiblePreset } from './presetConversion'
import { migrateEditorConfig } from './migrations'
import { createConfigLibrary } from '../state/configLibrary'
import type { Action } from '../state/actions'

/**
 * Presets shelf (ADR-0006 slice 4, ticket #5) — pure-logic seam: shelf
 * assembly over the preset catalogue, fresh-conversion loading with
 * provenance, structural-edit classification for the one-time note, and
 * the dirty-flag transitions behind the unsaved-changes guard.
 */

describe('buildPresetShelf', () => {
  const shelf = buildPresetShelf()

  it('renders every Gallery preset', () => {
    expect(shelf.map(e => e.id).sort()).toEqual(Object.keys(TILINGS).sort())
  })

  it('orders tiers ascending', () => {
    const tiers = shelf.map(e => e.tier)
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers)
  })

  it('marks the convertible tier-1 presets editable', () => {
    for (const id of ['square', 'hexagonal', 'triangular', '4.8.8', '3.12.12', '4.6.12', '3.6.3.6', '3.4.6.4', '3.3.3.4.4', '3.3.4.3.4', '3.3.3.3.6']) {
      const entry = shelf.find(e => e.id === id)
      expect(entry, id).toBeDefined()
      expect(entry!.tier, id).toBe(1)
      expect(entry!.viewOnly, id).toBe(false)
    }
  })

  it('tier 2 is empty — every Archimedean preset converts (#16 closed the set)', () => {
    expect(shelf.filter(e => e.tier === 2)).toEqual([])
    for (const def of Object.values(TILINGS)) {
      if (def.category === 'archimedean') {
        expect(shelf.find(e => e.id === def.name)!.tier, def.name).toBe(1)
      }
    }
  })

  it('badges rosette-patch presets as tier-3 view-only', () => {
    const cairo = shelf.find(e => e.id === 'cairo-pentagonal')!
    expect(cairo.tier).toBe(3)
    expect(cairo.viewOnly).toBe(true)
    // Every rosette-patch catalogue entry is tier 3.
    for (const def of Object.values(TILINGS)) {
      if (def.category === 'rosette-patch') {
        expect(shelf.find(e => e.id === def.name)!.tier, def.name).toBe(3)
      }
    }
  })

  it('view-only is exactly the non-convertible set', () => {
    for (const entry of shelf) {
      expect(entry.viewOnly, entry.id).toBe(!isConvertiblePreset(entry.id))
    }
  })
})

describe('buildPresetConfig', () => {
  it('returns null for unknown ids', () => {
    expect(buildPresetConfig('no-such-preset')).toBeNull()
  })

  it('tier-1 loads as an editable Patch with provenance', () => {
    const cfg = buildPresetConfig('4.8.8')!
    expect(cfg.tiling.type).toBe('editor')
    expect(cfg.editor).toBeDefined()
    expect(cfg.editor!.presetId).toBe('4.8.8')
    // Loadable exactly like a user-authored Patch: survives the migrator
    // round-trip the load path applies.
    const roundTrip = migrateEditorConfig(JSON.parse(JSON.stringify(cfg.editor)))
    expect(roundTrip).not.toBeNull()
    expect(roundTrip!.cells.length).toBeGreaterThan(1)
  })

  it('tier-1 carries the preset default figures', () => {
    const cfg = buildPresetConfig('square')!
    expect(cfg.figures['4']).toEqual(TILINGS['square'].defaultConfig.figures!['4'])
  })

  it('every load is a fresh conversion — no shared objects across clicks', () => {
    const a = buildPresetConfig('3.6.3.6')!
    const b = buildPresetConfig('3.6.3.6')!
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    expect(a.editor!.cells[0]).not.toBe(b.editor!.cells[0])
    expect(a.figures).not.toBe(b.figures)
    // Editing one working copy never touches the catalogue or a later load.
    a.figures['3']!.contactAngle = 12
    expect(b.figures['3']!.contactAngle).not.toBe(12)
    expect(TILINGS['3.6.3.6'].defaultConfig.figures!['3'].contactAngle).not.toBe(12)
  })

  it('view-only presets load the legacy Gallery config', () => {
    const cfg = buildPresetConfig('cairo-pentagonal')!
    expect(cfg.tiling.type).toBe('cairo-pentagonal')
    expect(cfg.editor).toBeUndefined()
    expect(cfg.figures['5']).toEqual(TILINGS['cairo-pentagonal'].defaultConfig.figures!['5'])
  })
})

describe('structural-edit classification', () => {
  const structural: Action[] = [
    { type: 'EDITOR_PLACE_TILE_ON_EDGE', payload: { tileId: 't', edgeIndex: 0, sides: 4 } },
    { type: 'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION', payload: { edgeIndex: 0, sectionIndex: 0, sides: 4 } },
    { type: 'EDITOR_PLACE_TILE_ON_VERTEX', payload: { vertexKey: 'v', sides: 4, rotation: 0 } },
    { type: 'EDITOR_DELETE_TILE', payload: { tileId: 't' } },
    { type: 'EDITOR_COMPLETE_GAP', payload: { pA: { x: 0, y: 0 }, pB: { x: 1, y: 0 } } },
    { type: 'EDITOR_COMPLETE_N_GAP', payload: { picks: [] } },
    { type: 'EDITOR_RUN_AUTO_COMPLETE' },
    { type: 'SET_CELL_BOUNDARY_SIZE', payload: 300 },
  ]
  const silent: Action[] = [
    { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '4', angle: 45 } },
    { type: 'SET_LINE_LENGTH', payload: { tileTypeId: '4', lineLength: 0.5 } },
    { type: 'SET_STRAND_STYLE', payload: { width: 2 } },
    { type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: '*', colour: '#fff' } },
    { type: 'SET_EDITOR_SYMMETRY_MODE', payload: { mode: 'none' } },
    { type: 'SET_FRAME', payload: null },
    { type: 'LOAD_CONFIG', payload: { tiling: { type: '', scale: 100 }, figures: {}, strand: { width: 4, color: '#000', background: '#fff' } } },
  ]

  it('classifies place / delete / Complete / boundary resize as structural', () => {
    for (const a of structural) expect(isStructuralEditAction(a), a.type).toBe(true)
  })

  it('θ / figure / strand / decoration edits are silent', () => {
    for (const a of silent) expect(isStructuralEditAction(a), a.type).toBe(false)
  })

  it('note shows only for a structural edit of a converted preset, once', () => {
    const place = structural[0]
    expect(shouldShowStructuralEditNote(place, '4.8.8', false)).toBe(true)
    expect(shouldShowStructuralEditNote(place, '4.8.8', true)).toBe(false)
    expect(shouldShowStructuralEditNote(place, undefined, false)).toBe(false)
    expect(shouldShowStructuralEditNote(silent[0], '4.8.8', false)).toBe(false)
  })
})

describe('dirty-flag transitions (unsaved-changes guard)', () => {
  it('load / new / clear reset dirty; mutations do not', () => {
    expect(actionResetsDirty({ type: 'EDITOR_NEW' })).toBe(true)
    expect(actionResetsDirty({ type: 'EDITOR_CLEAR' })).toBe(true)
    expect(actionResetsDirty({
      type: 'LOAD_CONFIG',
      payload: { tiling: { type: '', scale: 100 }, figures: {}, strand: { width: 4, color: '#000', background: '#fff' } },
    })).toBe(true)
    expect(actionResetsDirty({ type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '4', angle: 45 } })).toBe(false)
    expect(actionResetsDirty({ type: 'EDITOR_DELETE_TILE', payload: { tileId: 't' } })).toBe(false)
  })
})

describe('saving an edited preset (provenance through the library)', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
      key: () => null,
      get length() { return store.size },
    } as Storage
  })

  it('lands in the library with presetId provenance intact', () => {
    const lib = createConfigLibrary('presetShelf-test-lib')
    const working = buildPresetConfig('3.12.12')!
    working.figures['3']!.contactAngle = 55 // an edit
    const result = lib.save('My edited preset', working)
    expect(result.error).toBeUndefined()
    const loaded = lib.get(result.entry!.id)!
    expect(loaded.config.editor!.presetId).toBe('3.12.12')
    expect(loaded.config.figures['3']!.contactAngle).toBe(55)
    expect(loaded.sourceCategory).toBe('editor')
  })
})
