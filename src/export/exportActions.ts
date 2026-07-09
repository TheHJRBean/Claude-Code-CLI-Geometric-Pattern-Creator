import type { RefObject } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { exportSVG, exportPNG, exportUnwovenSVG, DEFAULT_PNG_BACKGROUND } from './exportSVG'
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
  /** Live DOM `<svg>` — image export MUST run against it, not `segmentsRef`:
   *  under the Lever A periodicity fast-path `segments` is a single fundamental
   *  domain while the full field lives as `<use>` clones in the DOM. */
  svgRef: RefObject<SVGSVGElement | null>
  segmentsRef: RefObject<Segment[]>
  config: PatternConfig
  /** Receives a validated PatternConfig from Load JSON (caller dispatches). */
  onLoad: (config: PatternConfig) => void
  /** PNG on transparent alpha instead of the sandy default. Caller owns the
   *  toggle state so it persists while the menu is open. */
  pngTransparent: boolean
  onTogglePngTransparent: () => void
  /** Include "Export Unwoven SVG". Off in the Lab/Builder: it rebuilds from
   *  `segmentsRef`, which is one fundamental domain under Lever A, so it would
   *  emit a single unit cell. Gallery opts in. */
  includeUnwoven?: boolean
}

/**
 * The single source of truth for the export menu, shared by Gallery and
 * Lab/Builder so the two can't drift (they previously duplicated near-identical
 * handlers and the Lab silently lacked Unwoven-SVG). Image exports run against
 * the live `<svg>`; Save/Load round-trip the whole `PatternConfig`.
 */
export function buildExportMenuItems({
  svgRef,
  segmentsRef,
  config,
  onLoad,
  pngTransparent,
  onTogglePngTransparent,
  includeUnwoven = false,
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
  const handleExportUnwovenSVG = () => {
    const el = svgRef.current
    if (!el) return
    const viewBox = el.getAttribute('viewBox') || '0 0 100 100'
    const w = el.clientWidth || 1200
    const h = el.clientHeight || 900
    exportUnwovenSVG(segmentsRef.current ?? [], viewBox, w, h)
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
  if (includeUnwoven) {
    items.push({ kind: 'action', label: 'Export Unwoven SVG', onClick: handleExportUnwovenSVG })
  }
  items.push({ kind: 'action', label: 'Save JSON', onClick: handleSaveJSON })
  items.push({ kind: 'action', label: 'Load JSON', onClick: handleLoadJSON })
  return items
}
