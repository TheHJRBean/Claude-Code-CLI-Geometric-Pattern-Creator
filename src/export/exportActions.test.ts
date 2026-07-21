import { describe, it, expect, vi } from 'vitest'
import { buildExportMenuItems, PNG_SIZES, type ExportActionsArgs } from './exportActions'
import type { PatternConfig } from '../types/pattern'

// buildExportMenuItems is pure until a handler fires (handlers touch the DOM),
// so the returned menu structure is testable in the node env.

function args(overrides: Partial<ExportActionsArgs> = {}): ExportActionsArgs {
  return {
    svgRef: { current: null },
    config: {} as PatternConfig,
    onLoad: () => {},
    pngTransparent: false,
    onTogglePngTransparent: () => {},
    maxFill: false,
    onToggleMaxFill: () => {},
    ...overrides,
  }
}

const labels = (items: ReturnType<typeof buildExportMenuItems>) => items.map(i => i.label)

describe('buildExportMenuItems', () => {
  it('is one uniform menu with no Unwoven-SVG (archived in the flip, ADR-0006 Q8b)', () => {
    expect(labels(buildExportMenuItems(args()))).not.toContain('Export Unwoven SVG')
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
      .find(i => i.label === 'Transparent background')
    expect(toggle?.kind).toBe('toggle')
    if (toggle?.kind !== 'toggle') throw new Error('expected toggle')
    expect(toggle.checked).toBe(true)
    toggle.onToggle()
    expect(onTogglePngTransparent).toHaveBeenCalledOnce()
  })

  it('reflects Max-fill state on its own toggle and fires the callback', () => {
    const onToggleMaxFill = vi.fn()
    const toggle = buildExportMenuItems(args({ maxFill: true, onToggleMaxFill }))
      .find(i => i.label === 'Max-fill export')
    expect(toggle?.kind).toBe('toggle')
    if (toggle?.kind !== 'toggle') throw new Error('expected toggle')
    expect(toggle.checked).toBe(true)
    toggle.onToggle()
    expect(onToggleMaxFill).toHaveBeenCalledOnce()
  })

  it('keeps Save/Load JSON as the trailing actions', () => {
    expect(labels(buildExportMenuItems(args())).slice(-2)).toEqual(['Save JSON', 'Load JSON'])
  })
})
