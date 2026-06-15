import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createConfigLibrary } from './configLibrary'
import type { PatternConfig } from '../types/pattern'

/**
 * Characterization tests for the localStorage-backed config library (Chunk 12).
 * Pin the CRUD round-trip, the version gate, the corrupt-entry skip, the
 * quota error path, and source-category inference. The node test env has no
 * localStorage, so we install an in-memory stand-in (matching the existing
 * colourPicker.logic test pattern).
 */

/** In-memory localStorage so the persistence paths run. */
function installLocalStorage(): { store: Map<string, string> } {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size },
  } as Storage
  return { store }
}

let ctx: { store: Map<string, string> }
beforeEach(() => {
  ctx = installLocalStorage()
})

function minimalConfig(type = '4.8.8'): PatternConfig {
  return {
    tiling: { type, scale: 1 },
    figures: { '8': { type: 'star', contactAngle: 67.5, lineLength: 1, autoLineLength: true } },
    strand: { width: 2, color: '#000', background: '#fff' },
  }
}

const KEY = 'test-library'

describe('createConfigLibrary — save / list round-trip', () => {
  it('starts empty and returns the storage key', () => {
    const lib = createConfigLibrary(KEY)
    expect(lib.storageKey).toBe(KEY)
    expect(lib.list()).toEqual([])
  })

  it('saves a named entry and lists it back', () => {
    const lib = createConfigLibrary(KEY)
    const res = lib.save('My pattern', minimalConfig())
    expect(res.error).toBeUndefined()
    expect(res.entry?.name).toBe('My pattern')
    expect(res.entry?.id).toBeTruthy()
    const list = lib.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('My pattern')
    expect(list[0].config.tiling.type).toBe('4.8.8')
  })

  it('trims the name and falls back to Untitled when blank', () => {
    const lib = createConfigLibrary(KEY)
    expect(lib.save('  spaced  ', minimalConfig()).entry?.name).toBe('spaced')
    expect(lib.save('   ', minimalConfig()).entry?.name).toBe('Untitled')
  })

  it('deep-clones the config so later mutation of the source does not leak', () => {
    const lib = createConfigLibrary(KEY)
    const cfg = minimalConfig()
    lib.save('a', cfg)
    cfg.tiling.type = 'mutated'
    expect(lib.list()[0].config.tiling.type).toBe('4.8.8')
  })
})

describe('createConfigLibrary — source category inference', () => {
  it('tags editor tilings as editor', () => {
    const lib = createConfigLibrary(KEY)
    const cfg = minimalConfig('editor')
    cfg.editor = { version: 3, cells: [], activeCellId: 'main', edgeLength: 40 } as PatternConfig['editor']
    // editor configs without a payload would fail validation on read; supply a
    // minimal valid-ish editor only matters for category, which is set on save.
    const res = lib.save('ed', cfg)
    expect(res.entry?.sourceCategory).toBe('editor')
  })

  it('tags a known archimedean tiling as archimedean', () => {
    const lib = createConfigLibrary(KEY)
    expect(lib.save('arch', minimalConfig('4.8.8')).entry?.sourceCategory).toBe('archimedean')
  })
})

describe('createConfigLibrary — rename / delete / duplicate / get', () => {
  it('renames an entry, ignoring a blank new name', () => {
    const lib = createConfigLibrary(KEY)
    const id = lib.save('orig', minimalConfig()).entry!.id
    expect(lib.rename(id, 'renamed')).toBeNull()
    expect(lib.get(id)?.name).toBe('renamed')
    lib.rename(id, '   ')
    expect(lib.get(id)?.name).toBe('renamed') // unchanged
  })

  it('deletes an entry', () => {
    const lib = createConfigLibrary(KEY)
    const id = lib.save('gone', minimalConfig()).entry!.id
    expect(lib.delete(id)).toBeNull()
    expect(lib.get(id)).toBeNull()
    expect(lib.list()).toHaveLength(0)
  })

  it('duplicates an entry with a new id and "(copy)" suffix', () => {
    const lib = createConfigLibrary(KEY)
    const id = lib.save('src', minimalConfig()).entry!.id
    const dup = lib.duplicate(id)
    expect(dup.entry?.id).not.toBe(id)
    expect(dup.entry?.name).toBe('src (copy)')
    expect(lib.list()).toHaveLength(2)
  })

  it('returns a corrupt error when duplicating a missing id', () => {
    const lib = createConfigLibrary(KEY)
    const dup = lib.duplicate('nope')
    expect(dup.entry).toBeUndefined()
    expect(dup.error?.kind).toBe('corrupt')
  })

  it('get returns null for an unknown id', () => {
    expect(createConfigLibrary(KEY).get('nope')).toBeNull()
  })
})

describe('createConfigLibrary — resilient reads', () => {
  it('returns empty on non-JSON storage', () => {
    ctx.store.set(KEY, 'not json{')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(createConfigLibrary(KEY).list()).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns empty on a wrong version envelope', () => {
    ctx.store.set(KEY, JSON.stringify({ version: 99, entries: [] }))
    expect(createConfigLibrary(KEY).list()).toEqual([])
  })

  it('skips a corrupt entry but keeps the valid ones', () => {
    const lib = createConfigLibrary(KEY)
    const good = lib.save('good', minimalConfig()).entry!
    // hand-inject a row whose config fails validation
    const raw = JSON.parse(ctx.store.get(KEY)!)
    raw.entries.push({ id: 'bad', name: 'bad', createdAt: 0, config: { tiling: 'broken' }, sourceCategory: 'archimedean' })
    ctx.store.set(KEY, JSON.stringify(raw))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = lib.list()
    expect(list.map(e => e.id)).toEqual([good.id])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('skips entries missing id or name', () => {
    ctx.store.set(KEY, JSON.stringify({
      version: 1,
      entries: [{ name: 'no-id', config: {} }, { id: 'x', config: {} }],
    }))
    expect(createConfigLibrary(KEY).list()).toEqual([])
  })
})

describe('createConfigLibrary — quota handling', () => {
  it('returns a quota error when setItem throws QuotaExceededError', () => {
    const lib = createConfigLibrary(KEY)
    const orig = globalThis.localStorage.setItem
    globalThis.localStorage.setItem = () => {
      const err = new DOMException('full', 'QuotaExceededError')
      throw err
    }
    const res = lib.save('x', minimalConfig())
    expect(res.error?.kind).toBe('quota')
    globalThis.localStorage.setItem = orig
  })
})
