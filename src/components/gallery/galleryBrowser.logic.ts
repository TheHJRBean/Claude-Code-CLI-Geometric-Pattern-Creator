import type { PatternConfig } from '../../types/pattern'
import type { SavedConfig, SavedSourceCategory } from '../../state/configLibrary'
import { convertPresetToEditorConfig, isConvertiblePreset } from '../../editor/presetConversion'

/**
 * Pure logic for the Gallery saved-patterns browser (ADR-0006, slice 5).
 *
 * All the browser's decisions that don't need the DOM live here so they can be
 * unit-tested in the node env: the per-card view model, the legacy-path badge,
 * whether a save can be opened in the Lab (and how), and which save the
 * one-at-a-time thumbnail backfill should render next. The IndexedDB wrapper
 * (`thumbnailStore.ts`) and the offscreen renderer (`renderThumbnail.tsx`) stay
 * thin around this.
 */

/** How "Edit in Lab" resolves for a save:
 *  - `direct`     — already an editor Patch; loads verbatim.
 *  - `convert`    — a tier-1 legacy preset; converts one-way (original kept).
 *  - `unavailable`— tier-2/3 legacy render with no conversion yet; not editable. */
export type EditAvailability = 'direct' | 'convert' | 'unavailable'

export interface CardModel {
  id: string
  name: string
  createdAt: number
  /** Legacy-path source badge, or null for editor-sourced saves (no badge). */
  badge: string | null
  editAvailability: EditAvailability
  /** True when the save came from the Builder (no legacy badge). */
  isEditorSourced: boolean
}

const CATEGORY_LABEL: Record<SavedSourceCategory, string> = {
  archimedean: 'Archimedean',
  'rosette-patch': 'Rosette',
  editor: 'Builder',
}

/**
 * The legacy-path badge for a save, or null when there's nothing to badge.
 * Editor-sourced saves render on the Builder path and carry no badge; every
 * other `sourceCategory` is a legacy BFS/Taprats render and gets its label.
 */
export function badgeForSave(save: SavedConfig): string | null {
  return save.sourceCategory === 'editor' ? null : CATEGORY_LABEL[save.sourceCategory]
}

/** Whether — and how — a config opens in the Lab. Mirrors `resolveEditInLab`. */
export function editAvailabilityFor(config: PatternConfig): EditAvailability {
  if (config.tiling.type === 'editor') return 'direct'
  return isConvertiblePreset(config.tiling.type) ? 'convert' : 'unavailable'
}

export function toCardModel(save: SavedConfig): CardModel {
  return {
    id: save.id,
    name: save.name,
    createdAt: save.createdAt,
    badge: badgeForSave(save),
    editAvailability: editAvailabilityFor(save.config),
    isEditorSourced: save.sourceCategory === 'editor',
  }
}

export interface EditInLabResult {
  /** The config to hand to the Lab reducer. */
  config: PatternConfig
  /** True when a one-way conversion happened (caller keeps the original save). */
  converted: boolean
}

/**
 * Resolve a save's config for "Edit in Lab". Editor-sourced configs load
 * verbatim; convertible tier-1 legacy presets convert one-way (the original
 * save is untouched — the caller preserves it); anything else returns null
 * (not editable as a Patch yet — tier-2/3). The input is never mutated.
 */
export function resolveEditInLab(config: PatternConfig): EditInLabResult | null {
  if (config.tiling.type === 'editor') return { config, converted: false }
  const converted = convertPresetToEditorConfig(config)
  return converted ? { config: converted, converted: true } : null
}

/**
 * The next save id needing a thumbnail — the first in list order whose id is
 * neither already stored nor previously attempted-and-failed — or null when
 * every save is covered. Pure so the backfill loop's selection is testable;
 * `covered` folds together thumbs present in the store and ids that failed to
 * render so a bad config degrades to a placeholder instead of retrying forever.
 */
export function nextBackfillId(
  saves: ReadonlyArray<{ id: string }>,
  covered: ReadonlySet<string>,
): string | null {
  for (const s of saves) {
    if (!covered.has(s.id)) return s.id
  }
  return null
}
