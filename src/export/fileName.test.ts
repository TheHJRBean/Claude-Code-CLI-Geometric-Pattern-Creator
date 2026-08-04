import { describe, it, expect } from 'vitest'
import { DEFAULT_EXPORT_BASENAME, exportFileName, sanitiseFileBase } from './fileName'

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
