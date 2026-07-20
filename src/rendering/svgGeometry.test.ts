import { describe, it, expect } from 'vitest'
import { polygonPath, pointSegmentDist, nearestSegmentIndex } from './svgGeometry'

describe('polygonPath', () => {
  it('returns "" for degenerate (<3-vertex) input', () => {
    expect(polygonPath([])).toBe('')
    expect(polygonPath([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe('')
  })

  it('builds a closed M…L…Z path for a triangle', () => {
    expect(polygonPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]))
      .toBe('M0,0L10,0L0,10Z')
  })
})

describe('pointSegmentDist', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }

  it('is 0 for a point on the segment', () => {
    expect(pointSegmentDist({ x: 5, y: 0 }, a, b)).toBeCloseTo(0, 9)
  })

  it('is the perpendicular distance for a point above the interior', () => {
    expect(pointSegmentDist({ x: 5, y: 3 }, a, b)).toBeCloseTo(3, 9)
  })

  it('clamps past an endpoint to the endpoint distance', () => {
    // x=15 projects beyond b → distance to b = 5
    expect(pointSegmentDist({ x: 15, y: 0 }, a, b)).toBeCloseTo(5, 9)
    // diagonal past a → distance to a
    expect(pointSegmentDist({ x: -3, y: 4 }, a, b)).toBeCloseTo(5, 9)
  })

  it('degenerates a zero-length segment to the distance to its point', () => {
    expect(pointSegmentDist({ x: 3, y: 4 }, a, a)).toBeCloseTo(5, 9)
  })
})

describe('nearestSegmentIndex', () => {
  const segs = [
    { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },   // along y=0
    { from: { x: 0, y: 20 }, to: { x: 10, y: 20 } },  // along y=20
  ]

  it('returns the nearest segment within tolerance', () => {
    expect(nearestSegmentIndex({ x: 5, y: 1 }, segs, 6)).toBe(0)
    expect(nearestSegmentIndex({ x: 5, y: 19 }, segs, 6)).toBe(1)
  })

  it('returns null when nothing is within tolerance', () => {
    expect(nearestSegmentIndex({ x: 5, y: 10 }, segs, 6)).toBeNull() // 10 > 6 from both
  })

  it('returns null for an empty segment list', () => {
    expect(nearestSegmentIndex({ x: 0, y: 0 }, [], 6)).toBeNull()
  })

  it('lowest index wins an exact tie', () => {
    // equidistant (3) from both → index 0
    expect(nearestSegmentIndex({ x: 5, y: 3 }, [segs[0], { from: { x: 0, y: 6 }, to: { x: 10, y: 6 } }], 6)).toBe(0)
  })

  it('a hit carrying a flattened polyline is measured against the polyline, not the chord', () => {
    // Chord along y=0, but the rendered curve bulges to y=10 mid-stroke —
    // the border strand-paint dead-zone regression: clicking the bulge must
    // hit even though the chord is far away.
    const bulged = [{
      from: { x: 0, y: 0 },
      to: { x: 10, y: 0 },
      poly: [{ x: 0, y: 0 }, { x: 3, y: 8 }, { x: 5, y: 10 }, { x: 7, y: 8 }, { x: 10, y: 0 }],
    }]
    // On the bulge: 9 units from the chord (would miss at tol 6), on the polyline.
    expect(nearestSegmentIndex({ x: 5, y: 9 }, bulged, 6)).toBe(0)
    // Between chord and bulge, near neither within a tight tolerance.
    expect(nearestSegmentIndex({ x: 5, y: 5 }, bulged, 2)).toBeNull()
  })
})
