import type { PatternConfig } from '../types/pattern'
import type { CellShape, EditorConfig, EditorTile, FrameConfig } from '../types/editor'
import {
  createBoundaryMatchingCell,
  createDefault488EditorConfig,
  createDefault31212EditorConfig,
  createDefault33336EditorConfig,
  createDefault33344EditorConfig,
  createDefault33434EditorConfig,
  createDefault4612EditorConfig,
  createDefault3636EditorConfig,
  createDefault3464EditorConfig,
  DEFAULT_EDGE_LENGTH,
} from './createDefault'

/**
 * Gallery↔Lab convergence (ADR-0006, slice 3) — preset → Builder Patch
 * conversion. Pure `PatternConfig → PatternConfig`: a hand-authored static
 * table maps each **tier-1** Gallery preset to the existing Builder seed
 * factory that reproduces its tiling on the lattice path. The user's tunings
 * ride along untouched — figure recipes (regular tiles key `figures` by
 * `tileTypeId` on both pipelines), contact angle, strand style — and the
 * Gallery Frame migrates to an equivalent Builder Shape Frame (Q8a).
 *
 * Tier 2 is now empty — every Archimedean preset converts (elongated
 * triangular landed with #11, snub square with #14, snub hexagonal with #16).
 * Tier-3 presets (irregular Laves / Taprats / rosette patches)
 * are **not convertible** until an irregular-tile Patch encoder lands
 * (star-tilings epic) — `isConvertiblePreset` returns false and
 * `convertPresetToEditorConfig` returns null for them.
 *
 * No derived/BFS-inference solver, by decision (Q12): every row is a bounded,
 * reviewable mapping onto a seed factory that is already browser-verified.
 */

/** Boundary-matching single-cell seed (square / hexagonal / triangular
 * presets): the lone Cell's Seed Tile coincides with its Boundary, so the
 * per-Cell translation lattice reproduces the regular tiling exactly. */
function createSingleCellSeed(shape: CellShape): EditorConfig {
  const edgeLength = DEFAULT_EDGE_LENGTH
  return {
    version: 3,
    cells: [createBoundaryMatchingCell('main', shape, { x: 0, y: 0 }, 0, edgeLength)],
    activeCellId: 'main',
    edgeLength,
  }
}

/**
 * Tier-1 conversion table: Gallery preset tiling id → Builder seed factory.
 * Every factory emits its Patch at `DEFAULT_EDGE_LENGTH`; the converter
 * rescales to the source config's `tiling.scale` so the converted pattern
 * appears at the same world size the Gallery was rendering (and the migrated
 * Frame, which is sized in world units, keeps wrapping the same extent).
 */
const TIER1_SEEDS: Record<string, () => EditorConfig> = {
  'square': () => createSingleCellSeed('square'),
  'hexagonal': () => createSingleCellSeed('hexagon'),
  'triangular': () => createSingleCellSeed('triangle'),
  '4.8.8': createDefault488EditorConfig,
  '3.12.12': createDefault31212EditorConfig,
  '4.6.12': createDefault4612EditorConfig,
  '3.6.3.6': createDefault3636EditorConfig,
  '3.4.6.4': createDefault3464EditorConfig,
  '3.3.3.4.4': createDefault33344EditorConfig,
  '3.3.4.3.4': createDefault33434EditorConfig,
  '3.3.3.3.6': createDefault33336EditorConfig,
}

/** Preset tiling ids convertible today (the tier-1 table's rows). */
export function isConvertiblePreset(tilingType: string): boolean {
  return Object.prototype.hasOwnProperty.call(TIER1_SEEDS, tilingType)
}

function scaleTile(tile: EditorTile, k: number): EditorTile {
  if (tile.kind === 'regular') {
    return {
      ...tile,
      center: { x: tile.center.x * k, y: tile.center.y * k },
      edgeLength: tile.edgeLength * k,
    }
  }
  return { ...tile, vertices: tile.vertices.map(v => ({ x: v.x * k, y: v.y * k })) }
}

/** Uniformly rescale a seeded Patch about the Patch origin. */
function scaleEditorConfig(cfg: EditorConfig, k: number): EditorConfig {
  if (k === 1) return cfg
  return {
    ...cfg,
    edgeLength: cfg.edgeLength * k,
    cells: cfg.cells.map(cell => ({
      ...cell,
      center: { x: cell.center.x * k, y: cell.center.y * k },
      boundarySize: cell.boundarySize * k,
      tiles: cell.tiles.map(t => scaleTile(t, k)),
    })),
  }
}

/**
 * Q8a — migrate a Gallery Frame (`config.frame`, always clip-only `'shape'`)
 * into an equivalent Builder Shape Frame for `editor.frame`. Sizes are world
 * units on both sides, so with the Patch rescaled to `tiling.scale` the frame
 * copies verbatim; `boundaryTreatment` is pinned to `'clip'` because that is
 * the only behaviour the Gallery ever had (the Builder default is
 * `'complete'`, which would change the look). Non-shape frames (which the
 * Gallery never produces) drop to undefined.
 */
export function galleryFrameToShapeFrame(frame: FrameConfig): FrameConfig | undefined {
  if (frame.type !== 'shape') return undefined
  return { ...frame, boundaryTreatment: 'clip' }
}

/**
 * Convert a Gallery preset `PatternConfig` into one carrying a real Builder
 * Patch (`tiling.type === 'editor'`). Returns null when the source is not a
 * convertible tier-1 preset (tier-2/3, unknown tilings, or an already-editor
 * config). The input is never mutated; conversion is one-way and the caller
 * keeps the original (Q4 — user-initiated, original preserved).
 */
export function convertPresetToEditorConfig(config: PatternConfig): PatternConfig | null {
  const type = config.tiling.type
  if (type === 'editor') return null
  const seedFactory = TIER1_SEEDS[type]
  if (!seedFactory) return null

  const scale = config.tiling.scale
  const k = scale > 0 ? scale / DEFAULT_EDGE_LENGTH : 1
  const editor = scaleEditorConfig(seedFactory(), k)
  editor.presetId = type
  if (config.frame) {
    const migrated = galleryFrameToShapeFrame(config.frame)
    if (migrated) editor.frame = migrated
  }

  // The Gallery Frame moves onto the Patch; a top-level `frame` must not
  // survive (it would double-render in any surface that reads both).
  const { frame: _galleryFrame, ...rest } = config
  return {
    ...rest,
    tiling: { type: 'editor', scale: config.tiling.scale },
    editor,
  }
}
