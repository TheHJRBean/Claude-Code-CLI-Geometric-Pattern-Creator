import { describe, it, expect } from 'vitest'
import type { PatternConfig } from '../../types/pattern'
import type { SavedConfig, SavedSourceCategory } from '../../state/configLibrary'
import {
  badgeForSave,
  editAvailabilityFor,
  nextBackfillId,
  resolveEditInLab,
  toCardModel,
} from './galleryBrowser.logic'

/** Minimal config with a given tiling type — enough for the pure logic, which
 *  only reads `tiling` (+ `frame` on conversion). */
function cfg(type: string, extra: Partial<PatternConfig> = {}): PatternConfig {
  return {
    tiling: { type, scale: 100 },
    figures: {},
    strand: {},
    lacing: {},
    ...extra,
  } as unknown as PatternConfig
}

function save(overrides: Partial<SavedConfig> & { sourceCategory: SavedSourceCategory }): SavedConfig {
  return {
    id: overrides.id ?? 'id-1',
    name: overrides.name ?? 'Saved',
    createdAt: overrides.createdAt ?? 0,
    config: overrides.config ?? cfg('square'),
    sourceCategory: overrides.sourceCategory,
  }
}

describe('badgeForSave', () => {
  it('gives no badge to editor-sourced saves', () => {
    expect(badgeForSave(save({ sourceCategory: 'editor', config: cfg('editor') }))).toBeNull()
  })
  it('labels legacy-path saves by category', () => {
    expect(badgeForSave(save({ sourceCategory: 'archimedean' }))).toBe('Archimedean')
    expect(badgeForSave(save({ sourceCategory: 'rosette-patch' }))).toBe('Rosette')
  })
})

describe('editAvailabilityFor', () => {
  it('editor configs edit directly', () => {
    expect(editAvailabilityFor(cfg('editor'))).toBe('direct')
  })
  it('tier-1 legacy presets convert', () => {
    expect(editAvailabilityFor(cfg('square'))).toBe('convert')
    expect(editAvailabilityFor(cfg('4.8.8'))).toBe('convert')
  })
  it('tier-2/3 legacy renders are unavailable', () => {
    expect(editAvailabilityFor(cfg('3.3.3.3.6'))).toBe('unavailable')
  })
})

describe('resolveEditInLab', () => {
  it('returns the editor config verbatim, unconverted', () => {
    const c = cfg('editor')
    const r = resolveEditInLab(c)
    expect(r).toEqual({ config: c, converted: false })
  })
  it('converts a tier-1 legacy preset one-way without mutating the input', () => {
    const c = cfg('square')
    const before = JSON.stringify(c)
    const r = resolveEditInLab(c)
    expect(r?.converted).toBe(true)
    expect(r?.config.tiling.type).toBe('editor')
    expect(r?.config.editor?.presetId).toBe('square')
    expect(JSON.stringify(c)).toBe(before)
  })
  it('returns null for a non-convertible legacy render', () => {
    expect(resolveEditInLab(cfg('3.3.3.3.6'))).toBeNull()
  })
})

describe('toCardModel', () => {
  it('projects the save into a view model', () => {
    const s = save({ id: 'x', name: 'My square', createdAt: 42, sourceCategory: 'archimedean', config: cfg('square') })
    expect(toCardModel(s)).toEqual({
      id: 'x',
      name: 'My square',
      createdAt: 42,
      badge: 'Archimedean',
      editAvailability: 'convert',
      isEditorSourced: false,
    })
  })
  it('marks editor saves as editor-sourced with a direct edit path', () => {
    const s = save({ id: 'y', sourceCategory: 'editor', config: cfg('editor') })
    const m = toCardModel(s)
    expect(m.isEditorSourced).toBe(true)
    expect(m.badge).toBeNull()
    expect(m.editAvailability).toBe('direct')
  })
})

describe('nextBackfillId', () => {
  const saves = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('returns the first uncovered save in list order', () => {
    expect(nextBackfillId(saves, new Set())).toBe('a')
    expect(nextBackfillId(saves, new Set(['a']))).toBe('b')
    expect(nextBackfillId(saves, new Set(['a', 'b']))).toBe('c')
  })
  it('skips covered ids (thumbs present or failed)', () => {
    expect(nextBackfillId(saves, new Set(['a', 'c']))).toBe('b')
  })
  it('returns null when every save is covered', () => {
    expect(nextBackfillId(saves, new Set(['a', 'b', 'c']))).toBeNull()
  })
})
