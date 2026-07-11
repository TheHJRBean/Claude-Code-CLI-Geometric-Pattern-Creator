import type { RefObject } from 'react'
import type { PatternConfig } from '../types/pattern'
import { exportSVG, exportPNG, DEFAULT_PNG_BACKGROUND } from './exportSVG'
import { saveJSON, loadJSON } from './exportJSON'

/** A leaf action in the export menu. */
export interface ExportAction {
  label: string
  onClick: () => void
}

/** One entry in the export menu: a plain action, a nested submenu (PNG
 *  resolutions), or a checkbox toggle (transparent background). */
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
  /** PNG on transparent alpha instead of the sandy default. Caller owns the
   *  toggle state so it persists while the menu is open. */
  pngTransparent: boolean
  onTogglePngTransparent: () => void
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
  pngTransparent,
  onTogglePngTransparent,
}: ExportActionsArgs): ExportMenuItem[] {
  const handleExportSVG = () => {
    if (svgRef.current) exportSVG(svgRef.current)
  }
  const exportPngAt = (width: number) => {
    const el = svgRef.current
    if (!el) return
    // Height follows the on-screen aspect ratio so the raster isn't
    // letterboxed/stretched into a square.
    const cw = el.clientWidth || 1200
    const ch = el.clientHeight || 900
    const height = Math.max(1, Math.round(width * (ch / cw)))
    void exportPNG(el, {
      width,
      height,
      background: pngTransparent ? null : DEFAULT_PNG_BACKGROUND,
    })
  }
  const handleSaveJSON = () => saveJSON(config)
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
    { kind: 'toggle', label: 'Transparent background', checked: pngTransparent, onToggle: onTogglePngTransparent },
  ]
  items.push({ kind: 'action', label: 'Save JSON', onClick: handleSaveJSON })
  items.push({ kind: 'action', label: 'Load JSON', onClick: handleLoadJSON })
  return items
}
