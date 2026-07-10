import { describe, it, expect } from 'vitest'
import type { PatternConfig } from '../types/pattern'
import type { FrameConfig } from '../types/editor'
import { TILINGS } from '../tilings/index'
import { migrateEditorConfig } from './migrations'
import {
  convertPresetToEditorConfig,
  galleryFrameToShapeFrame,
  isConvertiblePreset,
} from './presetConversion'

// Conversion seam (convergence ticket #4). Every tier-1 preset must convert
// into a valid, loadable editor config with the user's tunings + Frame
// carried over and provenance stamped; everything else must be cleanly
// identified as non-convertible.

const TIER1 = ['square', 'hexagonal', 'triangular', '4.8.8', '3.12.12', '4.6.12', '3.6.3.6', '3.4.6.4']
const NON_CONVERTIBLE = ['cairo-pentagonal', 'rhombille', 'decagonal-rosette', '3.3.4.3.4', '3.3.3.4.4', '3.3.3.3.6', 'no-such-tiling']

function presetConfig(type: string, scale = 100): PatternConfig {
  return {
    tiling: { type, scale },
    figures: (TILINGS[type]?.defaultConfig?.figures ?? {}) as PatternConfig['figures'],
    strand: { width: 3, color: '#8b1e3f', background: '#f5f0e8', lineStyle: 'double' },
    smoothTransitions: true,
    figureRouting: 'centroid',
  }
}

describe('convertPresetToEditorConfig — tier-1 table', () => {
  it.each(TIER1)('%s converts to a valid, loadable editor config', (type) => {
    const out = convertPresetToEditorConfig(presetConfig(type))
    expect(out).not.toBeNull()
    expect(out!.tiling.type).toBe('editor')
    expect(out!.editor).toBeDefined()

    // Loadable: survives the JSON round-trip through the load-time migrator.
    const loaded = migrateEditorConfig(JSON.parse(JSON.stringify(out!.editor)))
    expect(loaded).not.toBeNull()
    expect(loaded!.cells.length).toBe(out!.editor!.cells.length)
    // Provenance survives the round-trip too.
    expect(loaded!.presetId).toBe(type)
  })

  it.each(TIER1)('%s carries figure recipes, strand style and routing over', (type) => {
    const src = presetConfig(type)
    const out = convertPresetToEditorConfig(src)!
    expect(out.figures).toEqual(src.figures)
    expect(out.strand).toEqual(src.strand)
    expect(out.smoothTransitions).toBe(true)
    expect(out.figureRouting).toBe('centroid')
  })

  it('multi-cell presets keep their Configuration id', () => {
    for (const type of ['4.8.8', '3.12.12', '4.6.12', '3.6.3.6', '3.4.6.4'] as const) {
      const out = convertPresetToEditorConfig(presetConfig(type))!
      expect(out.editor!.configuration).toBe(type)
    }
  })

  it('rescales the seeded Patch to the source tiling scale', () => {
    const out = convertPresetToEditorConfig(presetConfig('4.8.8', 60))!
    const patch = out.editor!
    expect(patch.edgeLength).toBe(60)
    const square = patch.cells.find(c => c.id === 'square')!
    const offset = (60 * (1 + Math.SQRT2)) / 2
    expect(square.center.x).toBeCloseTo(offset, 9)
    expect(square.center.y).toBeCloseTo(offset, 9)
    expect(square.boundarySize).toBe(60)
    const seed = square.tiles[0]
    expect(seed.kind).toBe('regular')
    if (seed.kind === 'regular') expect(seed.edgeLength).toBe(60)
  })

  it('does not mutate the input config', () => {
    const src = presetConfig('hexagonal', 80)
    src.frame = { type: 'shape', shape: 'square', size: 500 }
    const snapshot = JSON.parse(JSON.stringify(src))
    convertPresetToEditorConfig(src)
    expect(src).toEqual(snapshot)
  })
})

describe('convertPresetToEditorConfig — Gallery Frame migration (Q8a)', () => {
  const frame: FrameConfig = {
    type: 'shape',
    shape: 'octagon',
    size: 640,
    aspect: Math.SQRT2,
    rotation: 0.3,
  }

  it('moves config.frame onto editor.frame as a clip Shape Frame', () => {
    const src = { ...presetConfig('square'), frame }
    const out = convertPresetToEditorConfig(src)!
    expect(out.frame).toBeUndefined()
    expect(out.editor!.frame).toEqual({ ...frame, boundaryTreatment: 'clip' })
  })

  it('converts without a frame when the source has none', () => {
    const out = convertPresetToEditorConfig(presetConfig('square'))!
    expect(out.editor!.frame).toBeUndefined()
  })

  it('galleryFrameToShapeFrame pins clip and rejects non-shape frames', () => {
    expect(galleryFrameToShapeFrame(frame)!.boundaryTreatment).toBe('clip')
    expect(galleryFrameToShapeFrame({ type: 'n-ring', rings: 2 })).toBeUndefined()
  })
})

describe('convertPresetToEditorConfig — non-convertible sources', () => {
  it.each(NON_CONVERTIBLE)('%s is identified as non-convertible', (type) => {
    expect(isConvertiblePreset(type)).toBe(false)
    expect(convertPresetToEditorConfig(presetConfig(type))).toBeNull()
  })

  it('an editor-sourced config is not converted', () => {
    const src = presetConfig('square')
    src.tiling = { type: 'editor', scale: 100 }
    expect(convertPresetToEditorConfig(src)).toBeNull()
  })

  it('every tier-1 row reports convertible', () => {
    for (const type of TIER1) expect(isConvertiblePreset(type)).toBe(true)
  })
})
