import { describe, it, expect } from 'vitest'
import { rayRayIntersect } from './intersect'

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

describe('rayRayIntersect', () => {
  it('two perpendicular rays crossing at origin', () => {
    const result = rayRayIntersect(
      { x: -1, y: 0 }, { x: 1, y: 0 },  // ray 1: leftward from (-1,0)
      { x: 0, y: -1 }, { x: 0, y: 1 },  // ray 2: upward from (0,-1)
    )
    expect(result).not.toBeNull()
    expect(near(result!.point.x, 0)).toBe(true)
    expect(near(result!.point.y, 0)).toBe(true)
    expect(near(result!.t1, 1)).toBe(true)
    expect(near(result!.t2, 1)).toBe(true)
  })

  it('parallel rays return null', () => {
    const result = rayRayIntersect(
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 0 },
    )
    expect(result).toBeNull()
  })

  it('anti-parallel (opposite direction) rays return null', () => {
    const result = rayRayIntersect(
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 0 }, { x: -1, y: 0 },
    )
    expect(result).toBeNull()
  })

  it('rays that intersect behind both origins give negative t values', () => {
    // ray 1 goes right from (5,0), ray 2 goes up from (0,5)
    // They would intersect at (0,0) — behind both
    const result = rayRayIntersect(
      { x: 5, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 5 }, { x: 0, y: 1 },
    )
    expect(result).not.toBeNull()
    expect(result!.t1).toBeLessThan(0)
    expect(result!.t2).toBeLessThan(0)
  })

  it('diagonal crossing', () => {
    // ray 1: from (0,0) going in direction (1,1)
    // ray 2: from (2,0) going in direction (-1,1)
    // They should meet at (1,1)
    const result = rayRayIntersect(
      { x: 0, y: 0 }, { x: 1, y: 1 },
      { x: 2, y: 0 }, { x: -1, y: 1 },
    )
    expect(result).not.toBeNull()
    expect(near(result!.point.x, 1)).toBe(true)
    expect(near(result!.point.y, 1)).toBe(true)
    expect(result!.t1).toBeGreaterThan(0)
    expect(result!.t2).toBeGreaterThan(0)
  })

  it('intersection point is consistent between both parameterisations', () => {
    const o1 = { x: 1, y: 2 }
    const d1 = { x: 3, y: 1 }
    const o2 = { x: 4, y: 0 }
    const d2 = { x: -1, y: 2 }
    const result = rayRayIntersect(o1, d1, o2, d2)
    expect(result).not.toBeNull()
    // o1 + t1*d1 should equal o2 + t2*d2
    const p1 = { x: o1.x + result!.t1 * d1.x, y: o1.y + result!.t1 * d1.y }
    const p2 = { x: o2.x + result!.t2 * d2.x, y: o2.y + result!.t2 * d2.y }
    expect(near(p1.x, p2.x, 1e-9)).toBe(true)
    expect(near(p1.y, p2.y, 1e-9)).toBe(true)
  })
})
