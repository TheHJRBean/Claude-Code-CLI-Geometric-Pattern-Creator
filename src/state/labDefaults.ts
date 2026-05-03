import type { PatternConfig } from '../types/pattern'

/**
 * Lab starts with no tessellation selected. Strands are off by default
 * (Lab focuses on the polygon tessellation; PIC overlay is opt-in).
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
    // 2026-05-03 cleanup: dropped tiling categories `mandala` and
    // `composition`. If a persisted config points at one of those types,
    // reset to a blank tessellation rather than crash downstream.
    const droppedTypes = new Set(['layered-mandala', 'composition'])
    const config = { ...parsed.config }
    if (droppedTypes.has(config.tiling.type)) {
      config.tiling = { ...config.tiling, type: '' }
    }
    // Old persisted shapes carried `mandala` / `composition` payloads on
    // the config — strip them silently.
    delete (config as Record<string, unknown>).mandala
    delete (config as Record<string, unknown>).composition
    return {
      config,
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
