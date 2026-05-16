import type { PatternConfig } from '../types/pattern'
import { migrateEditorConfig } from '../editor/migrations'

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
}

export const LAB_DEFAULT_PERSISTED: LabPersistedState = {
  config: LAB_DEFAULT_CONFIG,
  showStrands: false,
  outlineWidth: 0.8,
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
    // v3 schema migration (ADR-0001): persisted Editor patches may be v1 / v2;
    // run them through the migrator so the reducer always sees v3. Drop the
    // editor and tiling type if migration fails so the Lab boots to a blank
    // state instead of crashing.
    if (config.editor) {
      const migrated = migrateEditorConfig(config.editor)
      if (migrated) {
        config.editor = migrated
      } else {
        delete (config as Record<string, unknown>).editor
        if (config.tiling.type === 'editor') {
          config.tiling = { ...config.tiling, type: '' }
        }
      }
    }
    // Phase 6: persisted Lab state may still carry the legacy `lacing`
    // block. Migrate to `strand` (the over/under interlace render path was
    // removed; the canvas background colour formerly on `lacing.gapColor`
    // moves to `strand.background`).
    const legacyConfig = config as unknown as { lacing?: { strandWidth?: number; strandColor?: string; gapColor?: string }; strand?: PatternConfig['strand'] }
    if (!legacyConfig.strand && legacyConfig.lacing) {
      const l = legacyConfig.lacing
      if (typeof l.strandWidth === 'number' && typeof l.strandColor === 'string' && typeof l.gapColor === 'string') {
        config.strand = { width: l.strandWidth, color: l.strandColor, background: l.gapColor }
      } else {
        config.strand = LAB_DEFAULT_CONFIG.strand
      }
    }
    if (!config.strand) {
      config.strand = LAB_DEFAULT_CONFIG.strand
    }
    delete (config as Record<string, unknown>).lacing
    return {
      config,
      showStrands: typeof parsed.showStrands === 'boolean' ? parsed.showStrands : LAB_DEFAULT_PERSISTED.showStrands,
      outlineWidth: typeof parsed.outlineWidth === 'number' ? parsed.outlineWidth : LAB_DEFAULT_PERSISTED.outlineWidth,
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
