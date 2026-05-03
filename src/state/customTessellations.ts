import type { PatternConfig } from '../types/pattern'
import { TILINGS } from '../tilings/index'

/**
 * Lab-local library of user-saved tessellations.
 *
 * Persists to localStorage under `lab-tessellations-v1`. Schema-versioned
 * so future shape changes can migrate without losing the user's library.
 *
 * Library is Lab-only — Main mode does not surface saved entries.
 */

export type SavedSourceCategory = 'archimedean' | 'rosette-patch'

export interface SavedTessellation {
  id: string
  name: string
  createdAt: number
  config: PatternConfig
  sourceCategory: SavedSourceCategory
}

const STORAGE_KEY = 'lab-tessellations-v1'

interface PersistedShape {
  version: 1
  entries: SavedTessellation[]
}

export interface LibraryError {
  kind: 'quota' | 'corrupt' | 'unavailable'
  message: string
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function categoryFor(config: PatternConfig): SavedSourceCategory {
  const def = TILINGS[config.tiling.type]
  return def?.category === 'rosette-patch' ? 'rosette-patch' : 'archimedean'
}

// Tessellation types removed in the 2026-05-03 cleanup. Saved entries
// pointing at these get skipped on load with a console warning.
const RETIRED_TILING_TYPES = new Set(['layered-mandala', 'composition'])

export function listSavedTessellations(): SavedTessellation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<PersistedShape>
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return []
    }
    return parsed.entries.filter(e => {
      if (!e || typeof e !== 'object') return false
      if (typeof e.id !== 'string' || typeof e.name !== 'string') return false
      if (!e.config || !e.config.tiling) {
        console.warn('Skipping malformed saved tessellation', e.id)
        return false
      }
      if (RETIRED_TILING_TYPES.has(e.config.tiling.type)) {
        console.warn(`Skipping saved tessellation "${e.name}" — type "${e.config.tiling.type}" was retired in the 2026-05-03 cleanup.`)
        return false
      }
      return true
    })
  } catch (err) {
    console.warn('Failed to load saved tessellations', err)
    return []
  }
}

function writeAll(entries: SavedTessellation[]): LibraryError | null {
  try {
    const payload: PersistedShape = { version: 1, entries }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return null
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      return { kind: 'quota', message: 'Browser storage is full. Delete an entry and try again.' }
    }
    return { kind: 'unavailable', message: 'Local storage is unavailable in this browser.' }
  }
}

export interface SaveResult {
  entry?: SavedTessellation
  error?: LibraryError
}

export function saveTessellation(name: string, config: PatternConfig): SaveResult {
  const trimmed = name.trim() || 'Untitled'
  const entries = listSavedTessellations()
  const entry: SavedTessellation = {
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

export function renameTessellation(id: string, newName: string): LibraryError | null {
  const trimmed = newName.trim()
  if (!trimmed) return null
  const entries = listSavedTessellations().map(e =>
    e.id === id ? { ...e, name: trimmed } : e,
  )
  return writeAll(entries)
}

export function deleteTessellation(id: string): LibraryError | null {
  const entries = listSavedTessellations().filter(e => e.id !== id)
  return writeAll(entries)
}

export function duplicateTessellation(id: string): SaveResult {
  const entries = listSavedTessellations()
  const source = entries.find(e => e.id === id)
  if (!source) {
    return { error: { kind: 'corrupt', message: 'Entry not found.' } }
  }
  const copy: SavedTessellation = {
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

export function getTessellation(id: string): SavedTessellation | null {
  return listSavedTessellations().find(e => e.id === id) ?? null
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value) } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value)) as T
}
