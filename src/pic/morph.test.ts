import { describe, it, expect } from 'vitest'
import type { MorphConfig, PatternConfig } from '../types/pattern'
import { activeMorph, morphActive, morphDistance, morphFieldValue, morphValueAt } from './morph'
import { DEFAULT_CONFIG } from '../state/defaults'

const linearMorph = (boundaries: MorphConfig['boundaries'], overrides?: Partial<MorphConfig>): MorphConfig => ({
  enabled: true,
  mode: 'linear',
  origin: { x: 0, y: 0 },
  direction: { x: 1, y: 0 },
  easing: 'linear',
  boundaries,
  ...overrides,
})

const stop = (id: string, position: number, angle?: number): MorphConfig['boundaries'][number] => ({
  id,
  position,
  figures: angle === undefined ? {} : { '4': { contactAngle: angle } },
})

describe('morphActive / activeMorph', () => {
  it('is inactive when morph is absent, disabled, or has no stops', () => {
    expect(morphActive(DEFAULT_CONFIG)).toBe(false)
    const disabled: PatternConfig = { ...DEFAULT_CONFIG, morph: linearMorph([stop('a', 100, 40)], { enabled: false }) }
    expect(morphActive(disabled)).toBe(false)
    const empty: PatternConfig = { ...DEFAULT_CONFIG, morph: linearMorph([]) }
    expect(morphActive(empty)).toBe(false)
  })

  it('is active with an enabled morph carrying at least one stop', () => {
    const config: PatternConfig = { ...DEFAULT_CONFIG, morph: linearMorph([stop('a', 100, 40)]) }
    expect(morphActive(config)).toBe(true)
    expect(activeMorph(config)).toBe(config.morph)
  })
})

describe('morphDistance', () => {
  it('linear: signed dot along direction from origin', () => {
    const m = linearMorph([], { origin: { x: 10, y: 5 }, direction: { x: 0, y: 1 } })
    expect(morphDistance(m, { x: 100, y: 25 })).toBeCloseTo(20)
    expect(morphDistance(m, { x: -3, y: -15 })).toBeCloseTo(-20)
  })

  it('linear: defaults direction to +x when missing', () => {
    const m = linearMorph([], { direction: undefined })
    expect(morphDistance(m, { x: 7, y: 99 })).toBeCloseTo(7)
  })

  it('radial: distance from origin', () => {
    const m = linearMorph([], { mode: 'radial', origin: { x: 3, y: 4 } })
    expect(morphDistance(m, { x: 0, y: 0 })).toBeCloseTo(5)
  })
})

describe('morphFieldValue', () => {
  it('holds the start recipe at/below the Origin and clamps to the last stop beyond the band', () => {
    const m = linearMorph([stop('a', 100, 40), stop('b', 200, 80)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -50)).toBe(67.5) // below implicit Origin stop
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 0)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 50)).toBeCloseTo(53.75) // Origin → first stop blend
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100)).toBe(40)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 200)).toBe(80)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 350)).toBe(80)
  })

  it('a SINGLE stop yields a real gradient from the Origin (implicit start stop)', () => {
    const m = linearMorph([stop('a', 200, 30)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -100)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 0)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100)).toBeCloseTo(48.75)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 200)).toBe(30)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 300)).toBe(30)
  })

  it('an explicit stop exactly at 0 replaces the implicit Origin stop', () => {
    const m = linearMorph([stop('a', 0, 30), stop('b', 100, 60)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -50)).toBe(30)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 50)).toBeCloseTo(45)
  })

  it('a negative-position stop blends back to the start recipe at the Origin', () => {
    const m = linearMorph([stop('a', -200, 20)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -300)).toBe(20)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -100)).toBeCloseTo(43.75)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 0)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100)).toBe(67.5) // implicit stop is last — clamp
  })

  it('blends piecewise-linearly between consecutive stops', () => {
    const m = linearMorph([stop('a', 100, 40), stop('b', 200, 80), stop('c', 300, 50)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 150)).toBeCloseTo(60)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 175)).toBeCloseTo(70)
    // Morph out and back through the intermediate stop.
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 250)).toBeCloseTo(65)
  })

  it('an empty overlay stop is the start recipe (adding a Boundary changes nothing)', () => {
    const m = linearMorph([stop('a', 100), stop('b', 200)])
    for (const d of [0, 100, 150, 200, 300]) {
      expect(morphFieldValue(m, '4', 'contactAngle', 67.5, d)).toBe(67.5)
    }
  })

  it('falls back to the start value per tile type and per field independently', () => {
    const m = linearMorph([
      { id: 'a', position: 0, figures: { '4': { contactAngle: 30 } } },
      { id: 'b', position: 100, figures: { '4': { contactAngle: 60 } } },
    ])
    // Unknown tile type: start value throughout.
    expect(morphFieldValue(m, '6', 'contactAngle', 55, 50)).toBe(55)
    // vertexContactAngle not in the overlay: start value, never contactAngle's.
    expect(morphFieldValue(m, '4', 'vertexContactAngle', 55, 50)).toBe(55)
  })

  it('coincident stops: the later stop wins just past the shared position', () => {
    const m = linearMorph([stop('a', 100, 40), stop('b', 100, 80), stop('c', 200, 20)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 99)).toBeCloseTo(40.275) // Origin→a blend
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100)).toBe(40) // a wins AT its position
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 150)).toBeCloseTo(50) // b→c blend past it
  })
})

describe('morphValueAt', () => {
  it('evaluates through the distance field at a world point', () => {
    const m = linearMorph([stop('a', 0, 40), stop('b', 100, 80)], { mode: 'radial', origin: { x: 0, y: 0 } })
    expect(morphValueAt(m, '4', 'contactAngle', 67.5, { x: 30, y: 40 })).toBeCloseTo(60)
  })
})
