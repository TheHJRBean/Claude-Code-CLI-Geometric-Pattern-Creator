import type { RefObject } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { exportSVG, exportPNG, exportUnwovenSVG } from './exportSVG'
import { saveJSON, loadJSON } from './exportJSON'

export interface ExportMenuItem {
  label: string
  onClick: () => void
}

export interface ExportActionsArgs {
  /** Live DOM `<svg>` — image export MUST run against it, not `segmentsRef`:
   *  under the Lever A periodicity fast-path `segments` is a single fundamental
   *  domain while the full field lives as `<use>` clones in the DOM. */
  svgRef: RefObject<SVGSVGElement | null>
  segmentsRef: RefObject<Segment[]>
  config: PatternConfig
  /** Receives a validated PatternConfig from Load JSON (caller dispatches). */
  onLoad: (config: PatternConfig) => void
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
  includeUnwoven = false,
}: ExportActionsArgs): ExportMenuItem[] {
  const handleExportSVG = () => {
    if (svgRef.current) exportSVG(svgRef.current)
  }
  const handleExportPNG = () => {
    if (svgRef.current) void exportPNG(svgRef.current)
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
    { label: 'Export SVG', onClick: handleExportSVG },
    { label: 'Export PNG', onClick: handleExportPNG },
  ]
  if (includeUnwoven) {
    items.push({ label: 'Export Unwoven SVG', onClick: handleExportUnwovenSVG })
  }
  items.push({ label: 'Save JSON', onClick: handleSaveJSON })
  items.push({ label: 'Load JSON', onClick: handleLoadJSON })
  return items
}
