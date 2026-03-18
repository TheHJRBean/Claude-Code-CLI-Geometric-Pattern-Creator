import { describe, it, expect } from 'vitest'
import {
  add, sub, scale, dot, cross, len, lerp, normalize, rotate, perp,
  midpoint, dist, pointsEqual, clamp, degToRad, radToDeg,
  pointInPolygon, centroid, EPSILON,
} from './math'

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

describe('vector arithmetic', () => {
  it('add', () => {
    const r = add({ x: 1, y: 2 }, { x: 3, y: 4 })
    expect(r).toEqual({ x: 4, y: 6 })
  })

  it('sub', () => {
    const r = sub({ x: 5, y: 7 }, { x: 2, y: 3 })
    expect(r).toEqual({ x: 3, y: 4 })
  })

  it('scale', () => {
    const r = scale({ x: 2, y: -3 }, 4)
    expect(r).toEqual({ x: 8, y: -12 })
  })

  it('dot product', () => {
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0) // perpendicular
    expect(dot({ x: 1, y: 0 }, { x: 1, y: 0 })).toBe(1) // parallel
    expect(dot({ x: 2, y: 3 }, { x: 4, y: 5 })).toBe(23)
  })

  it('cross product (2D signed area)', () => {
    expect(cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1)  // CCW
    expect(cross({ x: 0, y: 1 }, { x: 1, y: 0 })).toBe(-1) // CW
    expect(cross({ x: 1, y: 0 }, { x: 1, y: 0 })).toBe(0)  // parallel
  })

  it('len', () => {
    expect(near(len({ x: 3, y: 4 }), 5)).toBe(true)
    expect(near(len({ x: 0, y: 0 }), 0)).toBe(true)
  })

  it('lerp at 0 and 1', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 20 }
    expect(lerp(a, b, 0)).toEqual(a)
    expect(lerp(a, b, 1)).toEqual(b)
    expect(lerp(a, b, 0.5)).toEqual({ x: 5, y: 10 })
  })
})

describe('normalize', () => {
  it('produces unit vector', () => {
    const v = normalize({ x: 3, y: 4 })
    expect(near(len(v), 1)).toBe(true)
    expect(near(v.x, 0.6)).toBe(true)
    expect(near(v.y, 0.8)).toBe(true)
  })

  it('zero vector falls back to (1,0)', () => {
    const v = normalize({ x: 0, y: 0 })
    expect(v).toEqual({ x: 1, y: 0 })
  })
})

describe('rotate', () => {
  it('90° CCW turns (1,0) → (0,1)', () => {
    const r = rotate({ x: 1, y: 0 }, Math.PI / 2)
    expect(near(r.x, 0)).toBe(true)
    expect(near(r.y, 1)).toBe(true)
  })

  it('180° flips sign', () => {
    const r = rotate({ x: 1, y: 0 }, Math.PI)
    expect(near(r.x, -1)).toBe(true)
    expect(near(r.y, 0)).toBe(true)
  })

  it('360° returns to original', () => {
    const v = { x: 3, y: 4 }
    const r = rotate(v, 2 * Math.PI)
    expect(near(r.x, v.x)).toBe(true)
    expect(near(r.y, v.y)).toBe(true)
  })
})

describe('perp (left-hand CCW perpendicular)', () => {
  it('rotates (1,0) → (0,1) which is 90° CCW', () => {
    const p = perp({ x: 1, y: 0 })
    expect(near(p.x, 0)).toBe(true)
    expect(near(p.y, 1)).toBe(true)
  })

  it('perpendicular is orthogonal to original', () => {
    const v = { x: 3, y: 4 }
    expect(near(dot(v, perp(v)), 0)).toBe(true)
  })

  it('perp(v) equals rotate(v, PI/2)', () => {
    const v = { x: 2, y: -5 }
    const p = perp(v)
    const r = rotate(v, Math.PI / 2)
    expect(near(p.x, r.x)).toBe(true)
    expect(near(p.y, r.y)).toBe(true)
  })
})

describe('midpoint', () => {
  it('midpoint of two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 4, y: 6 })).toEqual({ x: 2, y: 3 })
  })
})

describe('dist', () => {
  it('distance between two points', () => {
    expect(near(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5)).toBe(true)
  })
})

describe('pointsEqual', () => {
  it('identical points', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true)
  })
  it('points within epsilon', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 1 + EPSILON / 2, y: 2 })).toBe(true)
  })
  it('points beyond epsilon', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 1 + 0.001, y: 2 })).toBe(false)
  })
})

describe('clamp', () => {
  it('within range unchanged', () => expect(clamp(5, 0, 10)).toBe(5))
  it('below min → min', () => expect(clamp(-5, 0, 10)).toBe(0))
  it('above max → max', () => expect(clamp(15, 0, 10)).toBe(10))
})

describe('angle conversion', () => {
  it('90° → PI/2', () => expect(near(degToRad(90), Math.PI / 2)).toBe(true))
  it('PI/2 → 90°', () => expect(near(radToDeg(Math.PI / 2), 90)).toBe(true))
  it('round-trip', () => expect(near(degToRad(radToDeg(1.234)), 1.234)).toBe(true))
})

describe('pointInPolygon', () => {
  // Axis-aligned square with corners at (0,0),(4,0),(4,4),(0,4)
  const square = [
    { x: 0, y: 0 }, { x: 4, y: 0 },
    { x: 4, y: 4 }, { x: 0, y: 4 },
  ]

  it('centre is inside', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true)
  })

  it('far outside is not inside', () => {
    expect(pointInPolygon({ x: 10, y: 10 }, square)).toBe(false)
  })

  it('near corner but outside', () => {
    expect(pointInPolygon({ x: -0.1, y: 2 }, square)).toBe(false)
  })

  it('works for a regular triangle', () => {
    const tri = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 },
    ]
    expect(pointInPolygon({ x: 5, y: 3 }, tri)).toBe(true)
    expect(pointInPolygon({ x: 1, y: 9 }, tri)).toBe(false)
  })
})

describe('centroid', () => {
  it('centroid of a square', () => {
    const sq = [
      { x: 0, y: 0 }, { x: 4, y: 0 },
      { x: 4, y: 4 }, { x: 0, y: 4 },
    ]
    const c = centroid(sq)
    expect(near(c.x, 2)).toBe(true)
    expect(near(c.y, 2)).toBe(true)
  })
})
