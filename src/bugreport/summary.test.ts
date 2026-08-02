import { describe, it, expect } from 'vitest'
import type { PatternConfig } from '../types/pattern'
import type { EditorConfig } from '../types/editor'
import { summarisePatternConfig } from './summary'

/** Minimal legacy-substrate config. */
function legacyConfig(over: Partial<PatternConfig> = {}): PatternConfig {
  return {
    version: 1,
    tiling: { type: '4.8.8', scale: 100 },
    figures: {
      '8': { type: 'star', contactAngle: 67.5, lineLength: 1, autoLineLength: true },
    },
    strand: { width: 4, color: '#111', background: '#eee' },
    ...over,
  }
}

function patch(over: Partial<EditorConfig> = {}): EditorConfig {
  return {
    version: 3,
    activeCellId: 'octagon',
    edgeLength: 60,
    configuration: '4.8.8',
    cells: [
      {
        id: 'octagon', shape: 'octagon', center: { x: 0, y: 0 }, rotation: 0,
        boundarySize: 200, seedSides: 8, tiles: [
          { kind: 'regular', id: 't1', sides: 8, center: { x: 0, y: 0 }, rotation: 0, edgeLength: 60, source: 'seed' },
        ],
        symmetryMode: 'full',
      },
      {
        id: 'square', shape: 'square', center: { x: 145, y: 0 }, rotation: Math.PI / 4,
        boundarySize: 200, seedSides: 4, tiles: [], noSeed: true,
      },
    ],
    ...over,
  } as EditorConfig
}

describe('summarisePatternConfig', () => {
  it('returns null for a missing config', () => {
    expect(summarisePatternConfig(null)).toBeNull()
    expect(summarisePatternConfig(undefined)).toBeNull()
  })

  it('classifies a legacy tiling', () => {
    const s = summarisePatternConfig(legacyConfig())!
    expect(s.substrate).toBe('legacy')
    expect(s.tiling).toBe('4.8.8')
    expect(s.cells).toEqual([])
    expect(s.configuration).toBeNull()
    expect(s.edgeLength).toBeNull()
  })

  it('classifies a fresh Lab with nothing selected as empty, not legacy', () => {
    // The distinction matters: "nothing renders" is a real report, and the
    // answer is often that no tiling was ever picked.
    const s = summarisePatternConfig(legacyConfig({ tiling: { type: '', scale: 100 } }))!
    expect(s.substrate).toBe('empty')
    expect(s.tiling).toBe('(none selected)')
  })

  it('breaks a Builder Patch down per Cell and totals the Tiles', () => {
    const s = summarisePatternConfig(legacyConfig({ tiling: { type: 'editor', scale: 100 }, editor: patch() }))!
    expect(s.substrate).toBe('patch')
    expect(s.configuration).toBe('4.8.8')
    expect(s.edgeLength).toBe(60)
    expect(s.totalTiles).toBe(1)
    expect(s.cells).toHaveLength(2)
    expect(s.cells[0]).toMatchObject({ id: 'octagon', shape: 'octagon', tiles: 1, symmetry: 'full', noSeed: false })
    // An absent `symmetryMode` reads as 'none', matching the render path's
    // own default rather than reporting `undefined`.
    expect(s.cells[1]).toMatchObject({ id: 'square', tiles: 0, symmetry: 'none', noSeed: true })
  })

  it('reports Guides and world-space Guide Tiles separately', () => {
    const withGuides = patch({
      guides: [
        { id: 'g1', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, stamp: false, extend: 'none' },
      ] as EditorConfig['guides'],
      guideTiles: [
        { kind: 'regular', id: 'gt1', sides: 6, center: { x: 5, y: 5 }, rotation: 0, edgeLength: 60, source: 'completed' },
      ] as EditorConfig['guideTiles'],
    })
    const s = summarisePatternConfig(legacyConfig({ tiling: { type: 'editor', scale: 100 }, editor: withGuides }))!
    expect(s.guides).toBe(1)
    expect(s.guideTiles).toBe(1)
  })

  it('summarises a Morph that is configured but switched off', () => {
    const s = summarisePatternConfig(legacyConfig({
      morph: { enabled: false, mode: 'radial', axisOrigin: { x: 0, y: 0 }, easing: 'linear', origins: [] },
    }))!
    // "off (configured)" not "none": a disabled Morph still changes which code
    // paths a save takes on load, so a report must not hide it.
    expect(s.morph).toBe('off (configured) — radial, 0 Origin(s)')
  })

  it('flattens Figure recipes including extra line sets', () => {
    const s = summarisePatternConfig(legacyConfig({
      figures: {
        '8': {
          type: 'star', contactAngle: 67.5, lineLength: 0.8, autoLineLength: false,
          vertexLinesEnabled: true, vertexLinesDecoupled: true,
          curve: { enabled: true, points: [{ position: 0.5, offset: 0.2 }], alternating: true },
          extraSets: [
            { id: 's1', kind: 'vertex', contactAngle: 30, lineLength: 1, autoLineLength: true },
            { id: 's2', kind: 'boundary', contactAngle: 0, lineLength: 1, autoLineLength: true, enabled: false },
          ],
        },
      },
    }))!
    const fig = s.figures[0]
    expect(fig).toMatchObject({
      tileTypeId: '8', contactAngle: 67.5, edgeLines: true, vertexLines: true, vertexDecoupled: true,
    })
    expect(fig.curve).toBe('1 pt, alternating')
    expect(fig.extraSets[0]).toBe('vertex — θ 30°')
    // A boundary set ignores θ entirely — reporting "θ 0°" would read as a
    // real angle the user had chosen.
    expect(fig.extraSets[1]).toBe('boundary — no θ (off)')
  })

  it('finds decoration in the Patch home as well as the legacy one', () => {
    const decoration = {
      version: 1 as const,
      strandColours: [],
      voidFills: [{ scope: 'congruent' as const, key: 'sig#1', colour: '#f00' }],
    }
    const onPatch = summarisePatternConfig(legacyConfig({
      tiling: { type: 'editor', scale: 100 },
      editor: patch({ decoration }),
    }))!
    const onLegacy = summarisePatternConfig(legacyConfig({ decoration }))!
    expect(onPatch.decoration).toContain('1 Void fill(s)')
    expect(onLegacy.decoration).toContain('1 Void fill(s)')
  })

  it('survives a malformed config rather than throwing away the report', () => {
    // A report is filed *because* something is wrong; the summariser must not
    // be the thing that loses the user's note.
    const broken = { tiling: null, figures: null, strand: null } as unknown as PatternConfig
    const s = summarisePatternConfig(broken)!
    expect(s.substrate).toBe('empty')
    expect(s.figures).toEqual([])
    expect(s.strand).toBe('none')
  })
})
