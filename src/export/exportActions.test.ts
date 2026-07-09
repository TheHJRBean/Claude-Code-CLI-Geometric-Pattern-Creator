import { describe, it, expect, vi } from 'vitest'
import { buildExportMenuItems, PNG_SIZES, type ExportActionsArgs } from './exportActions'
import type { PatternConfig } from '../types/pattern'
import type { Segment } from '../types/geometry'

// buildExportMenuItems is pure until a handler fires (handlers touch the DOM),
// so the returned menu structure is testable in the node env.

function args(overrides: Partial<ExportActionsArgs> = {}): ExportActionsArgs {
  return {
    svgRef: { current: null },
    segmentsRef: { current: [] as Segment[] },
    config: {} as PatternConfig,
    onLoad: () => {},
    pngTransparent: false,
    onTogglePngTransparent: () => {},
    ...overrides,
  }
}

const labels = (items: ReturnType<typeof buildExportMenuItems>) => items.map(i => i.label)

describe('buildExportMenuItems', () => {
  it('omits Unwoven-SVG by default (Lab), includes it when opted in (Gallery)', () => {
    expect(labels(buildExportMenuItems(args()))).not.toContain('Export Unwoven SVG')
    expect(labels(buildExportMenuItems(args({ includeUnwoven: true })))).toContain('Export Unwoven SVG')
  })

  it('exposes PNG as a submenu with one item per PNG_SIZES entry', () => {
    const png = buildExportMenuItems(args()).find(i => i.label === 'Export PNG')
    expect(png?.kind).toBe('submenu')
    if (png?.kind !== 'submenu') throw new Error('expected submenu')
    expect(png.items.map(s => s.label)).toEqual(PNG_SIZES.map(px => `${px} px`))
  })

  it('reflects transparent state on the toggle and fires the callback', () => {
    const onTogglePngTransparent = vi.fn()
    const toggle = buildExportMenuItems(args({ pngTransparent: true, onTogglePngTransparent }))
      .find(i => i.kind === 'toggle')
    expect(toggle?.kind).toBe('toggle')
    if (toggle?.kind !== 'toggle') throw new Error('expected toggle')
    expect(toggle.checked).toBe(true)
    toggle.onToggle()
    expect(onTogglePngTransparent).toHaveBeenCalledOnce()
  })

  it('keeps Save/Load JSON as the trailing actions', () => {
    expect(labels(buildExportMenuItems(args())).slice(-2)).toEqual(['Save JSON', 'Load JSON'])
  })
})
