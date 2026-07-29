import { describe, it, expect } from 'vitest'
import { reducer } from './reducer'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig } from '../editor/createDefault'
import type { PatternConfig } from '../types/pattern'
import { createDefaultMorph } from '../editor/morph'

const base = (): PatternConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  tiling: { type: 'editor', scale: 1 },
  editor: createDefaultEditorConfig(),
})

describe('Morph — reducer actions (slice 2, #38)', () => {
  it('SET_MORPH_ENABLED creates a fresh Morph when absent', () => {
    const s = reducer(base(), { type: 'SET_MORPH_ENABLED', payload: true })
    expect(s.morph).toEqual(createDefaultMorph())
  })

  it('SET_MORPH_ENABLED flips the flag without discarding Origins', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 100 } })
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: false })
    expect(s.morph!.enabled).toBe(false)
    expect(s.morph!.origins).toHaveLength(1)
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    expect(s.morph!.enabled).toBe(true)
    expect(s.morph!.origins).toHaveLength(1)
  })

  it('SET_MORPH_MODE / SET_MORPH_AXIS_ORIGIN no-op when absent, set when present', () => {
    let s = base()
    expect(reducer(s, { type: 'SET_MORPH_MODE', payload: 'radial' })).toBe(s)
    expect(reducer(s, { type: 'SET_MORPH_AXIS_ORIGIN', payload: { x: 1, y: 2 } })).toBe(s)
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'SET_MORPH_MODE', payload: 'radial' })
    expect(s.morph!.mode).toBe('radial')
    s = reducer(s, { type: 'SET_MORPH_AXIS_ORIGIN', payload: { x: 10, y: -5 } })
    expect(s.morph!.axisOrigin).toEqual({ x: 10, y: -5 })
  })

  it('SET_MORPH_DIRECTION normalizes to a unit vector', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'SET_MORPH_DIRECTION', payload: { x: 3, y: 4 } })
    expect(s.morph!.direction).toEqual({ x: 0.6, y: 0.8 })
  })

  it('SET_MORPH_DIRECTION ignores a zero-length vector', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    const before = s
    s = reducer(s, { type: 'SET_MORPH_DIRECTION', payload: { x: 0, y: 0 } })
    expect(s).toBe(before)
  })

  it('ADD_MORPH_ORIGIN inserts sorted by position', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 200 } })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 0 } })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 500 } })
    expect(s.morph!.origins.map(b => b.position)).toEqual([0, 200, 500])
    // Pre-filled overlay for the Patch's tile type (square, id "4").
    expect(s.morph!.origins[0].figures['4'].contactAngle).toBe(s.figures['4'].contactAngle)
  })

  it('SET_MORPH_ORIGIN_POSITION re-sorts and fails closed on an unknown id', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 0 } })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 400 } })
    const [first, second] = s.morph!.origins
    s = reducer(s, { type: 'SET_MORPH_ORIGIN_POSITION', payload: { originId: first.id, position: 900 } })
    expect(s.morph!.origins.map(b => b.id)).toEqual([second.id, first.id])
    const unchanged = reducer(s, { type: 'SET_MORPH_ORIGIN_POSITION', payload: { originId: 'nope', position: 1 } })
    expect(unchanged).toBe(s)
  })

  it('SET_MORPH_ORIGIN_ANGLE writes the overlay field for a tileTypeId', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 100 } })
    const id = s.morph!.origins[0].id
    s = reducer(s, {
      type: 'SET_MORPH_ORIGIN_ANGLE',
      payload: { originId: id, tileTypeId: '4', field: 'contactAngle', angle: 42 },
    })
    expect(s.morph!.origins[0].figures['4'].contactAngle).toBe(42)
    const unchanged = reducer(s, {
      type: 'SET_MORPH_ORIGIN_ANGLE',
      payload: { originId: 'nope', tileTypeId: '4', field: 'contactAngle', angle: 1 },
    })
    expect(unchanged).toBe(s)
  })

  it('ADD_MORPH_ORIGIN seeds a both-sided ramp with a non-zero reach', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 100 } })
    expect(s.morph!.origins[0].sides).toBe('both')
    expect(s.morph!.origins[0].reach).toBeGreaterThan(0)
  })

  it('SET_MORPH_ORIGIN_REACH sets the reach, clamps negatives, fails closed', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 100 } })
    const id = s.morph!.origins[0].id
    s = reducer(s, { type: 'SET_MORPH_ORIGIN_REACH', payload: { originId: id, reach: 850 } })
    expect(s.morph!.origins[0].reach).toBe(850)
    // Negative reach would mirror the ramp and make `sides` a lie.
    s = reducer(s, { type: 'SET_MORPH_ORIGIN_REACH', payload: { originId: id, reach: -20 } })
    expect(s.morph!.origins[0].reach).toBe(0)
    const unchanged = reducer(s, { type: 'SET_MORPH_ORIGIN_REACH', payload: { originId: 'nope', reach: 5 } })
    expect(unchanged).toBe(s)
  })

  it('SET_MORPH_ORIGIN_SIDES sets the side and fails closed on an unknown id', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 100 } })
    const id = s.morph!.origins[0].id
    s = reducer(s, { type: 'SET_MORPH_ORIGIN_SIDES', payload: { originId: id, sides: 'negative' } })
    expect(s.morph!.origins[0].sides).toBe('negative')
    s = reducer(s, { type: 'SET_MORPH_ORIGIN_SIDES', payload: { originId: id, sides: 'positive' } })
    expect(s.morph!.origins[0].sides).toBe('positive')
    const unchanged = reducer(s, { type: 'SET_MORPH_ORIGIN_SIDES', payload: { originId: 'nope', sides: 'both' } })
    expect(unchanged).toBe(s)
  })

  it('reach and sides survive a position change and vice versa', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 100 } })
    const id = s.morph!.origins[0].id
    s = reducer(s, { type: 'SET_MORPH_ORIGIN_REACH', payload: { originId: id, reach: 700 } })
    s = reducer(s, { type: 'SET_MORPH_ORIGIN_SIDES', payload: { originId: id, sides: 'negative' } })
    s = reducer(s, { type: 'SET_MORPH_ORIGIN_POSITION', payload: { originId: id, position: 250 } })
    expect(s.morph!.origins[0]).toMatchObject({ position: 250, reach: 700, sides: 'negative' })
  })

  it('DELETE_MORPH_ORIGIN removes by id and no-ops on an unknown id', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 0 } })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 100 } })
    const [first, second] = s.morph!.origins
    s = reducer(s, { type: 'DELETE_MORPH_ORIGIN', payload: { originId: first.id } })
    expect(s.morph!.origins.map(b => b.id)).toEqual([second.id])
    const unchanged = reducer(s, { type: 'DELETE_MORPH_ORIGIN', payload: { originId: 'nope' } })
    expect(unchanged).toBe(s)
  })

  it('structural Patch swaps drop a stale Morph', () => {
    const withMorph = (): PatternConfig => {
      let s = base()
      s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
      return reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 100 } })
    }
    // Configuration swap seeds a fresh Cell set — Origin overlays keyed by
    // the old Patch's tileTypeIds must not survive.
    let s = reducer(withMorph(), { type: 'SET_BUILDER_CONFIGURATION', payload: '4.8.8' })
    expect(s.morph).toBeUndefined()
    s = reducer(withMorph(), { type: 'SET_BUILDER_CONFIGURATION', payload: null })
    expect(s.morph).toBeUndefined()
    s = reducer(withMorph(), { type: 'EDITOR_NEW' })
    expect(s.morph).toBeUndefined()
    s = reducer(withMorph(), { type: 'EDITOR_CLEAR' })
    expect(s.morph).toBeUndefined()
    // Multi-cell → single-shape exit also discards the authored Cells.
    let m = reducer(withMorph(), { type: 'SET_BUILDER_CONFIGURATION', payload: '4.8.8' })
    m = reducer(m, { type: 'SET_MORPH_ENABLED', payload: true })
    m = reducer(m, { type: 'SET_CELL_SHAPE', payload: 'hexagon' })
    expect(m.morph).toBeUndefined()
    // Single-cell Cell-Boundary-shape change preserves Tiles — Morph survives.
    const single = reducer(withMorph(), { type: 'SET_CELL_SHAPE', payload: 'hexagon' })
    expect(single.morph).toBeDefined()
  })

  it('REMOVE_MORPH fully clears config.morph', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_ORIGIN', payload: { position: 0 } })
    s = reducer(s, { type: 'REMOVE_MORPH' })
    expect(s.morph).toBeUndefined()
    const unchanged = reducer(s, { type: 'REMOVE_MORPH' })
    expect(unchanged).toBe(s)
  })
})
