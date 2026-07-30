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
 *  - `direct`  — already an editor Patch; loads verbatim.
 *  - `convert` — a tier-1 legacy preset; converts one-way (original kept).
 *  - `view`    — a tier-3 legacy render with no Patch conversion yet; loads
 *                verbatim onto the **legacy substrate**, where the Lab's
 *                Composition-level controls (θ, Figure recipes, line sets,
 *                curves, strand style) all work but the Design and Decoration
 *                Phases — which need a Patch — do not.
 *
 * There is deliberately no `unavailable`: the Lab's own My Tessellations panel
 * has always loaded any saved config verbatim, so gating the Gallery and
 * Generator doors shut was an inconsistency, not a safeguard. A tiling that
 * cannot become a Patch is a *reduced* editing experience, not a closed one. */
export type EditAvailability = 'direct' | 'convert' | 'view'

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
  return isConvertiblePreset(config.tiling.type) ? 'convert' : 'view'
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
 * save is untouched — the caller preserves it); a tier-3 legacy render also
 * loads **verbatim**, onto the legacy substrate (`view` availability), because
 * the Lab renders and tunes that path perfectly well — it just has no Patch to
 * run the Design/Decoration Phases against. The input is never mutated.
 *
 * Null is now unreachable in practice; the signature keeps it so callers that
 * already guard (App's `handleEditInLab`) stay correct if a future tier is
 * added that genuinely cannot be handed over.
 */
export function resolveEditInLab(config: PatternConfig): EditInLabResult | null {
  if (config.tiling.type === 'editor') return { config, converted: false }
  const converted = convertPresetToEditorConfig(config)
  if (converted) return { config: converted, converted: true }
  // Tier-3: no Patch encoder yet, but nothing about the config stops the Lab
  // loading it. Not a conversion, so the caller keeps the library link.
  return { config, converted: false }
}

/**
 * The library entry the Lab should stay linked to after "Edit in Lab" — i.e.
 * which save its Save button overwrites. '' means unlinked (Save forks a new
 * entry).
 *
 * A verbatim load keeps the link, so the Gallery is a real way back into a
 * saved pattern rather than a one-way fork. A conversion drops it: the saved
 * entry is still the legacy render, and `resolveEditInLab` promises to leave
 * that original alone — overwriting it with the derived Patch would break the
 * promise and lose the only copy of the legacy config.
 */
export function linkedSavedIdFor(result: EditInLabResult, savedId: string): string {
  return result.converted ? '' : savedId
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
