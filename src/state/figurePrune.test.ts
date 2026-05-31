import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import type { PatternConfig } from '../types/pattern'

const fig = (extra: Record<string, unknown> = {}) =>
  ({ type: 'star', lineLength: 1, autoLineLength: true, contactAngle: 60, ...extra }) as any

describe('figure-key pruning (stale-key bleed fix)', () => {
  it('LOAD_CONFIG drops foreign tile-type keys from a polluted save', () => {
    // Mirrors the user's real "…(modified)" snub-square save: 6 keys for a
    // 2-type tiling, including a "5" vertex figure that bled in from a
    // pentagonal tiling.
    const polluted = {
      tiling: { type: '3.3.4.3.4', scale: 100 },
      figures: {
        '3': fig({ contactAngle: 23, vertexLinesEnabled: true }),
        '4': fig({ contactAngle: 61.5, vertexLinesEnabled: true }),
        '5': fig({ contactAngle: 63, vertexLinesEnabled: true }),
        '6': fig({ contactAngle: 60, vertexLinesEnabled: true }),
        '4.1': fig({ vertexLinesEnabled: true }),
        '4.2': fig({ vertexLinesEnabled: true }),
      },
      strand: { width: 2, color: '#1a1a2e', background: '#f5f0e8' },
    } as unknown as PatternConfig

    const out = reducer(structuredClone(DEFAULT_CONFIG), { type: 'LOAD_CONFIG', payload: polluted } as any)
    expect(Object.keys(out.figures).sort()).toEqual(['3', '4'])
    expect(out.figures['3'].vertexLinesEnabled).toBe(true)
  })

  it('SET_TILING_TYPE prunes instead of accumulating across switches', () => {
    let s = structuredClone(DEFAULT_CONFIG) // square, figures {4}
    // Walk through several tilings the way the user did.
    for (const t of ['3.3.4.3.4', 'pentagonal-rosette', '3.3.3.3.6', '3.3.4.3.4']) {
      s = reducer(s, { type: 'SET_TILING_TYPE', payload: t } as any)
      const valid = new Set(Object.keys(s.figures))
      // After landing on each tiling, figures must not contain keys from
      // unrelated tilings. Spot-check the final snub-square landing:
      void valid
    }
    expect(Object.keys(s.figures).sort()).toEqual(['3', '4'])
  })

  it('switching tilings does not leak a shared-id (e.g. "4") setting across', () => {
    let s = structuredClone(DEFAULT_CONFIG) // square tiling, type "4"
    s = reducer(s, { type: 'SET_VERTEX_LINES_ENABLED', payload: { tileTypeId: '4', enabled: true } } as any)
    expect(s.figures['4'].vertexLinesEnabled).toBe(true)
    // Switch to 3.3.4.3.4, which also has a "4". The square's vertex setting
    // must NOT carry over — snub-square "4" resets to its own default.
    s = reducer(s, { type: 'SET_TILING_TYPE', payload: '3.3.4.3.4' } as any)
    expect(s.figures['4'].vertexLinesEnabled).toBeFalsy()
  })

  it('re-selecting the same tiling preserves that tiling’s own tweaks', () => {
    let s = structuredClone(DEFAULT_CONFIG)
    s = reducer(s, { type: 'SET_TILING_TYPE', payload: '3.3.4.3.4' } as any)
    s = reducer(s, { type: 'SET_VERTEX_LINES_ENABLED', payload: { tileTypeId: '3', enabled: true } } as any)
    s = reducer(s, { type: 'SET_TILING_TYPE', payload: '3.3.4.3.4' } as any)
    expect(s.figures['3'].vertexLinesEnabled).toBe(true)
  })

  it('editor/Builder configs are left untouched by LOAD_CONFIG', () => {
    const editorCfg = {
      tiling: { type: 'editor', scale: 100 },
      figures: { '3': fig(), '4i:abc12345': fig() },
      strand: { width: 2, color: '#1a1a2e', background: '#f5f0e8' },
    } as unknown as PatternConfig
    const out = reducer(structuredClone(DEFAULT_CONFIG), { type: 'LOAD_CONFIG', payload: editorCfg } as any)
    expect(Object.keys(out.figures).sort()).toEqual(['3', '4i:abc12345'])
  })
})
