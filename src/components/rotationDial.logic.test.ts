import { describe, it, expect } from 'vitest'
import { normDeg, pointerAngle, applyDragDelta, wheelStep } from './rotationDial.logic'

describe('normDeg', () => {
  it('passes through values already in range', () => {
    expect(normDeg(0)).toBe(0)
    expect(normDeg(45)).toBe(45)
    expect(normDeg(359.5)).toBe(359.5)
  })
  it('wraps values at/over 360 to [0,360)', () => {
    expect(normDeg(360)).toBe(0)
    expect(normDeg(450)).toBe(90)
    expect(normDeg(720)).toBe(0)
  })
  it('wraps negatives into range', () => {
    expect(normDeg(-90)).toBe(270)
    expect(normDeg(-360)).toBe(0)
    expect(normDeg(-450)).toBe(270)
  })
})

describe('pointerAngle', () => {
  // 0° points up (12 o'clock), increasing clockwise.
  it('reads 0 directly above the centre', () => {
    expect(pointerAngle(100, 100, 100, 0)).toBeCloseTo(0, 6)
  })
  it('reads 90 to the right of the centre', () => {
    expect(pointerAngle(100, 100, 200, 100)).toBeCloseTo(90, 6)
  })
  it('reads 180 directly below the centre', () => {
    expect(pointerAngle(100, 100, 100, 200)).toBeCloseTo(180, 6)
  })
  it('reads 270 to the left of the centre', () => {
    expect(pointerAngle(100, 100, 0, 100)).toBeCloseTo(270, 6)
  })
})

describe('applyDragDelta', () => {
  it('adds the plain delta when no seam is crossed', () => {
    expect(applyDragDelta(10, 40, 100)).toBeCloseTo(130, 6)
    expect(applyDragDelta(40, 10, 100)).toBeCloseTo(70, 6)
  })
  it('takes the short way across the 0/360 seam (clockwise)', () => {
    // 350° → 10° is a +20° move, not −340°.
    expect(applyDragDelta(350, 10, 0)).toBeCloseTo(20, 6)
  })
  it('takes the short way across the seam (counter-clockwise)', () => {
    // 10° → 350° is a −20° move, normalised to 340 from a 0 base.
    expect(applyDragDelta(10, 350, 0)).toBeCloseTo(340, 6)
  })
  it('normalises the result into [0,360)', () => {
    expect(applyDragDelta(0, 0, 400)).toBeCloseTo(40, 6)
    expect(applyDragDelta(0, 0, -30)).toBeCloseTo(330, 6)
  })
  it('exactly-180 delta is treated as forward (not wrapped)', () => {
    expect(applyDragDelta(0, 180, 0)).toBeCloseTo(180, 6)
  })
})

describe('wheelStep', () => {
  it('steps 1° per tick by default, down increments', () => {
    expect(wheelStep(100, 1, {})).toBeCloseTo(101, 6)
    expect(wheelStep(100, -1, {})).toBeCloseTo(99, 6)
  })
  it('fine-steps 0.5° with Shift', () => {
    expect(wheelStep(100, 1, { shiftKey: true })).toBeCloseTo(100.5, 6)
  })
  it('coarse-steps 15° with Ctrl or Meta', () => {
    expect(wheelStep(100, 1, { ctrlKey: true })).toBeCloseTo(115, 6)
    expect(wheelStep(100, -1, { metaKey: true })).toBeCloseTo(85, 6)
  })
  it('Shift wins over Ctrl/Meta', () => {
    expect(wheelStep(100, 1, { shiftKey: true, ctrlKey: true })).toBeCloseTo(100.5, 6)
  })
  it('wraps around the seam', () => {
    expect(wheelStep(359, 1, {})).toBeCloseTo(0, 6)
    expect(wheelStep(0, -1, {})).toBeCloseTo(359, 6)
    expect(wheelStep(5, -1, { ctrlKey: true })).toBeCloseTo(350, 6)
  })
})
