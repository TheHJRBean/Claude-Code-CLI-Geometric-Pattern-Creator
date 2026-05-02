import type { PatternConfig } from '../types/pattern'

/**
 * Lab starts with no tessellation selected. Strands are off by default
 * (Lab focuses on the polygon tessellation; PIC overlay is opt-in).
 * Mandala config is omitted here; the reducer seeds DEFAULT_MANDALA_CONFIG
 * the first time `layered-mandala` is selected.
 */
export const LAB_DEFAULT_CONFIG: PatternConfig = {
  tiling: { type: '', scale: 100 },
  figures: {},
  lacing: {
    enabled: false,
    strandWidth: 4,
    gapWidth: 3,
    strandColor: '#1a1a2e',
    gapColor: '#f5f0e8',
  },
}

export const LAB_STORAGE_KEY = 'lab-state-v1'

export interface LabPersistedState {
  config: PatternConfig
  showStrands: boolean
  outlineWidth: number
  fillOnHover: boolean
}

export const LAB_DEFAULT_PERSISTED: LabPersistedState = {
  config: LAB_DEFAULT_CONFIG,
  showStrands: false,
  outlineWidth: 0.8,
  fillOnHover: false,
}

export function loadLabState(): LabPersistedState {
  try {
    const raw = localStorage.getItem(LAB_STORAGE_KEY)
    if (!raw) return LAB_DEFAULT_PERSISTED
    const parsed = JSON.parse(raw) as Partial<LabPersistedState>
    if (!parsed || typeof parsed !== 'object' || !parsed.config?.tiling) {
      return LAB_DEFAULT_PERSISTED
    }
    return {
      config: parsed.config,
      showStrands: typeof parsed.showStrands === 'boolean' ? parsed.showStrands : LAB_DEFAULT_PERSISTED.showStrands,
      outlineWidth: typeof parsed.outlineWidth === 'number' ? parsed.outlineWidth : LAB_DEFAULT_PERSISTED.outlineWidth,
      fillOnHover: typeof parsed.fillOnHover === 'boolean' ? parsed.fillOnHover : LAB_DEFAULT_PERSISTED.fillOnHover,
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
