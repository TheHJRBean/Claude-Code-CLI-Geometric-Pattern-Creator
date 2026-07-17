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

  it('SET_MORPH_ENABLED flips the flag without discarding Boundaries', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 100 } })
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: false })
    expect(s.morph!.enabled).toBe(false)
    expect(s.morph!.boundaries).toHaveLength(1)
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    expect(s.morph!.enabled).toBe(true)
    expect(s.morph!.boundaries).toHaveLength(1)
  })

  it('SET_MORPH_MODE / SET_MORPH_ORIGIN no-op when absent, set when present', () => {
    let s = base()
    expect(reducer(s, { type: 'SET_MORPH_MODE', payload: 'radial' })).toBe(s)
    expect(reducer(s, { type: 'SET_MORPH_ORIGIN', payload: { x: 1, y: 2 } })).toBe(s)
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'SET_MORPH_MODE', payload: 'radial' })
    expect(s.morph!.mode).toBe('radial')
    s = reducer(s, { type: 'SET_MORPH_ORIGIN', payload: { x: 10, y: -5 } })
    expect(s.morph!.origin).toEqual({ x: 10, y: -5 })
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

  it('ADD_MORPH_BOUNDARY inserts sorted by position', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 200 } })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 0 } })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 500 } })
    expect(s.morph!.boundaries.map(b => b.position)).toEqual([0, 200, 500])
    // Pre-filled overlay for the Patch's tile type (square, id "4").
    expect(s.morph!.boundaries[0].figures['4'].contactAngle).toBe(s.figures['4'].contactAngle)
  })

  it('SET_MORPH_BOUNDARY_POSITION re-sorts and fails closed on an unknown id', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 0 } })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 400 } })
    const [first, second] = s.morph!.boundaries
    s = reducer(s, { type: 'SET_MORPH_BOUNDARY_POSITION', payload: { boundaryId: first.id, position: 900 } })
    expect(s.morph!.boundaries.map(b => b.id)).toEqual([second.id, first.id])
    const unchanged = reducer(s, { type: 'SET_MORPH_BOUNDARY_POSITION', payload: { boundaryId: 'nope', position: 1 } })
    expect(unchanged).toBe(s)
  })

  it('SET_MORPH_BOUNDARY_ANGLE writes the overlay field for a tileTypeId', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 100 } })
    const id = s.morph!.boundaries[0].id
    s = reducer(s, {
      type: 'SET_MORPH_BOUNDARY_ANGLE',
      payload: { boundaryId: id, tileTypeId: '4', field: 'contactAngle', angle: 42 },
    })
    expect(s.morph!.boundaries[0].figures['4'].contactAngle).toBe(42)
    const unchanged = reducer(s, {
      type: 'SET_MORPH_BOUNDARY_ANGLE',
      payload: { boundaryId: 'nope', tileTypeId: '4', field: 'contactAngle', angle: 1 },
    })
    expect(unchanged).toBe(s)
  })

  it('DELETE_MORPH_BOUNDARY removes by id and no-ops on an unknown id', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 0 } })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 100 } })
    const [first, second] = s.morph!.boundaries
    s = reducer(s, { type: 'DELETE_MORPH_BOUNDARY', payload: { boundaryId: first.id } })
    expect(s.morph!.boundaries.map(b => b.id)).toEqual([second.id])
    const unchanged = reducer(s, { type: 'DELETE_MORPH_BOUNDARY', payload: { boundaryId: 'nope' } })
    expect(unchanged).toBe(s)
  })

  it('REMOVE_MORPH fully clears config.morph', () => {
    let s = base()
    s = reducer(s, { type: 'SET_MORPH_ENABLED', payload: true })
    s = reducer(s, { type: 'ADD_MORPH_BOUNDARY', payload: { position: 0 } })
    s = reducer(s, { type: 'REMOVE_MORPH' })
    expect(s.morph).toBeUndefined()
    const unchanged = reducer(s, { type: 'REMOVE_MORPH' })
    expect(unchanged).toBe(s)
  })
})
