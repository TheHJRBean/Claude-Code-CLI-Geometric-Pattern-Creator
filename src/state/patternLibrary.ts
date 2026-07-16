import { createConfigLibrary, migrateLegacyLibraries, type ConfigLibrary } from './configLibrary'
import type { PatternConfig } from '../types/pattern'

/**
 * The single merged pattern library (ADR-0006). Gallery's "My Patterns"
 * (`main-configs-v1`) and Lab's "My Tessellations" (`lab-tessellations-v1`)
 * were physically merged into `pattern-library-v1`; both workspaces read and
 * write this binding. The legacy keys are left in localStorage untouched as a
 * backup until the BFS sunset.
 *
 * Migration runs lazily on first access (not at import — the node test env
 * has no localStorage at module-eval time). Lab entries keep their names;
 * Gallery entries that collide get a ' (Gallery)' suffix.
 */

export const PATTERN_LIBRARY_KEY = 'pattern-library-v1'

export const LEGACY_LIBRARY_SOURCES = [
  { key: 'lab-tessellations-v1' },
  { key: 'main-configs-v1', nameSuffix: ' (Gallery)' },
] as const

let migrated = false
function ensureMigrated(): void {
  if (migrated) return
  migrated = true
  migrateLegacyLibraries(PATTERN_LIBRARY_KEY, [...LEGACY_LIBRARY_SOURCES])
}

const lib = createConfigLibrary(PATTERN_LIBRARY_KEY)

export const patternLibrary: ConfigLibrary = {
  storageKey: PATTERN_LIBRARY_KEY,
  list: () => { ensureMigrated(); return lib.list() },
  save: (name: string, config: PatternConfig) => { ensureMigrated(); return lib.save(name, config) },
  update: (id: string, config: PatternConfig) => { ensureMigrated(); return lib.update(id, config) },
  rename: (id: string, newName: string) => { ensureMigrated(); return lib.rename(id, newName) },
  delete: (id: string) => { ensureMigrated(); return lib.delete(id) },
  duplicate: (id: string) => { ensureMigrated(); return lib.duplicate(id) },
  get: (id: string) => { ensureMigrated(); return lib.get(id) },
}
