import type { SavedConfig, SavedSourceCategory } from '../../state/configLibrary'
import { TILINGS } from '../../tilings/index'

/**
 * Pure logic for **which saves the Gallery grid shows, and in what order**.
 *
 * The library is stored in insertion order, which is only ever "oldest save
 * first" — useless once a profile holds more than a screenful. This module owns
 * the orderings the browser offers, the name filter that narrows them, the
 * per-card meta line each ordering explains itself with, and the
 * persisted-preference parsing. Kept DOM-free so the comparators are
 * unit-testable in the node env, matching `galleryBrowser.logic`.
 *
 * Timestamps come from `SavedConfig`: `createdAt` (stable), `updatedAt` (moves
 * on every overwrite) and `lastOpenedAt` (undefined until first opened).
 */

export type GallerySortKey =
  | 'updated-desc'
  | 'updated-asc'
  | 'created-desc'
  | 'created-asc'
  | 'opened-desc'
  | 'name-asc'
  | 'name-desc'
  | 'kind'

export const DEFAULT_GALLERY_SORT: GallerySortKey = 'updated-desc'

/** localStorage key for the remembered choice — the sort is a workspace
 *  preference, not pattern data, so it never touches the library payload. */
export const GALLERY_SORT_STORAGE_KEY = 'gallery-sort-v1'

export interface GallerySortOption {
  key: GallerySortKey
  label: string
  /** Group heading for the `<optgroup>` the option sits under. */
  group: 'Time' | 'Name' | 'Kind'
}

export const GALLERY_SORT_OPTIONS: readonly GallerySortOption[] = [
  { key: 'updated-desc', label: 'Recently edited', group: 'Time' },
  { key: 'updated-asc', label: 'Least recently edited', group: 'Time' },
  { key: 'created-desc', label: 'Newest first', group: 'Time' },
  { key: 'created-asc', label: 'Oldest first', group: 'Time' },
  { key: 'opened-desc', label: 'Recently opened', group: 'Time' },
  { key: 'name-asc', label: 'Name A–Z', group: 'Name' },
  { key: 'name-desc', label: 'Name Z–A', group: 'Name' },
  { key: 'kind', label: 'Pattern kind', group: 'Kind' },
]

/** The option groups in display order, each with its options. */
export function groupedSortOptions(): { group: string; options: GallerySortOption[] }[] {
  const out: { group: string; options: GallerySortOption[] }[] = []
  for (const option of GALLERY_SORT_OPTIONS) {
    const last = out[out.length - 1]
    if (last && last.group === option.group) last.options.push(option)
    else out.push({ group: option.group, options: [option] })
  }
  return out
}

/** Narrow an arbitrary persisted string to a known key, else the default. */
export function parseSortKey(raw: unknown): GallerySortKey {
  return GALLERY_SORT_OPTIONS.some(o => o.key === raw)
    ? (raw as GallerySortKey)
    : DEFAULT_GALLERY_SORT
}

/** Numeric-aware, case-insensitive name order, so "Star 2" precedes "Star 10". */
function compareNames(a: SavedConfig, b: SavedConfig): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
}

/** Builder saves first (the authored ones), then the legacy render paths. */
const CATEGORY_RANK: Record<SavedSourceCategory, number> = {
  editor: 0,
  archimedean: 1,
  'rosette-patch': 2,
}

/**
 * The human label a save is grouped under by the "Pattern kind" sort: a
 * Builder save's Configuration (or "Builder" for a free-form single-cell
 * Patch), and a legacy save's tiling label.
 */
export function kindLabelFor(save: SavedConfig): string {
  if (save.sourceCategory === 'editor') {
    const configuration = save.config.editor?.configuration
    return configuration ? `Builder · ${configuration}` : 'Builder'
  }
  const type = save.config.tiling.type
  return TILINGS[type]?.label ?? type
}

type Comparator = (a: SavedConfig, b: SavedConfig) => number

/** Descending by a timestamp, with entries lacking one pushed to the end. */
function byMissableTimeDesc(pick: (s: SavedConfig) => number | undefined): Comparator {
  return (a, b) => {
    const ta = pick(a)
    const tb = pick(b)
    if (ta === undefined && tb === undefined) return 0
    if (ta === undefined) return 1
    if (tb === undefined) return -1
    return tb - ta
  }
}

const COMPARATORS: Record<GallerySortKey, Comparator> = {
  'updated-desc': (a, b) => b.updatedAt - a.updatedAt,
  'updated-asc': (a, b) => a.updatedAt - b.updatedAt,
  'created-desc': (a, b) => b.createdAt - a.createdAt,
  'created-asc': (a, b) => a.createdAt - b.createdAt,
  // Never-opened saves sink below every opened one rather than pretending to
  // be the least recently opened — "not yet" is not "long ago".
  'opened-desc': byMissableTimeDesc(s => s.lastOpenedAt),
  'name-asc': compareNames,
  'name-desc': (a, b) => -compareNames(a, b),
  'kind': (a, b) =>
    CATEGORY_RANK[a.sourceCategory] - CATEGORY_RANK[b.sourceCategory] ||
    kindLabelFor(a).localeCompare(kindLabelFor(b), undefined, { numeric: true }),
}

/**
 * A new array of the saves in the requested order. Every ordering falls back to
 * name then id, so equal keys (a batch of saves written in the same
 * millisecond, two never-opened entries, one tiling with many saves) still come
 * out in a stable, meaningful order instead of storage order. The input array
 * is not mutated.
 */
export function sortSaves(saves: readonly SavedConfig[], key: GallerySortKey): SavedConfig[] {
  const primary = COMPARATORS[key] ?? COMPARATORS[DEFAULT_GALLERY_SORT]
  return [...saves].sort(
    (a, b) => primary(a, b) || compareNames(a, b) || a.id.localeCompare(b.id),
  )
}

/**
 * Narrow the saves to those whose **name** matches every whitespace-separated
 * token of `query`, case-insensitively and in any order — so "star 8" finds
 * "8-point Star" as readily as "Star (8)". An empty or whitespace-only query
 * returns the input untouched, which is what makes this safe to run
 * unconditionally in the grid's derived list.
 *
 * Tokens are ANDed rather than matched as one substring because a saved name
 * is written by the user for their own filing, not for searching: they
 * remember the words, rarely the order or the punctuation between them.
 *
 * Deliberately name-only. The kind label (`kindLabelFor`) reads like a search
 * term — "4.8.8", "Builder" — but matching it would mean a query that visibly
 * matches no name still returns cards, which reads as a bug rather than a
 * feature. It is the *sort* that groups by kind.
 */
export function filterSaves(saves: readonly SavedConfig[], query: string): SavedConfig[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return [...saves]
  return saves.filter(save => {
    const name = save.name.toLowerCase()
    return tokens.every(token => name.includes(token))
  })
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Short relative age ("4 min ago", "3 days ago"), falling back to an absolute
 * date past a week where "37 days ago" stops being easier to read than the
 * date itself. `now` is injected so the formatting is testable.
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const delta = now - timestamp
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) {
    const mins = Math.floor(delta / MINUTE)
    return `${mins} min ago`
  }
  if (delta < DAY) {
    const hours = Math.floor(delta / HOUR)
    return `${hours} hr${hours === 1 ? '' : 's'} ago`
  }
  if (delta < 7 * DAY) {
    const days = Math.floor(delta / DAY)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  return new Date(timestamp).toLocaleDateString()
}

/**
 * The card's meta line under the active sort — it names the field the grid is
 * ordered by, so the order is self-explaining rather than mysterious. Sorting
 * by name has no timestamp of its own, so it shows the edit time (the most
 * generally useful one); sorting by kind shows the kind.
 */
export function cardMetaFor(save: SavedConfig, key: GallerySortKey, now: number = Date.now()): string {
  switch (key) {
    case 'created-desc':
    case 'created-asc':
      return `Created ${formatRelativeTime(save.createdAt, now)}`
    case 'opened-desc':
      return save.lastOpenedAt === undefined
        ? 'Never opened'
        : `Opened ${formatRelativeTime(save.lastOpenedAt, now)}`
    case 'kind':
      return kindLabelFor(save)
    default:
      return `Edited ${formatRelativeTime(save.updatedAt, now)}`
  }
}
