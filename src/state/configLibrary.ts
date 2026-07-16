import type { PatternConfig } from '../types/pattern'
import { TILINGS } from '../tilings/index'
import { ConfigValidationError, loadPatternConfig } from './configValidation'

/**
 * Generic in-app config library — list / save / rename / delete / duplicate
 * over a localStorage-backed array of named `PatternConfig` snapshots.
 *
 * Both Lab's "My Tessellations" and Main's "My Patterns" use this; they
 * differ only in the storage key passed to `createConfigLibrary`.
 *
 * The persisted shape is schema-versioned so future changes can migrate
 * without losing the user's library. Per-entry configs are validated and
 * migrated on read; corrupt entries are skipped with a console warning so
 * a single bad row doesn't blank the whole list.
 */

export type SavedSourceCategory = 'archimedean' | 'rosette-patch' | 'editor'

export interface SavedConfig {
  id: string
  name: string
  createdAt: number
  config: PatternConfig
  sourceCategory: SavedSourceCategory
}

export interface LibraryError {
  kind: 'quota' | 'corrupt' | 'unavailable'
  message: string
}

export interface SaveResult {
  entry?: SavedConfig
  error?: LibraryError
}

interface PersistedShape {
  version: 1
  entries: SavedConfig[]
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function categoryFor(config: PatternConfig): SavedSourceCategory {
  if (config.tiling.type === 'editor') return 'editor'
  const def = TILINGS[config.tiling.type]
  return def?.category === 'rosette-patch' ? 'rosette-patch' : 'archimedean'
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value) } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export interface ConfigLibrary {
  storageKey: string
  list(): SavedConfig[]
  save(name: string, config: PatternConfig): SaveResult
  /** Overwrite an existing entry's config in place, keeping its id/name. */
  update(id: string, config: PatternConfig): SaveResult
  rename(id: string, newName: string): LibraryError | null
  delete(id: string): LibraryError | null
  duplicate(id: string): SaveResult
  get(id: string): SavedConfig | null
}

/** A legacy library key to fold into a merged library, with an optional
 *  suffix appended to entry names that collide with already-merged ones
 *  (e.g. ' (Gallery)'). */
export interface LegacyLibrarySource {
  key: string
  nameSuffix?: string
}

/**
 * One-time physical merge of legacy libraries into `targetKey` (ADR-0006).
 * No-op when the target key already exists — its presence is the "migration
 * ran" marker — so the merge is idempotent. Legacy keys are read via the
 * ordinary validated `list()` path (corrupt entries skipped, not carried) and
 * are left untouched as a backup until the BFS sunset. Colliding ids are
 * regenerated; colliding names get the source's suffix (then a counter).
 * A profile with no legacy entries writes nothing — the first `save()`
 * creates the key.
 */
export function migrateLegacyLibraries(targetKey: string, sources: LegacyLibrarySource[]): void {
  try {
    if (localStorage.getItem(targetKey) !== null) return
    const merged: SavedConfig[] = []
    const ids = new Set<string>()
    const names = new Set<string>()
    for (const source of sources) {
      for (const e of createConfigLibrary(source.key).list()) {
        const entry = { ...e }
        if (ids.has(entry.id)) entry.id = uuid()
        if (names.has(entry.name)) {
          const base = `${entry.name}${source.nameSuffix ?? ''}`
          let candidate = base
          for (let n = 2; names.has(candidate); n++) candidate = `${base} (${n})`
          entry.name = candidate
        }
        ids.add(entry.id)
        names.add(entry.name)
        merged.push(entry)
      }
    }
    if (merged.length === 0) return
    const payload: PersistedShape = { version: 1, entries: merged }
    localStorage.setItem(targetKey, JSON.stringify(payload))
  } catch (err) {
    console.warn('Library migration failed; legacy keys untouched', err)
  }
}

export function createConfigLibrary(storageKey: string): ConfigLibrary {
  function list(): SavedConfig[] {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw) as Partial<PersistedShape>
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
        return []
      }
      const out: SavedConfig[] = []
      for (const e of parsed.entries) {
        if (!e || typeof e !== 'object') continue
        if (typeof e.id !== 'string' || typeof e.name !== 'string') continue
        try {
          const config = loadPatternConfig(e.config)
          out.push({ ...e, config })
        } catch (err) {
          const reason = err instanceof ConfigValidationError ? err.message : 'unknown error'
          console.warn(`Skipping saved config "${e.name}": ${reason}`)
        }
      }
      return out
    } catch (err) {
      console.warn(`Failed to load library at ${storageKey}`, err)
      return []
    }
  }

  function writeAll(entries: SavedConfig[]): LibraryError | null {
    try {
      const payload: PersistedShape = { version: 1, entries }
      localStorage.setItem(storageKey, JSON.stringify(payload))
      return null
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
        return { kind: 'quota', message: 'Browser storage is full. Delete an entry and try again.' }
      }
      return { kind: 'unavailable', message: 'Local storage is unavailable in this browser.' }
    }
  }

  function save(name: string, config: PatternConfig): SaveResult {
    const trimmed = name.trim() || 'Untitled'
    const entries = list()
    const entry: SavedConfig = {
      id: uuid(),
      name: trimmed,
      createdAt: Date.now(),
      config: structuredCloneSafe(config),
      sourceCategory: categoryFor(config),
    }
    const error = writeAll([...entries, entry])
    if (error) return { error }
    return { entry }
  }

  function update(id: string, config: PatternConfig): SaveResult {
    const entries = list()
    const index = entries.findIndex(e => e.id === id)
    if (index === -1) {
      return { error: { kind: 'corrupt', message: 'Entry not found.' } }
    }
    const updated: SavedConfig = {
      ...entries[index],
      createdAt: Date.now(),
      config: structuredCloneSafe(config),
      sourceCategory: categoryFor(config),
    }
    const next = [...entries]
    next[index] = updated
    const error = writeAll(next)
    if (error) return { error }
    return { entry: updated }
  }

  function rename(id: string, newName: string): LibraryError | null {
    const trimmed = newName.trim()
    if (!trimmed) return null
    const entries = list().map(e =>
      e.id === id ? { ...e, name: trimmed } : e,
    )
    return writeAll(entries)
  }

  function deleteEntry(id: string): LibraryError | null {
    const entries = list().filter(e => e.id !== id)
    return writeAll(entries)
  }

  function duplicate(id: string): SaveResult {
    const entries = list()
    const source = entries.find(e => e.id === id)
    if (!source) {
      return { error: { kind: 'corrupt', message: 'Entry not found.' } }
    }
    const copy: SavedConfig = {
      ...source,
      id: uuid(),
      name: `${source.name} (copy)`,
      createdAt: Date.now(),
      config: structuredCloneSafe(source.config),
    }
    const error = writeAll([...entries, copy])
    if (error) return { error }
    return { entry: copy }
  }

  function get(id: string): SavedConfig | null {
    return list().find(e => e.id === id) ?? null
  }

  return { storageKey, list, save, update, rename, delete: deleteEntry, duplicate, get }
}
