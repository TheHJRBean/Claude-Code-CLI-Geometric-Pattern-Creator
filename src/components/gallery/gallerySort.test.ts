import { describe, it, expect } from 'vitest'
import type { PatternConfig } from '../../types/pattern'
import type { SavedConfig, SavedSourceCategory } from '../../state/configLibrary'
import {
  cardMetaFor,
  DEFAULT_GALLERY_SORT,
  filterSaves,
  formatRelativeTime,
  GALLERY_SORT_OPTIONS,
  groupedSortOptions,
  kindLabelFor,
  parseSortKey,
  sortSaves,
  type GallerySortKey,
} from './gallerySort'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function cfg(type = 'square', editor?: PatternConfig['editor']): PatternConfig {
  return { tiling: { type, scale: 100 }, figures: {}, strand: {}, editor } as unknown as PatternConfig
}

interface SaveOverrides {
  id?: string
  name?: string
  createdAt?: number
  updatedAt?: number
  lastOpenedAt?: number
  sourceCategory?: SavedSourceCategory
  config?: PatternConfig
}

function save(o: SaveOverrides = {}): SavedConfig {
  const createdAt = o.createdAt ?? 0
  return {
    id: o.id ?? 'id',
    name: o.name ?? 'Saved',
    createdAt,
    updatedAt: o.updatedAt ?? createdAt,
    lastOpenedAt: o.lastOpenedAt,
    config: o.config ?? cfg(),
    sourceCategory: o.sourceCategory ?? 'archimedean',
  }
}

const names = (list: SavedConfig[]) => list.map(s => s.name)

describe('sortSaves — time orderings', () => {
  const a = save({ id: 'a', name: 'Alpha', createdAt: 100, updatedAt: 900, lastOpenedAt: 300 })
  const b = save({ id: 'b', name: 'Bravo', createdAt: 300, updatedAt: 400, lastOpenedAt: 800 })
  const c = save({ id: 'c', name: 'Charlie', createdAt: 200, updatedAt: 700 })
  const all = [a, b, c]

  it('orders by edit time, newest first', () => {
    expect(names(sortSaves(all, 'updated-desc'))).toEqual(['Alpha', 'Charlie', 'Bravo'])
  })
  it('orders by edit time, oldest first', () => {
    expect(names(sortSaves(all, 'updated-asc'))).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })
  it('orders by creation time in both directions', () => {
    expect(names(sortSaves(all, 'created-desc'))).toEqual(['Bravo', 'Charlie', 'Alpha'])
    expect(names(sortSaves(all, 'created-asc'))).toEqual(['Alpha', 'Charlie', 'Bravo'])
  })
  it('separates creation from edit order — an old pattern edited today is not "newest"', () => {
    // Alpha is the oldest save but the most recently edited; the two time
    // orderings must disagree, otherwise one of them is redundant.
    expect(names(sortSaves(all, 'created-asc'))[0]).toBe('Alpha')
    expect(names(sortSaves(all, 'updated-desc'))[0]).toBe('Alpha')
    expect(names(sortSaves(all, 'created-desc'))[0]).toBe('Bravo')
  })
  it('sinks never-opened saves below every opened one', () => {
    expect(names(sortSaves(all, 'opened-desc'))).toEqual(['Bravo', 'Alpha', 'Charlie'])
  })
  it('orders several never-opened saves by name rather than storage order', () => {
    const x = save({ id: 'x', name: 'Zulu' })
    const y = save({ id: 'y', name: 'Yankee' })
    expect(names(sortSaves([x, y], 'opened-desc'))).toEqual(['Yankee', 'Zulu'])
  })
})

describe('sortSaves — name orderings', () => {
  const list = [
    save({ id: '1', name: 'star 10' }),
    save({ id: '2', name: 'Star 2' }),
    save({ id: '3', name: 'abacus' }),
  ]
  it('sorts A–Z case-insensitively, with numbers in numeric order', () => {
    expect(names(sortSaves(list, 'name-asc'))).toEqual(['abacus', 'Star 2', 'star 10'])
  })
  it('sorts Z–A as the exact reverse', () => {
    expect(names(sortSaves(list, 'name-desc'))).toEqual(['star 10', 'Star 2', 'abacus'])
  })
})

describe('sortSaves — pattern kind', () => {
  it('groups Builder saves first, then legacy paths, each grouped by kind', () => {
    const list = [
      save({ id: '1', name: 'Rose', sourceCategory: 'rosette-patch', config: cfg('pentagonal-rosette') }),
      save({ id: '2', name: 'Sq', sourceCategory: 'archimedean', config: cfg('square') }),
      save({ id: '3', name: 'Patch', sourceCategory: 'editor', config: cfg('editor') }),
      save({ id: '4', name: 'Hex', sourceCategory: 'archimedean', config: cfg('hexagonal') }),
    ]
    expect(names(sortSaves(list, 'kind'))).toEqual(['Patch', 'Hex', 'Sq', 'Rose'])
  })

  it('keeps same-kind saves adjacent and name-ordered', () => {
    const list = [
      save({ id: '1', name: 'Zeta', config: cfg('square') }),
      save({ id: '2', name: 'Alpha', config: cfg('square') }),
      save({ id: '3', name: 'Mid', config: cfg('hexagonal') }),
    ]
    expect(names(sortSaves(list, 'kind'))).toEqual(['Mid', 'Alpha', 'Zeta'])
  })
})

describe('sortSaves — general contract', () => {
  it('does not mutate the input array', () => {
    const list = [save({ id: 'b', name: 'B', createdAt: 2 }), save({ id: 'a', name: 'A', createdAt: 1 })]
    const before = names(list)
    sortSaves(list, 'created-asc')
    expect(names(list)).toEqual(before)
  })

  it('breaks exact ties by name then id, so a same-millisecond batch is stable', () => {
    const list = [
      save({ id: 'z', name: 'Same', createdAt: 5, updatedAt: 5 }),
      save({ id: 'a', name: 'Same', createdAt: 5, updatedAt: 5 }),
      save({ id: 'm', name: 'Другое', createdAt: 5, updatedAt: 5 }),
    ]
    const ids = sortSaves(list, 'updated-desc').map(s => s.id)
    expect(ids).toEqual(sortSaves([...list].reverse(), 'updated-desc').map(s => s.id))
    expect(ids.slice(0, 2)).toEqual(['a', 'z'])
  })

  it('handles every advertised key', () => {
    const list = [save({ id: 'a', name: 'A' }), save({ id: 'b', name: 'B' })]
    for (const option of GALLERY_SORT_OPTIONS) {
      expect(sortSaves(list, option.key)).toHaveLength(2)
    }
  })

  it('falls back to the default ordering for an unknown key', () => {
    const list = [save({ id: 'a', name: 'A', updatedAt: 1 }), save({ id: 'b', name: 'B', updatedAt: 2 })]
    expect(names(sortSaves(list, 'nonsense' as GallerySortKey))).toEqual(['B', 'A'])
  })
})

describe('parseSortKey', () => {
  it('accepts every advertised key', () => {
    for (const option of GALLERY_SORT_OPTIONS) {
      expect(parseSortKey(option.key)).toBe(option.key)
    }
  })
  it('falls back to the default for junk, null, or a retired key', () => {
    expect(parseSortKey(null)).toBe(DEFAULT_GALLERY_SORT)
    expect(parseSortKey('was-a-key-once')).toBe(DEFAULT_GALLERY_SORT)
    expect(parseSortKey(7)).toBe(DEFAULT_GALLERY_SORT)
  })
})

describe('groupedSortOptions', () => {
  it('covers every option exactly once, in declaration order', () => {
    const flat = groupedSortOptions().flatMap(g => g.options.map(o => o.key))
    expect(flat).toEqual(GALLERY_SORT_OPTIONS.map(o => o.key))
  })
  it('emits one entry per contiguous group', () => {
    expect(groupedSortOptions().map(g => g.group)).toEqual(['Time', 'Name', 'Kind'])
  })
})

describe('kindLabelFor', () => {
  it('names a Builder save by its Configuration', () => {
    const s = save({
      sourceCategory: 'editor',
      config: cfg('editor', { version: 3, configuration: '4.8.8' } as PatternConfig['editor']),
    })
    expect(kindLabelFor(s)).toBe('Builder · 4.8.8')
  })
  it('falls back to plain Builder for a free-form Patch', () => {
    const s = save({ sourceCategory: 'editor', config: cfg('editor') })
    expect(kindLabelFor(s)).toBe('Builder')
  })
  it('uses the tiling label for a legacy save', () => {
    expect(kindLabelFor(save({ config: cfg('square') }))).toBe('Square {4,4}')
  })
  it('falls back to the raw type for an unknown tiling', () => {
    expect(kindLabelFor(save({ config: cfg('not-a-tiling') }))).toBe('not-a-tiling')
  })
})

describe('formatRelativeTime', () => {
  const now = 10 * DAY
  it('describes recent times in the largest sensible unit', () => {
    expect(formatRelativeTime(now - 5_000, now)).toBe('just now')
    expect(formatRelativeTime(now - 4 * MINUTE, now)).toBe('4 min ago')
    expect(formatRelativeTime(now - HOUR, now)).toBe('1 hr ago')
    expect(formatRelativeTime(now - 5 * HOUR, now)).toBe('5 hrs ago')
    expect(formatRelativeTime(now - DAY, now)).toBe('1 day ago')
    expect(formatRelativeTime(now - 3 * DAY, now)).toBe('3 days ago')
  })
  it('switches to an absolute date past a week', () => {
    const old = now - 8 * DAY
    expect(formatRelativeTime(old, now)).toBe(new Date(old).toLocaleDateString())
  })
})

describe('cardMetaFor', () => {
  const now = 10 * DAY
  const s = save({ createdAt: now - 3 * DAY, updatedAt: now - HOUR, lastOpenedAt: now - 2 * MINUTE })

  it('names the field the grid is ordered by', () => {
    expect(cardMetaFor(s, 'updated-desc', now)).toBe('Edited 1 hr ago')
    expect(cardMetaFor(s, 'created-asc', now)).toBe('Created 3 days ago')
    expect(cardMetaFor(s, 'opened-desc', now)).toBe('Opened 2 min ago')
  })
  it('says so plainly when a save has never been opened', () => {
    expect(cardMetaFor(save({ updatedAt: now }), 'opened-desc', now)).toBe('Never opened')
  })
  it('shows the kind under the kind sort', () => {
    expect(cardMetaFor(s, 'kind', now)).toBe('Square {4,4}')
  })
  it('falls back to the edit time for the name sorts, which have no time of their own', () => {
    expect(cardMetaFor(s, 'name-asc', now)).toBe('Edited 1 hr ago')
    expect(cardMetaFor(s, 'name-desc', now)).toBe('Edited 1 hr ago')
  })
})

describe('filterSaves', () => {
  const saves = [
    save({ id: 'a', name: '8-point Star' }),
    save({ id: 'b', name: 'Kagome study' }),
    save({ id: 'c', name: "Kepler's Star (4.4.4.4)" }),
  ]
  const ids = (out: SavedConfig[]) => out.map(s => s.id)

  it('matches on name, case-insensitively', () => {
    expect(ids(filterSaves(saves, 'star'))).toEqual(['a', 'c'])
    expect(ids(filterSaves(saves, 'STAR'))).toEqual(['a', 'c'])
  })

  it('ANDs whitespace-separated tokens in any order', () => {
    // The point of tokenising: the user remembers the words, not the order or
    // the punctuation between them.
    expect(ids(filterSaves(saves, 'star 8'))).toEqual(['a'])
    expect(ids(filterSaves(saves, '8 star'))).toEqual(['a'])
    expect(ids(filterSaves(saves, 'kepler star'))).toEqual(['c'])
  })

  it('returns everything for an empty or whitespace-only query', () => {
    // This is what makes the filter safe to run unconditionally in the grid's
    // derived list — no "is the filter on?" branch at the call site.
    expect(ids(filterSaves(saves, ''))).toEqual(['a', 'b', 'c'])
    expect(ids(filterSaves(saves, '   '))).toEqual(['a', 'b', 'c'])
  })

  it('returns empty when nothing matches, rather than falling back to all', () => {
    expect(filterSaves(saves, 'nonesuch')).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [...saves]
    filterSaves(input, 'star')
    expect(input).toHaveLength(3)
  })

  it('does not match the kind label — only the name', () => {
    // "Builder"/"4.8.8" read like search terms, but matching them would return
    // cards whose visible names contain nothing the user typed.
    const builder = save({ id: 'd', name: 'Untitled', sourceCategory: 'editor' })
    expect(filterSaves([builder], 'builder')).toEqual([])
  })

  it('composes with sortSaves — filter narrows, sort orders', () => {
    expect(ids(sortSaves(filterSaves(saves, 'star'), 'name-asc'))).toEqual(['a', 'c'])
    expect(ids(sortSaves(filterSaves(saves, 'star'), 'name-desc'))).toEqual(['c', 'a'])
  })
})
