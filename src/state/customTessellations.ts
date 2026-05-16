import type { PatternConfig } from '../types/pattern'
import {
  createConfigLibrary,
  type SavedConfig,
  type SavedSourceCategory,
  type LibraryError,
  type SaveResult,
} from './configLibrary'

/**
 * Lab-local library of user-saved tessellations. Persists to localStorage
 * under `lab-tessellations-v1`. Implementation lives in `configLibrary.ts`;
 * this module is the Lab-keyed wrapper.
 *
 * Gallery has its own parallel wrapper in `mainConfigs.ts`, keyed
 * separately so the two libraries don't pollute each other.
 */

const lib = createConfigLibrary('lab-tessellations-v1')

/** Backwards-compat alias for `SavedConfig`. */
export type SavedTessellation = SavedConfig
export type { SavedSourceCategory, LibraryError, SaveResult }

export const STORAGE_KEY = lib.storageKey

export function listSavedTessellations(): SavedTessellation[] {
  return lib.list()
}

export function saveTessellation(name: string, config: PatternConfig): SaveResult {
  return lib.save(name, config)
}

export function renameTessellation(id: string, newName: string): LibraryError | null {
  return lib.rename(id, newName)
}

export function deleteTessellation(id: string): LibraryError | null {
  return lib.delete(id)
}

export function duplicateTessellation(id: string): SaveResult {
  return lib.duplicate(id)
}

export function getTessellation(id: string): SavedTessellation | null {
  return lib.get(id)
}
