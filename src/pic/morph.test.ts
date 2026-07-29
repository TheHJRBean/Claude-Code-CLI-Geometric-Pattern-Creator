import { describe, it, expect } from 'vitest'
import type { MorphConfig, MorphOrigin, MorphSides, PatternConfig } from '../types/pattern'
import { activeMorph, governingOrigin, morphActive, morphDistance, morphFieldValue, morphValueAt, originReach, sideActive } from './morph'
import { DEFAULT_CONFIG } from '../state/defaults'

const linearMorph = (origins: MorphOrigin[], overrides?: Partial<MorphConfig>): MorphConfig => ({
  enabled: true,
  mode: 'linear',
  axisOrigin: { x: 0, y: 0 },
  direction: { x: 1, y: 0 },
  easing: 'linear',
  origins,
  ...overrides,
})

/** An Origin at `position` reaching `reach` toward `sides`, targeting `angle`
 *  on tile type "4". Omitting `angle` leaves an empty overlay (target = base). */
const origin = (
  id: string,
  position: number,
  reach: number,
  angle?: number,
  sides: MorphSides = 'both',
): MorphOrigin => ({
  id,
  position,
  reach,
  sides,
  figures: angle === undefined ? {} : { '4': { contactAngle: angle } },
})

describe('morphActive / activeMorph', () => {
  it('is inactive when morph is absent, disabled, or has no Origins', () => {
    expect(morphActive(DEFAULT_CONFIG)).toBe(false)
    const disabled: PatternConfig = { ...DEFAULT_CONFIG, morph: linearMorph([origin('a', 100, 50, 40)], { enabled: false }) }
    expect(morphActive(disabled)).toBe(false)
    const empty: PatternConfig = { ...DEFAULT_CONFIG, morph: linearMorph([]) }
    expect(morphActive(empty)).toBe(false)
  })

  it('is active with an enabled morph carrying at least one Origin', () => {
    const config: PatternConfig = { ...DEFAULT_CONFIG, morph: linearMorph([origin('a', 100, 50, 40)]) }
    expect(morphActive(config)).toBe(true)
    expect(activeMorph(config)).toBe(config.morph)
  })
})

describe('morphDistance', () => {
  it('linear: signed dot along direction from the axis origin', () => {
    const m = linearMorph([], { axisOrigin: { x: 10, y: 5 }, direction: { x: 0, y: 1 } })
    expect(morphDistance(m, { x: 100, y: 25 })).toBeCloseTo(20)
    expect(morphDistance(m, { x: -3, y: -15 })).toBeCloseTo(-20)
  })

  it('linear: defaults direction to +x when missing', () => {
    const m = linearMorph([], { direction: undefined })
    expect(morphDistance(m, { x: 7, y: 99 })).toBeCloseTo(7)
  })

  it('radial: distance from the centre', () => {
    const m = linearMorph([], { mode: 'radial', axisOrigin: { x: 3, y: 4 } })
    expect(morphDistance(m, { x: 0, y: 0 })).toBeCloseTo(5)
  })
})

describe('sideActive', () => {
  it("'both' faces every offset", () => {
    expect(sideActive('both', -5)).toBe(true)
    expect(sideActive('both', 0)).toBe(true)
    expect(sideActive('both', 5)).toBe(true)
  })

  it('one-sided Origins face their own side, and the line itself either way', () => {
    expect(sideActive('negative', -5)).toBe(true)
    expect(sideActive('negative', 5)).toBe(false)
    expect(sideActive('positive', 5)).toBe(true)
    expect(sideActive('positive', -5)).toBe(false)
    // s === 0 is on the line: base recipe under either, so both accept it.
    expect(sideActive('negative', 0)).toBe(true)
    expect(sideActive('positive', 0)).toBe(true)
  })
})

describe('morphFieldValue — a single Origin', () => {
  it('holds the base recipe AT the Origin and blends out to the target over the reach', () => {
    const m = linearMorph([origin('a', 100, 100, 40)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100)).toBe(67.5) // on the line = base
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 150)).toBeCloseTo(53.75) // halfway out
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 200)).toBe(40) // target reached
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 500)).toBe(40) // clamped beyond
  })

  it("'both' is symmetric about the line", () => {
    const m = linearMorph([origin('a', 0, 100, 30)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -50)).toBeCloseTo(48.75)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 50)).toBeCloseTo(48.75)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -200)).toBe(30)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 200)).toBe(30)
  })

  it("'positive' leaves the negative side at the base recipe entirely", () => {
    const m = linearMorph([origin('a', 0, 100, 30, 'positive')])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -50)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -5000)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 50)).toBeCloseTo(48.75)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 200)).toBe(30)
  })

  it("'negative' mirrors that", () => {
    const m = linearMorph([origin('a', 0, 100, 30, 'negative')])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 50)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -50)).toBeCloseTo(48.75)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, -200)).toBe(30)
  })

  it('a WIDER reach spreads the same change over more distance (the #48 ask)', () => {
    const narrow = linearMorph([origin('a', 0, 100, 30, 'positive')])
    const wide = linearMorph([origin('a', 0, 400, 30, 'positive')])
    // Same endpoints…
    expect(morphFieldValue(narrow, '4', 'contactAngle', 67.5, 0)).toBe(67.5)
    expect(morphFieldValue(wide, '4', 'contactAngle', 67.5, 0)).toBe(67.5)
    // …but at d=100 the narrow one is done while the wide one is a quarter in.
    expect(morphFieldValue(narrow, '4', 'contactAngle', 67.5, 100)).toBe(30)
    expect(morphFieldValue(wide, '4', 'contactAngle', 67.5, 100)).toBeCloseTo(58.125)
    expect(morphFieldValue(wide, '4', 'contactAngle', 67.5, 400)).toBe(30)
  })

  it('zero reach is a hard step: base exactly on the line, target either side', () => {
    const m = linearMorph([origin('a', 100, 0, 40)])
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100.001)).toBe(40)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 99.999)).toBe(40)
  })

  it('an empty overlay is the base recipe everywhere (adding an Origin changes nothing)', () => {
    const m = linearMorph([origin('a', 100, 200)])
    for (const d of [-500, 0, 100, 150, 300, 900]) {
      expect(morphFieldValue(m, '4', 'contactAngle', 67.5, d)).toBe(67.5)
    }
  })

  it('falls back to the base value per tile type and per field independently', () => {
    const m = linearMorph([origin('a', 0, 100, 30)])
    // Unknown tile type: base value throughout.
    expect(morphFieldValue(m, '6', 'contactAngle', 55, 50)).toBe(55)
    // vertexContactAngle not in the overlay: base value, never contactAngle's.
    expect(morphFieldValue(m, '4', 'vertexContactAngle', 55, 50)).toBe(55)
  })
})

describe('morphFieldValue — overlapping Origins (nearest wins)', () => {
  it('hands over at the midpoint between two Origins', () => {
    const m = linearMorph([origin('a', 0, 1000, 30), origin('b', 200, 1000, 80)])
    // Just left of the midpoint 'a' governs (dist 99 of 1000 from base 67.5).
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 99)).toBeCloseTo(63.7875)
    // Just right of it 'b' does (dist 101 toward 80).
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 101)).toBeCloseTo(68.7375)
  })

  it('never compounds — each point is governed by exactly one Origin', () => {
    const m = linearMorph([origin('a', 0, 100, 30), origin('b', 40, 100, 30)])
    // At d=20 (midpoint) 'a' wins on the tie-break; either way the value is a
    // single 20/100 ramp from base, NOT two summed deltas.
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 20)).toBeCloseTo(60)
  })

  it('an inactive side does not shadow a further Origin that really reaches the point', () => {
    // 'a' only morphs LEFT, so the region to its right belongs to 'b' even
    // though 'a' is nearer there.
    const m = linearMorph([origin('a', 0, 100, 30, 'negative'), origin('b', 500, 1000, 80)])
    expect(governingOrigin(m, 50)?.id).toBe('b')
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 50)).toBeCloseTo(73.125)
  })

  it('no Origin facing a point leaves the base recipe untouched', () => {
    const m = linearMorph([origin('a', 0, 100, 30, 'negative')])
    expect(governingOrigin(m, 500)).toBeNull()
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 500)).toBe(67.5)
  })

  it('ties keep the earlier (lower-position) Origin', () => {
    const m = linearMorph([origin('a', 0, 100, 30), origin('b', 100, 100, 80)])
    expect(governingOrigin(m, 50)?.id).toBe('a')
  })

  it('coincident Origins: the first entry governs', () => {
    const m = linearMorph([origin('a', 100, 100, 40), origin('b', 100, 100, 80)])
    expect(governingOrigin(m, 150)?.id).toBe('a')
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 150)).toBeCloseTo(53.75)
  })
})

describe('reach claims territory (#49)', () => {
  it('equal reaches hand over at the midpoint', () => {
    const m = linearMorph([origin('a', 0, 300, 30), origin('b', 400, 300, 80)])
    expect(governingOrigin(m, 199)?.id).toBe('a')
    expect(governingOrigin(m, 201)?.id).toBe('b')
  })

  it('a 3× reach claims 3/4 of the gap', () => {
    const m = linearMorph([origin('a', 0, 900, 30), origin('b', 400, 300, 80)])
    // Handover at gap · rA/(rA+rB) = 400 · 900/1200 = 300.
    expect(governingOrigin(m, 299)?.id).toBe('a')
    expect(governingOrigin(m, 301)?.id).toBe('b')
  })

  it('the handover moves continuously as one reach grows', () => {
    const at = (rA: number) => {
      const m = linearMorph([origin('a', 0, rA, 30), origin('b', 400, 400, 80)])
      let x = 0
      while (x < 400 && governingOrigin(m, x)?.id === 'a') x += 1
      return x
    }
    expect(at(100)).toBeLessThan(at(400))
    expect(at(400)).toBeLessThan(at(1600))
    // Equal reaches ⇒ the midpoint; the scan lands on 201 because the tie at
    // exactly 200 goes to the earlier Origin.
    expect(Math.abs(at(400) - 200)).toBeLessThanOrEqual(1)
  })

  it('a zero-reach Origin claims nothing against a neighbour with reach', () => {
    const m = linearMorph([origin('a', 0, 0, 30), origin('b', 400, 400, 80)])
    expect(governingOrigin(m, 10)?.id).toBe('b')
    // …but a LONE zero-reach Origin still governs (its hard step is the point).
    const solo = linearMorph([origin('a', 0, 0, 30)])
    expect(governingOrigin(solo, 10)?.id).toBe('a')
    expect(morphFieldValue(solo, '4', 'contactAngle', 67.5, 10)).toBe(30)
  })
})

describe('autoReach — meet neighbours halfway (#49)', () => {
  const auto = (o: MorphOrigin): MorphOrigin => ({ ...o, autoReach: true })

  it('resolves to half the gap on each side', () => {
    const os = [auto(origin('a', 0, 999)), auto(origin('b', 400, 999)), auto(origin('c', 1400, 999))]
    expect(originReach(os, 1, -1)).toBe(200)   // gap to 'a' is 400
    expect(originReach(os, 1, 1)).toBe(500)    // gap to 'c' is 1000
  })

  it('falls back to the stored reach where there is no neighbour', () => {
    const os = [auto(origin('a', 0, 250)), auto(origin('b', 400, 250))]
    expect(originReach(os, 0, -1)).toBe(250)   // nothing to the left
    expect(originReach(os, 1, 1)).toBe(250)    // nothing to the right
    expect(originReach(os, 0, 1)).toBe(200)    // meets 'b' halfway
  })

  it('falls back to the stored reach for coincident Origins', () => {
    const os = [auto(origin('a', 100, 250)), auto(origin('b', 100, 250))]
    expect(originReach(os, 0, 1)).toBe(250)
  })

  it('leaves a manual Origin on its stored reach', () => {
    const os = [origin('a', 0, 250), auto(origin('b', 400, 250))]
    expect(originReach(os, 0, 1)).toBe(250)    // manual
    expect(originReach(os, 1, -1)).toBe(200)   // auto
  })

  it('two auto Origins meet exactly at the midpoint, and the ramps just touch', () => {
    const m = linearMorph([auto(origin('a', 0, 999, 30)), auto(origin('b', 400, 999, 30))])
    expect(governingOrigin(m, 199)?.id).toBe('a')
    expect(governingOrigin(m, 201)?.id).toBe('b')
    // Each ramp reaches its target exactly at the midpoint — with equal
    // targets that makes the whole profile continuous: base → 30 → base.
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 0)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 200)).toBeCloseTo(30)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 400)).toBe(67.5)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100)).toBeCloseTo(48.75)
  })

  it('auto tracks a dragged neighbour without any further edit', () => {
    const near = linearMorph([auto(origin('a', 0, 999, 30)), auto(origin('b', 200, 999, 30))])
    const far = linearMorph([auto(origin('a', 0, 999, 30)), auto(origin('b', 800, 999, 30))])
    expect(originReach(near.origins, 0, 1)).toBe(100)
    expect(originReach(far.origins, 0, 1)).toBe(400)
    // Same fraction along the gap ⇒ same value, i.e. the ramp rescaled.
    expect(morphFieldValue(near, '4', 'contactAngle', 67.5, 50))
      .toBeCloseTo(morphFieldValue(far, '4', 'contactAngle', 67.5, 200))
  })

  it('a lone auto Origin is identical to a manual one', () => {
    const manual = linearMorph([origin('a', 100, 300, 30)])
    const automatic = linearMorph([auto(origin('a', 100, 300, 30))])
    for (const d of [-200, 100, 250, 400, 900]) {
      expect(morphFieldValue(automatic, '4', 'contactAngle', 67.5, d))
        .toBe(morphFieldValue(manual, '4', 'contactAngle', 67.5, d))
    }
  })
})

describe('morphValueAt', () => {
  it('evaluates through the distance field at a world point', () => {
    const m = linearMorph([origin('a', 0, 100, 40)], { mode: 'radial', axisOrigin: { x: 0, y: 0 } })
    // |(30,40)| = 50, half of the reach, from base 67.5 toward 40.
    expect(morphValueAt(m, '4', 'contactAngle', 67.5, { x: 30, y: 40 })).toBeCloseTo(53.75)
  })

  it("radial 'inside' morphs toward the centre and leaves the outside alone", () => {
    const m = linearMorph([origin('a', 200, 100, 30, 'negative')], { mode: 'radial' })
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 150)).toBeCloseTo(48.75)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 100)).toBe(30)
    expect(morphFieldValue(m, '4', 'contactAngle', 67.5, 250)).toBe(67.5)
  })
})
