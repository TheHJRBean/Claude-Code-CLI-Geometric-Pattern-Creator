import { describe, it, expect } from 'vitest'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { DEFAULT_CONFIG } from '../state/defaults'
import { curvesEnabled, flattenStrandsToSegments, flattenSegmentPolylines } from './flatten'
import { buildStrands } from '../strand/buildStrands'

const seg = (fx: number, fy: number, tx: number, ty: number): Segment => ({
  from: { x: fx, y: fy }, to: { x: tx, y: ty },
  edgeMidpoint: { x: (fx + tx) / 2, y: (fy + ty) / 2 },
  polygonCenter: { x: 0, y: 0 }, polygonId: 'p', polygonSides: 4,
  tileTypeId: '4', kind: 'star-arm',
})

const curvedConfig = (offset: number): PatternConfig => ({
  ...DEFAULT_CONFIG,
  figures: {
    '4': { type: 'star', lineLength: 1, autoLineLength: true, contactAngle: 45,
      curve: { enabled: true, points: [{ position: 0.5, offset }] } },
  },
})

describe('Step 19.3 (#5) — curve flattening', () => {
  it('curvesEnabled detects an enabled curve recipe', () => {
    expect(curvesEnabled(curvedConfig(0.25))).toBe(true)
    expect(curvesEnabled(DEFAULT_CONFIG)).toBe(false)
  })

  it('flattens a curved strand into many off-axis chords', () => {
    // One straight strand along y=0; with a curve it bows off the axis.
    const segs = [seg(0, 0, 10, 0), seg(10, 0, 20, 0)]
    const flat = flattenStrandsToSegments(segs, curvedConfig(0.3))
    // Two edges × 8 samples each.
    expect(flat.length).toBe(16)
    // At least one sampled vertex leaves the straight line (curved, not straight).
    const offAxis = flat.some(s => Math.abs(s.to.y) > 0.5)
    expect(offAxis).toBe(true)
  })

  it('a zero-offset (flat) curve stays on the axis', () => {
    const segs = [seg(0, 0, 10, 0), seg(10, 0, 20, 0)]
    const flat = flattenStrandsToSegments(segs, curvedConfig(0))
    expect(flat.every(s => Math.abs(s.to.y) < 1e-6)).toBe(true)
  })
})

describe('flattenSegmentPolylines — per-segment rendered polylines for the strand hit-test', () => {
  it('indexes each curved segment to its own sampled polyline', () => {
    const segs = [seg(0, 0, 10, 0), seg(10, 0, 20, 0)]
    const config = curvedConfig(0.3)
    const polys = flattenSegmentPolylines(segs, buildStrands(segs), config)
    expect(polys.length).toBe(2)
    for (let i = 0; i < segs.length; i++) {
      const p = polys[i]!
      expect(p).not.toBeNull()
      // 8 samples ⇒ 9 points, running endpoint-to-endpoint of THIS segment.
      expect(p.length).toBe(9)
      expect(p[0]).toEqual(segs[i].from)
      expect(p[p.length - 1].x).toBeCloseTo(segs[i].to.x, 9)
      expect(p[p.length - 1].y).toBeCloseTo(segs[i].to.y, 9)
      // The polyline actually bows off the chord (the dead-zone the hit-test
      // must cover).
      expect(Math.max(...p.map(q => Math.abs(q.y)))).toBeGreaterThan(0.5)
    }
  })

  it('returns null for segments that render straight', () => {
    const segs = [seg(0, 0, 10, 0), seg(10, 0, 20, 0)]
    const config = { ...curvedConfig(0.3), figures: { '4': { ...curvedConfig(0.3).figures['4'], curve: { enabled: false, points: [] } } } }
    const polys = flattenSegmentPolylines(segs, buildStrands(segs), config)
    expect(polys).toEqual([null, null])
  })
})
