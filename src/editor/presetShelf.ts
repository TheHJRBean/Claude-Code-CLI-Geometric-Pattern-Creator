import type { PatternConfig } from '../types/pattern'
import type { TilingDefinition } from '../types/tiling'
import type { Action } from '../state/actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { convertPresetToEditorConfig, isConvertiblePreset } from './presetConversion'

/**
 * Gallery↔Lab convergence (ADR-0006, slice 4) — the **Presets shelf**: the
 * read-only preset section shown beside My Tessellations in the Lab library.
 * Pure logic only; the card UI lives in `components/PresetShelfPanel.tsx`.
 *
 * Three concerns:
 * 1. Shelf assembly — every Gallery preset becomes a shelf entry with its
 *    rollout tier (Q2). Tier 1 converts today (`presetConversion` table);
 *    tier 2 (remaining Archimedean) and tier 3 (irregular Laves / Taprats
 *    rosette patches) load on the legacy BFS render path, badged view-only.
 *    The badge derives from convertibility, so tier-2 entries shed it
 *    automatically as their conversion rows land (ticket #8).
 * 2. Loading — `buildPresetConfig` produces a **fresh** working config per
 *    click: tier-1 goes through `convertPresetToEditorConfig` (an editable
 *    Patch with `presetId` provenance), view-only tiers get the preset's
 *    default Gallery config. The shelf itself holds no mutable state, so
 *    the preset "entry" can never be edited — only the working copy.
 * 3. Structural-edit classification (Q5) — which reducer actions count as
 *    *structural* (place / delete / Complete / boundary resize) for the
 *    one-time note on first restructuring of a converted preset. θ / figure
 *    / strand / decoration edits are deliberately absent: always silent.
 */

export type PresetTier = 1 | 2 | 3

export interface PresetShelfEntry {
  /** The Gallery tiling id (`TILINGS` key), e.g. `'4.8.8'`. */
  id: string
  /** Display label from the TilingDefinition. */
  label: string
  tier: PresetTier
  /** True for tiers that cannot convert yet — legacy render, no Patch. */
  viewOnly: boolean
}

function tierFor(def: TilingDefinition): PresetTier {
  if (isConvertiblePreset(def.name)) return 1
  return def.category === 'archimedean' ? 2 : 3
}

/**
 * Assemble the shelf from the preset catalogue: one entry per Gallery
 * tiling, ordered tier 1 → 2 → 3 (stable within a tier, catalogue order).
 */
export function buildPresetShelf(
  tilings: Record<string, TilingDefinition> = TILINGS,
): PresetShelfEntry[] {
  return Object.values(tilings)
    .map(def => ({
      id: def.name,
      label: def.label,
      tier: tierFor(def),
      viewOnly: !isConvertiblePreset(def.name),
    }))
    .sort((a, b) => a.tier - b.tier)
}

/** Deep-copy via JSON — PatternConfig is serialisable by contract. */
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * The preset's pristine Gallery config — what SET_TILING_TYPE onto a fresh
 * Gallery session would produce. Freshly allocated per call so loads never
 * share figure objects with a previous load (or with the catalogue).
 */
function presetGalleryConfig(def: TilingDefinition): PatternConfig {
  return {
    tiling: { type: def.name, scale: 100 },
    figures: deepCopy(def.defaultConfig.figures ?? {}),
    strand: { ...DEFAULT_CONFIG.strand },
  }
}

/**
 * The working config a shelf click loads. Tier-1 presets return a fresh
 * conversion (editable Patch, `editor.presetId` provenance); view-only tiers
 * return the legacy Gallery config (BFS render path, Composition-level
 * controls only). Null for unknown ids.
 */
export function buildPresetConfig(
  presetId: string,
  tilings: Record<string, TilingDefinition> = TILINGS,
): PatternConfig | null {
  const def = tilings[presetId]
  if (!def) return null
  const gallery = presetGalleryConfig(def)
  if (!isConvertiblePreset(presetId)) return gallery
  return convertPresetToEditorConfig(gallery)
}

/**
 * Structural edits per ticket #5: place / delete / Complete / boundary
 * resize. These are the actions that can break a converted preset's
 * tessellation; everything else (θ, figures, strand style, decoration,
 * symmetry mode, toggles) is silent.
 */
const STRUCTURAL_EDIT_ACTIONS: ReadonlySet<Action['type']> = new Set<Action['type']>([
  'EDITOR_PLACE_TILE_ON_EDGE',
  'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION',
  'EDITOR_PLACE_TILE_ON_VERTEX',
  'EDITOR_DELETE_TILE',
  'EDITOR_COMPLETE_GAP',
  'EDITOR_COMPLETE_N_GAP',
  'EDITOR_RUN_AUTO_COMPLETE',
  'SET_CELL_BOUNDARY_SIZE',
])

export function isStructuralEditAction(action: Action): boolean {
  return STRUCTURAL_EDIT_ACTIONS.has(action.type)
}

/**
 * Whether dispatching `action` should surface the one-time structural-edit
 * note: the working config is a converted preset (provenance present), the
 * action restructures it, and the note hasn't been shown before.
 */
export function shouldShowStructuralEditNote(
  action: Action,
  presetId: string | undefined,
  alreadyShown: boolean,
): boolean {
  return !alreadyShown && presetId !== undefined && isStructuralEditAction(action)
}

/**
 * Dirty-flag transition for the unsaved-changes guard: loading or starting
 * fresh resets the working copy to a known state (clean); any other config
 * mutation is unsaved work. (Saving also cleans, via the library panel's
 * save callback — saves don't go through the reducer.)
 */
export function actionResetsDirty(action: Action): boolean {
  return action.type === 'LOAD_CONFIG' || action.type === 'EDITOR_NEW' || action.type === 'EDITOR_CLEAR'
}
