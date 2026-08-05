import { describe, it, expect } from 'vitest'
import { broadcastFigureAction } from './figureBroadcast'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import type { Action } from './actions'
import type { FigureConfig, PatternConfig } from '../types/pattern'

/**
 * "Apply to all Tiles" — the dispatch-layer fan-out. The reducer keeps its
 * one-Tile-type contract, so these tests check both halves: which actions
 * expand (and to what), and that replaying the expansion through the real
 * reducer actually lands the same value on every Tile type.
 */

const fig = (over: Partial<FigureConfig> = {}): FigureConfig => ({
  type: 'star',
  contactAngle: 30,
  lineLength: 1,
  autoLineLength: true,
  ...over,
})

const FIGURES: Record<string, FigureConfig> = { '3': fig(), '4': fig(), '6': fig() }
const IDS = ['3', '4', '6']

function apply(actions: Action[], figures: Record<string, FigureConfig>): PatternConfig {
  return actions.reduce<PatternConfig>(
    (s, a) => reducer(s, a),
    { ...DEFAULT_CONFIG, figures: structuredClone(figures) },
  )
}

describe('broadcastFigureAction', () => {
  it('passes the action through untouched when the toggle is off', () => {
    const a: Action = { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '3', angle: 55 } }
    expect(broadcastFigureAction(a, false, IDS, FIGURES)).toEqual([a])
  })

  it('fans a contact-angle edit out to the other Tile types, source first', () => {
    const a: Action = { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '3', angle: 55 } }
    const out = broadcastFigureAction(a, true, IDS, FIGURES)
    expect(out).toHaveLength(3)
    expect(out[0]).toBe(a)
    expect(out.map(x => (x as typeof a).payload.tileTypeId)).toEqual(['3', '4', '6'])
    expect(out.every(x => (x as typeof a).payload.angle === 55)).toBe(true)
  })

  it('leaves non-Figure actions alone', () => {
    const a: Action = { type: 'SET_SCALE', payload: 2 }
    expect(broadcastFigureAction(a, true, IDS, FIGURES)).toEqual([a])
  })

  it('does not touch a Morph origin edit despite its tileTypeId', () => {
    const a: Action = {
      type: 'SET_MORPH_ORIGIN_ANGLE',
      payload: { originId: 'o1', tileTypeId: '3', field: 'contactAngle', angle: 40 },
    }
    expect(broadcastFigureAction(a, true, IDS, FIGURES)).toEqual([a])
  })

  it('only reaches Tile types that are live on canvas, never stale figures keys', () => {
    const withStale = { ...FIGURES, '12': fig() }
    const a: Action = { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '3', angle: 55 } }
    const out = broadcastFigureAction(a, true, IDS, withStale)
    expect(out.map(x => (x as typeof a).payload.tileTypeId)).not.toContain('12')
  })

  it('is a no-op expansion when the source is the only Tile type', () => {
    const a: Action = { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '3', angle: 55 } }
    expect(broadcastFigureAction(a, true, ['3'], FIGURES)).toEqual([a])
  })

  describe('line sets', () => {
    it('adds a set to every Tile type', () => {
      const a: Action = { type: 'ADD_FIGURE_SET', payload: { tileTypeId: '3', kind: 'edge' } }
      const out = broadcastFigureAction(a, true, IDS, FIGURES)
      expect(out).toHaveLength(3)
      const next = apply(out, FIGURES)
      expect(IDS.map(id => next.figures[id].extraSets?.length)).toEqual([1, 1, 1])
    })

    it('updates a set only where the same id carries the same kind', () => {
      const figures: Record<string, FigureConfig> = {
        '3': fig({ extraSets: [{ id: 'set-1', kind: 'edge', contactAngle: 30, lineLength: 1, autoLineLength: true }] }),
        // Same id, different family — a coincidence of independent authoring.
        '4': fig({ extraSets: [{ id: 'set-1', kind: 'vertex', contactAngle: 30, lineLength: 1, autoLineLength: true }] }),
        '6': fig({ extraSets: [{ id: 'set-1', kind: 'edge', contactAngle: 30, lineLength: 1, autoLineLength: true }] }),
      }
      const a: Action = {
        type: 'UPDATE_FIGURE_SET',
        payload: { tileTypeId: '3', setId: 'set-1', patch: { contactAngle: 70 } },
      }
      const out = broadcastFigureAction(a, true, IDS, figures)
      expect(out.map(x => (x as typeof a).payload.tileTypeId)).toEqual(['3', '6'])
      const next = apply(out, figures)
      expect(next.figures['3'].extraSets?.[0].contactAngle).toBe(70)
      expect(next.figures['6'].extraSets?.[0].contactAngle).toBe(70)
      expect(next.figures['4'].extraSets?.[0].contactAngle).toBe(30)
    })

    it('skips Tile types with no set of that id rather than inventing one', () => {
      const figures: Record<string, FigureConfig> = {
        '3': fig({ extraSets: [{ id: 'set-1', kind: 'edge', contactAngle: 30, lineLength: 1, autoLineLength: true }] }),
        '4': fig(),
        '6': fig(),
      }
      const a: Action = { type: 'REMOVE_FIGURE_SET', payload: { tileTypeId: '3', setId: 'set-1' } }
      expect(broadcastFigureAction(a, true, IDS, figures)).toHaveLength(1)
    })
  })

  describe('through the reducer', () => {
    it('lands one contact angle on every Tile type', () => {
      const a: Action = { type: 'SET_CONTACT_ANGLE', payload: { tileTypeId: '3', angle: 55 } }
      const next = apply(broadcastFigureAction(a, true, IDS, FIGURES), FIGURES)
      expect(IDS.map(id => next.figures[id].contactAngle)).toEqual([55, 55, 55])
    })

    it('carries a curve control-point edit across', () => {
      const figures = {
        '3': fig({ curve: { enabled: true, points: [{ position: 0.5, offset: 0.2 }] } }),
        '4': fig({ curve: { enabled: true, points: [{ position: 0.5, offset: 0.2 }] } }),
        '6': fig({ curve: { enabled: true, points: [{ position: 0.5, offset: 0.2 }] } }),
      }
      const a: Action = {
        type: 'SET_CURVE_POINT',
        payload: { tileTypeId: '3', index: 0, point: { offset: -0.4 }, target: 'edge' },
      }
      const next = apply(broadcastFigureAction(a, true, IDS, figures), figures)
      expect(IDS.map(id => next.figures[id].curve?.points[0].offset)).toEqual([-0.4, -0.4, -0.4])
    })

    it("respects each Tile's own never-go-dark guard rather than bypassing it", () => {
      // Turning edge lines off with no emitting set forces vertex lines on —
      // the reducer's guard, applied independently per Tile type.
      const a: Action = { type: 'SET_EDGE_LINES_ENABLED', payload: { tileTypeId: '3', enabled: false } }
      const next = apply(broadcastFigureAction(a, true, IDS, FIGURES), FIGURES)
      for (const id of IDS) {
        expect(next.figures[id].edgeLinesEnabled).toBe(false)
        expect(next.figures[id].vertexLinesEnabled).toBe(true)
      }
    })
  })
})
