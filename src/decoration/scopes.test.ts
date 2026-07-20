import { describe, expect, it } from 'vitest'
import type { ColourRecord } from '../types/editor'
import { buildColourIndex, orbitOffset, parseScopedKey, resolveColour, scopedKey } from './scopes'

describe('scopedKey / parseScopedKey', () => {
  it('round-trips a positioned key', () => {
    const key = scopedKey('ab12cd34', { x: 12.345, y: -7.891 })
    expect(key).toBe('ab12cd34@12.35,-7.89')
    const parsed = parseScopedKey(key)
    expect(parsed).not.toBeNull()
    expect(parsed!.signature).toBe('ab12cd34')
    expect(parsed!.x).toBeCloseTo(12.35)
    expect(parsed!.y).toBeCloseTo(-7.89)
  })

  it('returns null for bare congruent keys', () => {
    expect(parseScopedKey('ab12cd34')).toBeNull()
    expect(parseScopedKey('*')).toBeNull()
  })
})

describe('orbitOffset', () => {
  const stamps = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ]

  it('reduces a centroid to its nearest stamp', () => {
    expect(orbitOffset({ x: 110, y: 5 }, stamps)).toEqual({ x: 10, y: 5 })
    expect(orbitOffset({ x: 3, y: 96 }, stamps)).toEqual({ x: 3, y: -4 })
  })

  it('tie-breaks equidistant stamps deterministically (smallest x, then y)', () => {
    // (50, 0) is equidistant from (0,0) and (100,0) → picks (0,0).
    const a = orbitOffset({ x: 50, y: 0 }, stamps)
    const b = orbitOffset({ x: 50, y: 0 }, [...stamps].reverse())
    expect(a).toEqual({ x: 50, y: 0 })
    expect(b).toEqual(a)
  })

  it('returns the centroid unchanged with no stamps', () => {
    expect(orbitOffset({ x: 7, y: 8 }, [])).toEqual({ x: 7, y: 8 })
  })
})

describe('buildColourIndex / resolveColour', () => {
  const records: ColourRecord[] = [
    { scope: 'congruent', key: '*', colour: '#aaa' },
    { scope: 'congruent', key: 'sigA', colour: '#bbb' },
    { scope: 'patch', key: scopedKey('sigA', { x: 10, y: 20 }), colour: '#ccc' },
    { scope: 'instance', key: scopedKey('sigA', { x: 110, y: 20 }), colour: '#ddd' },
  ]
  const idx = buildColourIndex(records)

  it('indexes records by rung', () => {
    expect(idx.starColour).toEqual({ colour: '#aaa' })
    expect(idx.bySignature.get('sigA')).toEqual({ colour: '#bbb' })
    expect(idx.patch).toHaveLength(1)
    expect(idx.instance).toHaveLength(1)
    expect(idx.hasPositioned).toBe(true)
    expect(idx.hasInstance).toBe(true)
  })

  it('precedence: instance > patch > congruent sig > star', () => {
    // World centroid matches the instance record.
    expect(resolveColour(idx, 'sigA', { x: 10, y: 20 }, { x: 110, y: 20 })).toBe('#ddd')
    // Same orbit, different world copy → patch record.
    expect(resolveColour(idx, 'sigA', { x: 10, y: 20 }, { x: 210, y: 20 })).toBe('#ccc')
    // Same shape, different orbit → congruent record.
    expect(resolveColour(idx, 'sigA', { x: 40, y: 0 }, { x: 340, y: 0 })).toBe('#bbb')
    // Different shape entirely → star fallback.
    expect(resolveColour(idx, 'sigB', { x: 0, y: 0 }, { x: 0, y: 0 })).toBe('#aaa')
  })

  it('instance records never apply without a world position (fragment render)', () => {
    expect(resolveColour(idx, 'sigA', { x: 10, y: 20 }, null)).toBe('#ccc')
  })

  it('tolerates float noise in positioned matches', () => {
    expect(resolveColour(idx, 'sigA', { x: 10.004, y: 19.996 }, null)).toBe('#ccc')
    expect(resolveColour(idx, 'sigA', { x: 10.2, y: 20 }, null)).toBe('#bbb')
  })

  it('later records in the same rung win', () => {
    const idx2 = buildColourIndex([
      ...records,
      { scope: 'patch', key: scopedKey('sigA', { x: 10, y: 20 }), colour: '#eee' },
    ])
    expect(resolveColour(idx2, 'sigA', { x: 10, y: 20 }, null)).toBe('#eee')
  })

  it('empty / undefined records resolve to null', () => {
    const empty = buildColourIndex(undefined)
    expect(resolveColour(empty, 'sigA', { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull()
  })
})
