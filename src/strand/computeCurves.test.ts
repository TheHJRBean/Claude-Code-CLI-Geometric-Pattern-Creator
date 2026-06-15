import { describe, it, expect } from 'vitest'
import { computeCurves, smoothCurves, type CurvedStrand } from './computeCurves'
import type { StrandData } from './buildStrands'
import type { Segment } from '../types/geometry'
import type { CurveConfig, PatternConfig } from '../types/pattern'

// Characterization tests for computeCurves / smoothCurves — the per-edge Bézier
// control-point generator. Only a perf probe touched it before; these pin the
// observable contracts: null when no curve recipe, control-point placement, the
// left/right direction sign flip, degenerate-edge collapse, reversed-traversal
// position mirroring, and smoothCurves' quadratic→cubic upgrade.

function seg(from: Segment['from'], to: Segment['to'], over: Partial<Segment> = {}): Segment {
  return {
    from,
    to,
    edgeMidpoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    // Off to the +x side of the (0,0)→(10,0) edge so the normal-orientation
    // selector is unambiguous (not the degenerate dot≈0 tie), giving a stable
    // baseNormal of (0,1) regardless of traversal direction.
    polygonCenter: { x: 15, y: 0 },
    polygonId: 'p',
    polygonSides: 4,
    tileTypeId: '4',
    kind: 'star-arm',
    side: 'plus',
    ...over,
  }
}

function configWith(curve: CurveConfig | undefined): PatternConfig {
  return {
    figures: { '4': { type: 'star', contactAngle: 60, lineLength: 1, autoLineLength: true, curve } },
    figureRouting: 'auto',
  } as unknown as PatternConfig
}

/** Single straight strand from (0,0)→(10,0), one edge backed by segment 0. */
function oneEdge(points: { x: number; y: number }[]): { sd: StrandData[]; segs: Segment[] } {
  return {
    sd: [{ points, segmentIndices: [0] }],
    segs: [seg({ x: 0, y: 0 }, { x: 10, y: 0 })],
  }
}

const enabledCurve = (over: Partial<CurveConfig> = {}): CurveConfig => ({
  enabled: true,
  points: [{ position: 0.25, offset: 0.2 }],
  ...over,
})

describe('computeCurves — null cases', () => {
  it('emits null when the figure has no curve recipe', () => {
    const { sd, segs } = oneEdge([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    expect(computeCurves(sd, segs, configWith(undefined))[0].curves).toEqual([null])
  })

  it('emits null when the curve is disabled or has no points', () => {
    const { sd, segs } = oneEdge([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    expect(computeCurves(sd, segs, configWith(enabledCurve({ enabled: false })))[0].curves).toEqual([null])
    expect(computeCurves(sd, segs, configWith(enabledCurve({ points: [] })))[0].curves).toEqual([null])
  })

  it('emits null for a degenerate (zero-length) edge', () => {
    const sd: StrandData[] = [{ points: [{ x: 1, y: 1 }, { x: 1, y: 1 }], segmentIndices: [0] }]
    const segs = [seg({ x: 1, y: 1 }, { x: 1, y: 1 })]
    expect(computeCurves(sd, segs, configWith(enabledCurve()))[0].curves).toEqual([null])
  })
})

describe('computeCurves — control points', () => {
  it('places one control point offset from the base point along the segment normal', () => {
    const { sd, segs } = oneEdge([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    const out = computeCurves(sd, segs, configWith(enabledCurve()))
    const cps = out[0].curves[0]!
    expect(cps).toHaveLength(1)
    // position 0.25 along (0,0)->(10,0) → base x=2.5; offset 0.2·edgeLen(10)=2 in ±y.
    expect(cps[0].x).toBeCloseTo(2.5, 6)
    expect(Math.abs(cps[0].y)).toBeCloseTo(2, 6)
  })

  it('direction left vs right mirror the control point about the base point', () => {
    const { sd, segs } = oneEdge([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    const left = computeCurves(sd, segs, configWith(enabledCurve({ direction: 'left' })))[0].curves[0]!
    const right = computeCurves(sd, segs, configWith(enabledCurve({ direction: 'right' })))[0].curves[0]!
    // Midpoint of the two CPs is the base point (mirror symmetry across the segment).
    expect((left[0].x + right[0].x) / 2).toBeCloseTo(2.5, 6)
    expect((left[0].y + right[0].y) / 2).toBeCloseTo(0, 6)
    expect(left[0].y).toBeCloseTo(-right[0].y, 6)
  })

  it('anchors the curve to seg.from regardless of strand traversal direction', () => {
    // position=0 always maps to seg.from, so position 0.25 lands at world x≈2.5
    // (and the same offset side) whether the strand runs forwards or backwards.
    const fwd = computeCurves([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], segmentIndices: [0] }], [seg({ x: 0, y: 0 }, { x: 10, y: 0 })], configWith(enabledCurve()))
    const bwd = computeCurves([{ points: [{ x: 10, y: 0 }, { x: 0, y: 0 }], segmentIndices: [0] }], [seg({ x: 0, y: 0 }, { x: 10, y: 0 })], configWith(enabledCurve()))
    expect(fwd[0].curves[0]![0].x).toBeCloseTo(2.5, 6)
    expect(bwd[0].curves[0]![0].x).toBeCloseTo(2.5, 6)
    expect(fwd[0].curves[0]![0].y).toBeCloseTo(bwd[0].curves[0]![0].y, 6)
  })
})

describe('computeCurves — alternating parity', () => {
  it('flips the offset sign on minus-side segments when alternating is on', () => {
    const { sd } = oneEdge([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    const plus = computeCurves(sd, [seg({ x: 0, y: 0 }, { x: 10, y: 0 }, { side: 'plus' })], configWith(enabledCurve({ alternating: true })))[0].curves[0]!
    const minus = computeCurves(sd, [seg({ x: 0, y: 0 }, { x: 10, y: 0 }, { side: 'minus' })], configWith(enabledCurve({ alternating: true })))[0].curves[0]!
    expect(plus[0].y).toBeCloseTo(-minus[0].y, 6)
  })

  it('does not alternate on triangles (odd cycle) even if configured', () => {
    const { sd } = oneEdge([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    const tri = (s: 'plus' | 'minus') =>
      computeCurves(sd, [seg({ x: 0, y: 0 }, { x: 10, y: 0 }, { side: s, polygonSides: 3 })], configWith(enabledCurve({ alternating: true })))[0].curves[0]!
    // Triangle parity is skipped, so plus and minus produce the same offset.
    expect(tri('plus')[0].y).toBeCloseTo(tri('minus')[0].y, 6)
  })
})

describe('smoothCurves', () => {
  it('returns the input unchanged for fewer than 3 points', () => {
    const strand: CurvedStrand = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], curves: [null] }
    expect(smoothCurves(strand)).toBe(strand)
  })

  it('upgrades a single-control-point (quadratic) edge to two cubic control points at a join', () => {
    const strand: CurvedStrand = {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
      curves: [[{ x: 5, y: 4 }], [{ x: 15, y: 4 }]],
    }
    const out = smoothCurves(strand)
    expect(out.curves[0]).toHaveLength(2)
    expect(out.curves[1]).toHaveLength(2)
    // Input is not mutated.
    expect(strand.curves[0]).toHaveLength(1)
  })
})
