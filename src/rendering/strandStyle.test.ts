import { describe, it, expect } from 'vitest'
import { strandStyleAttrs } from './strandStyle'

describe('strandStyleAttrs', () => {
  it('solid: unmasked, no dash, round cap, half-width cut', () => {
    expect(strandStyleAttrs('solid', 4)).toEqual({
      masked: false, dashArray: undefined, lineCap: 'round', cutWidth: 2, centreWidth: 0.72,
    })
  })

  it('double: masked, half-width cut', () => {
    const a = strandStyleAttrs('double', 4)
    expect(a.masked).toBe(true)
    expect(a.cutWidth).toBe(2)
    expect(a.dashArray).toBeUndefined()
  })

  it('triple: masked, wider cut + a thin centre line', () => {
    const a = strandStyleAttrs('triple', 4)
    expect(a.masked).toBe(true)
    expect(a.cutWidth).toBeCloseTo(2.6, 9) // 4 * 0.65
    expect(a.centreWidth).toBeCloseTo(0.72, 9) // 4 * 0.18
  })

  it('dashed: width-scaled dash with butt caps, unmasked', () => {
    const a = strandStyleAttrs('dashed', 4)
    expect(a.masked).toBe(false)
    expect(a.dashArray).toBe('10 6') // `${4*2.5} ${4*1.5}`
    expect(a.lineCap).toBe('butt')
  })

  it('dotted: round-cap dot pattern', () => {
    const a = strandStyleAttrs('dotted', 5)
    expect(a.dashArray).toBe('0.01 9') // `0.01 ${5*1.8}`
    expect(a.lineCap).toBe('round')
    expect(a.masked).toBe(false)
  })
})
