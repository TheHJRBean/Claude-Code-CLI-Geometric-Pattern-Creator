import { describe, it, expect } from 'vitest'
import { DEFAULT_EXPORT_BASENAME, exportFileName, patternDisplayName, sanitiseFileBase } from './fileName'
import { DEFAULT_CONFIG } from '../state/defaults'
import { TILINGS } from '../tilings/index'
import type { PatternConfig } from '../types/pattern'
import type { EditorConfig } from '../types/editor'

describe('sanitiseFileBase', () => {
  it('keeps an ordinary name, spaces collapsed to dashes', () => {
    expect(sanitiseFileBase('My  Star Pattern')).toBe('My-Star-Pattern')
  })

  it('keeps the dots in a Configuration name', () => {
    expect(sanitiseFileBase('Rosette 4.8.8')).toBe('Rosette-4.8.8')
  })

  it('replaces path separators and other filesystem-illegal characters', () => {
    expect(sanitiseFileBase('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('strips leading/trailing dots and dashes', () => {
    expect(sanitiseFileBase('  ..hidden-- ')).toBe('hidden')
  })

  it('caps the length without leaving a trailing separator', () => {
    const base = sanitiseFileBase(`${'x'.repeat(79)} tail`)
    expect(base).toBe('x'.repeat(79))
  })

  it('returns null when nothing usable survives', () => {
    expect(sanitiseFileBase('///')).toBeNull()
    expect(sanitiseFileBase('   ')).toBeNull()
    expect(sanitiseFileBase('')).toBeNull()
    expect(sanitiseFileBase(undefined)).toBeNull()
  })
})

describe('exportFileName', () => {
  it('names the file after the save', () => {
    expect(exportFileName('Kagome study', 'svg')).toBe('Kagome-study.svg')
  })

  it('falls back to the default for unsaved work', () => {
    expect(exportFileName(null, 'png')).toBe(`${DEFAULT_EXPORT_BASENAME}.png`)
    expect(exportFileName('***', 'json')).toBe(`${DEFAULT_EXPORT_BASENAME}.json`)
  })
})

describe('patternDisplayName', () => {
  const withTiling = (type: string): PatternConfig =>
    ({ ...DEFAULT_CONFIG, tiling: { ...DEFAULT_CONFIG.tiling, type } } as PatternConfig)

  const patch = (editor: Partial<EditorConfig>): PatternConfig =>
    ({
      ...DEFAULT_CONFIG,
      tiling: { ...DEFAULT_CONFIG.tiling, type: 'editor' },
      editor: editor as EditorConfig,
    } as PatternConfig)

  it('names a legacy render after its tiling label', () => {
    expect(patternDisplayName(withTiling('4.8.8'))).toBe(TILINGS['4.8.8'].label)
  })

  it('names a converted Patch after the preset it came from', () => {
    expect(patternDisplayName(patch({ presetId: '4.8.8', configuration: '3.12.12' })))
      .toBe(TILINGS['4.8.8'].label)
  })

  it('falls back to the Builder Configuration when there is no preset', () => {
    expect(patternDisplayName(patch({ configuration: '3.6.3.6' }))).toBe('3.6.3.6')
  })

  it('returns null for a from-scratch Patch', () => {
    expect(patternDisplayName(patch({}))).toBeNull()
    expect(exportFileName(patternDisplayName(patch({})), 'svg')).toBe(`${DEFAULT_EXPORT_BASENAME}.svg`)
  })
})
