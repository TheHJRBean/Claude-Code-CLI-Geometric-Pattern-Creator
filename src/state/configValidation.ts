import type { FigureConfig, LacingConfig, PatternConfig, TilingConfig } from '../types/pattern'
import { migrateEditorConfig } from '../editor/migrations'

/**
 * Step 17.8 — load-time validation for `PatternConfig`. Used by `loadJSON`
 * (file import) and `listSavedTessellations` (localStorage) so malformed or
 * future-shape input rejects with a clear error rather than crashing the
 * render pipeline.
 *
 * Editor patches are validated through `migrateEditorConfig` (the version
 * dispatch hook). All other categories pass through as-is — they were
 * already serialised wholesale and the live tree's reducer treats them
 * permissively.
 */

const RETIRED_TILING_TYPES = new Set(['layered-mandala', 'composition'])

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

function isTilingConfig(v: unknown): v is TilingConfig {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return typeof t.type === 'string' && typeof t.scale === 'number'
}

function isFiguresMap(v: unknown): v is Record<string, FigureConfig> {
  if (typeof v !== 'object' || v === null) return false
  return Object.values(v as Record<string, unknown>).every(f =>
    typeof f === 'object' && f !== null && typeof (f as { contactAngle?: unknown }).contactAngle === 'number',
  )
}

function isLacingConfig(v: unknown): v is LacingConfig {
  if (typeof v !== 'object' || v === null) return false
  const l = v as Record<string, unknown>
  return typeof l.enabled === 'boolean'
    && typeof l.strandWidth === 'number'
    && typeof l.gapWidth === 'number'
    && typeof l.strandColor === 'string'
    && typeof l.gapColor === 'string'
}

/**
 * Validate an unvalidated value as a `PatternConfig`. Throws
 * `ConfigValidationError` with a human-readable message on failure.
 *
 * Editor configs are migrated via `migrateEditorConfig`; if the editor field
 * is present but invalid, the load fails (we don't strip it silently — the
 * user expected to load an editor patch and getting a stripped non-editor
 * config back would be more confusing than an error).
 */
export function loadPatternConfig(raw: unknown): PatternConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigValidationError('File is not a JSON object.')
  }
  const r = raw as Record<string, unknown>

  if (!isTilingConfig(r.tiling)) {
    throw new ConfigValidationError('Missing or malformed `tiling` field.')
  }
  if (RETIRED_TILING_TYPES.has(r.tiling.type)) {
    throw new ConfigValidationError(
      `Tiling type "${r.tiling.type}" was retired in the 2026-05-03 cleanup.`,
    )
  }
  if (!isFiguresMap(r.figures)) {
    throw new ConfigValidationError('Missing or malformed `figures` map.')
  }
  if (!isLacingConfig(r.lacing)) {
    throw new ConfigValidationError('Missing or malformed `lacing` config.')
  }

  const out: PatternConfig = {
    tiling: r.tiling,
    figures: r.figures,
    lacing: r.lacing,
  }
  if (r.edgeAngles && typeof r.edgeAngles === 'object') {
    out.edgeAngles = r.edgeAngles as Record<string, number>
  }
  if (typeof r.smoothTransitions === 'boolean') {
    out.smoothTransitions = r.smoothTransitions
  }
  if (r.editor !== undefined) {
    const editor = migrateEditorConfig(r.editor)
    if (!editor) {
      throw new ConfigValidationError('Editor patch is malformed or from an unsupported schema version.')
    }
    out.editor = editor
  }
  // An editor-typed tiling without an editor field is unrecoverable.
  if (r.tiling.type === 'editor' && !out.editor) {
    throw new ConfigValidationError('Editor tiling missing `editor` payload.')
  }
  return out
}
