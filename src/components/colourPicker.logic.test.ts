import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isHexColour,
  normaliseEyeDropperHex,
  pushRecentColour,
  getRecents,
  subscribeRecents,
  loadUserThemes,
  createUserTheme,
  addColourToTheme,
  removeColourFromTheme,
  deleteUserTheme,
  THEMES_KEY,
  type ColourTheme,
} from './colourPicker.logic'

/** In-memory localStorage so the persistence paths run (node test env has none). */
function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size },
  } as Storage
  return store
}

beforeEach(() => {
  installLocalStorage()
})

describe('isHexColour', () => {
  it('accepts canonical #rrggbb (any case)', () => {
    expect(isHexColour('#000000')).toBe(true)
    expect(isHexColour('#ffffff')).toBe(true)
    expect(isHexColour('#C9943A')).toBe(true)
  })
  it('rejects shorthand, 8-digit, missing hash, non-hex, empty', () => {
    expect(isHexColour('#fff')).toBe(false)
    expect(isHexColour('#ffffffff')).toBe(false)
    expect(isHexColour('c9943a')).toBe(false)
    expect(isHexColour('#gggggg')).toBe(false)
    expect(isHexColour('')).toBe(false)
    expect(isHexColour('red')).toBe(false)
  })
})

describe('normaliseEyeDropperHex', () => {
  it('lower-cases a valid 6-digit result', () => {
    expect(normaliseEyeDropperHex('#C9943A')).toBe('#c9943a')
  })
  it('drops the alpha from a 9-char #rrggbbaa', () => {
    expect(normaliseEyeDropperHex('#C9943Aff')).toBe('#c9943a')
  })
  it('returns null for an unparseable result', () => {
    expect(normaliseEyeDropperHex('rgb(1,2,3)')).toBeNull()
    expect(normaliseEyeDropperHex('#fff')).toBeNull()
  })
})

describe('recent-colours store', () => {
  it('records newest-first, deduping a repeat', () => {
    pushRecentColour('#111111')
    pushRecentColour('#222222')
    pushRecentColour('#111111') // moves to front
    expect(getRecents().slice(0, 2)).toEqual(['#111111', '#222222'])
  })
  it('is a no-op when the colour is already at the front', () => {
    pushRecentColour('#abcdef')
    const before = getRecents()
    pushRecentColour('#ABCDEF') // same colour, lower-cased
    expect(getRecents()).toBe(before) // identical reference — no update
  })
  it('lower-cases on the way in', () => {
    pushRecentColour('#ABCDEF')
    expect(getRecents()[0]).toBe('#abcdef')
  })
  it('ignores invalid colours', () => {
    const before = getRecents()
    pushRecentColour('not-a-colour')
    expect(getRecents()).toBe(before)
  })
  it('caps the list at 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      pushRecentColour('#' + i.toString(16).padStart(6, '0'))
    }
    expect(getRecents().length).toBe(10)
  })
  it('notifies subscribers on a real change', () => {
    const fn = vi.fn()
    const unsub = subscribeRecents(fn)
    pushRecentColour('#0a0a0a')
    expect(fn).toHaveBeenCalled()
    unsub()
    fn.mockClear()
    pushRecentColour('#0b0b0b')
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('loadUserThemes', () => {
  it('returns [] for absent/garbage/non-array storage', () => {
    expect(loadUserThemes()).toEqual([])
    localStorage.setItem(THEMES_KEY, 'not json')
    expect(loadUserThemes()).toEqual([])
    localStorage.setItem(THEMES_KEY, '{"id":"x"}')
    expect(loadUserThemes()).toEqual([])
  })
  it('round-trips a well-formed theme array', () => {
    const themes: ColourTheme[] = [{ id: 'user-1', name: 'Mine', colours: ['#111111'] }]
    localStorage.setItem(THEMES_KEY, JSON.stringify(themes))
    expect(loadUserThemes()).toEqual(themes)
  })
  it('filters out malformed entries', () => {
    localStorage.setItem(THEMES_KEY, JSON.stringify([
      { id: 'ok', name: 'Good', colours: ['#111111'] },
      { id: 5, name: 'bad id', colours: [] },
      { id: 'nocolours', name: 'x' },
      { id: 'badcolours', name: 'x', colours: [1, 2] },
    ]))
    expect(loadUserThemes()).toEqual([{ id: 'ok', name: 'Good', colours: ['#111111'] }])
  })
})

describe('theme transforms (pure)', () => {
  const base: ColourTheme[] = [
    { id: 'a', name: 'A', colours: ['#111111', '#222222'] },
    { id: 'b', name: 'B', colours: ['#333333'] },
  ]

  it('createUserTheme seeds one lower-cased colour', () => {
    expect(createUserTheme('  Sunset ', '#AABBCC', 'user-7')).toEqual({
      id: 'user-7', name: 'Sunset', colours: ['#aabbcc'],
    })
  })
  it('createUserTheme returns null for an empty name', () => {
    expect(createUserTheme('   ', '#aabbcc', 'user-7')).toBeNull()
  })

  it('addColourToTheme appends to the named theme only', () => {
    const next = addColourToTheme(base, 'a', '#ABCDEF')
    expect(next[0].colours).toEqual(['#111111', '#222222', '#abcdef'])
    expect(next[1]).toBe(base[1]) // untouched theme keeps its identity
  })
  it('addColourToTheme skips an existing colour (no dup, same ref)', () => {
    const next = addColourToTheme(base, 'a', '#222222')
    expect(next[0].colours).toEqual(['#111111', '#222222'])
    expect(next).toEqual(base)
  })

  it('removeColourFromTheme drops the exact colour from the named theme', () => {
    const next = removeColourFromTheme(base, 'a', '#111111')
    expect(next[0].colours).toEqual(['#222222'])
    expect(next[1]).toBe(base[1])
  })

  it('deleteUserTheme removes only the named theme', () => {
    expect(deleteUserTheme(base, 'a')).toEqual([{ id: 'b', name: 'B', colours: ['#333333'] }])
  })
})
