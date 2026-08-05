import type { RefObject } from 'react'
import type { PatternConfig } from '../types/pattern'
import { exportSVG, exportPNG, DEFAULT_PNG_BACKGROUND, measureExportContentBounds, padContentBounds, type ContentBounds } from './exportSVG'
import { saveJSON, loadJSON } from './exportJSON'
import { patternDisplayName } from './fileName'

/** A leaf action in the export menu. */
export interface ExportAction {
  label: string
  onClick: () => void
}

/** One entry in the export menu: a plain action, a nested submenu (PNG
 *  resolutions), or a checkbox toggle (transparent background / Max-fill). */
export type ExportMenuItem =
  | ({ kind: 'action' } & ExportAction)
  | { kind: 'submenu'; label: string; items: ExportAction[] }
  | { kind: 'toggle'; label: string; checked: boolean; onToggle: () => void }

/** PNG raster widths offered in the resolution submenu (px on the long-edge /
 *  width; height follows the live SVG's aspect ratio). */
export const PNG_SIZES = [1024, 2048, 4096, 8192] as const

export interface ExportActionsArgs {
  /** Live DOM `<svg>` — image export MUST run against it: under the Lever A
   *  periodicity fast-path the in-memory `segments` are a single fundamental
   *  domain while the full field lives as `<use>` clones in the DOM. */
  svgRef: RefObject<SVGSVGElement | null>
  config: PatternConfig
  /** Receives a validated PatternConfig from Load JSON (caller dispatches). */
  onLoad: (config: PatternConfig) => void
  /** Export on transparency instead of the pattern's backdrop — alpha for PNG,
   *  no underlay rect for SVG. Governs BOTH formats: an SVG export gained a
   *  real background rect on 2026-08-05, and one "Transparent background"
   *  control that meant it for only one of the two formats would be a lie.
   *  Caller owns the toggle state so it persists while the menu is open. */
  transparentBackground: boolean
  onToggleTransparentBackground: () => void
  /** Max-fill: recompute the export viewBox to the content's own bounds
   *  (Frame outline when clipping is active, else the rendered pattern)
   *  instead of the live on-screen camera. Off = today's screen-view export. */
  maxFill: boolean
  onToggleMaxFill: () => void
  /** Resolves the name of the library entry this config is attached to, when
   *  there is one — it outranks the config's own designated name (see
   *  `downloadName`). A getter, not a value: reading a name means parsing the
   *  whole library out of localStorage, and it must be the name as of the
   *  click (a rename between renders would go stale). */
  resolveSaveName?: () => string | null | undefined
}

/** Resolve the Max-fill viewBox for the current live SVG, or undefined when
 *  Max-fill is off or content bounds can't be determined (falls back to the
 *  screen-view export unchanged). */
function resolveMaxFillViewBox(svgEl: SVGSVGElement | null, maxFill: boolean): ContentBounds | undefined {
  if (!maxFill || !svgEl) return undefined
  const bounds = measureExportContentBounds(svgEl)
  return bounds ? padContentBounds(bounds) : undefined
}

/**
 * The single source of truth for the export menu — one identical menu for every
 * config source (converted presets, user Patches, legacy renders), so the paths
 * can't drift. Image exports run against the live `<svg>`; Save/Load round-trip
 * the whole `PatternConfig`. Unwoven-SVG was archived in the convergence flip
 * (ADR-0006 Q8b) — it rebuilt from the in-memory segments, one unit cell under
 * Lever A; it returns Lab-wide via the export epic if ever revived.
 */
export function buildExportMenuItems({
  svgRef,
  config,
  onLoad,
  transparentBackground,
  onToggleTransparentBackground,
  maxFill,
  onToggleMaxFill,
  resolveSaveName,
}: ExportActionsArgs): ExportMenuItem[] {
  // Saved name first, then whatever the config designates for itself; only a
  // from-scratch unsaved Patch falls through to the generic default.
  const downloadName = () => resolveSaveName?.() ?? patternDisplayName(config)
  // The pattern's own backdrop, not a fixed paper tone — both formats bake it
  // in (PNG flattens onto it, SVG gets an underlay rect), so a painted
  // background that only lived in the live canvas would otherwise silently
  // revert to sand on export.
  const exportBackground = () =>
    transparentBackground ? null : (config.strand.background || DEFAULT_PNG_BACKGROUND)
  const handleExportSVG = () => {
    const el = svgRef.current
    if (!el) return
    exportSVG(el, {
      viewBox: resolveMaxFillViewBox(el, maxFill),
      name: downloadName(),
      background: exportBackground(),
    })
  }
  const exportPngAt = (width: number) => {
    const el = svgRef.current
    if (!el) return
    const viewBox = resolveMaxFillViewBox(el, maxFill)
    // Height follows the export's own aspect ratio — content bounds under
    // Max-fill, the on-screen viewport otherwise — so the raster isn't
    // letterboxed/stretched.
    const aspect = viewBox
      ? viewBox.height / viewBox.width
      : (el.clientHeight || 900) / (el.clientWidth || 1200)
    const height = Math.max(1, Math.round(width * aspect))
    void exportPNG(el, {
      width,
      height,
      background: exportBackground(),
      viewBox,
      name: downloadName(),
    })
  }
  const handleSaveJSON = () => saveJSON(config, downloadName())
  const handleLoadJSON = async () => {
    try {
      onLoad(await loadJSON())
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Could not load file.'
      window.alert(`Could not load file: ${msg}`)
    }
  }

  const items: ExportMenuItem[] = [
    { kind: 'action', label: 'Export SVG', onClick: handleExportSVG },
    {
      kind: 'submenu',
      label: 'Export PNG',
      items: PNG_SIZES.map(px => ({ label: `${px} px`, onClick: () => exportPngAt(px) })),
    },
    { kind: 'toggle', label: 'Transparent background', checked: transparentBackground, onToggle: onToggleTransparentBackground },
    { kind: 'toggle', label: 'Max-fill export', checked: maxFill, onToggle: onToggleMaxFill },
  ]
  items.push({ kind: 'action', label: 'Save JSON', onClick: handleSaveJSON })
  items.push({ kind: 'action', label: 'Load JSON', onClick: handleLoadJSON })
  return items
}
