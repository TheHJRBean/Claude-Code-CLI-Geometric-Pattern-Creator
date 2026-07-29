import type { PatternConfig } from '../types/pattern'
import { readPatternConfig } from './configValidation'

/**
 * Lab starts with no tessellation selected. Strands are off by default
 * (Lab focuses on the polygon tessellation; PIC overlay is opt-in).
 */
export const LAB_DEFAULT_CONFIG: PatternConfig = {
  tiling: { type: '', scale: 100 },
  figures: {},
  strand: {
    width: 4,
    color: '#1a1a2e',
    background: '#f5f0e8',
  },
}

export const LAB_STORAGE_KEY = 'lab-state-v1'

export interface LabPersistedState {
  config: PatternConfig
  showStrands: boolean
  outlineWidth: number
  /** Library entry the working config is linked to, so a page reload doesn't
   *  silently unlink it and turn the next Save into a duplicate. '' = unlinked.
   *  Sessions persisted before this field simply come back unlinked; the id is
   *  re-validated against the library on load (the entry may have been
   *  deleted), so it is a hint, never a source of truth. */
  savedId: string
}

export const LAB_DEFAULT_PERSISTED: LabPersistedState = {
  config: LAB_DEFAULT_CONFIG,
  showStrands: false,
  outlineWidth: 0.8,
  savedId: '',
}

export function loadLabState(): LabPersistedState {
  try {
    const raw = localStorage.getItem(LAB_STORAGE_KEY)
    if (!raw) return LAB_DEFAULT_PERSISTED
    const parsed = JSON.parse(raw) as Partial<LabPersistedState>
    if (!parsed || typeof parsed !== 'object') return LAB_DEFAULT_PERSISTED
    // One schema gate, not two (#50). `readPatternConfig` repairs what it can
    // and then runs the persisted blob through the same `loadPatternConfig`
    // the file-import and library paths use, so every migration — editor
    // schema version, legacy `lacing` → `strand`, retired tiling types, stray
    // `mandala`/`composition` payloads, Gallery Frame clamping, the #48 morph
    // Origin rename — is inherited here instead of being reimplemented and
    // drifting. It never throws; null means nothing was salvageable.
    return {
      config: readPatternConfig(parsed.config, LAB_DEFAULT_CONFIG.strand) ?? LAB_DEFAULT_CONFIG,
      showStrands: typeof parsed.showStrands === 'boolean' ? parsed.showStrands : LAB_DEFAULT_PERSISTED.showStrands,
      outlineWidth: typeof parsed.outlineWidth === 'number' ? parsed.outlineWidth : LAB_DEFAULT_PERSISTED.outlineWidth,
      savedId: typeof parsed.savedId === 'string' ? parsed.savedId : LAB_DEFAULT_PERSISTED.savedId,
    }
  } catch {
    return LAB_DEFAULT_PERSISTED
  }
}

export function saveLabState(state: LabPersistedState): void {
  try {
    localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / unavailable storage
  }
}
