import { beforeEach, describe, expect, it } from 'vitest'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { runPIC } from '../pic/index'
import { generateTiling } from '../tilings/archimedean'
import { TILINGS } from '../tilings/index'
import { resetIds } from '../tilings/shared'
import { DEFAULT_CONFIG } from '../state/defaults'
import { buildStrands } from './buildStrands'
import { computeWeave } from './weave'
import { weaveCapWedgeD, wovenPath, wovenPathD } from './wovenPathD'

beforeEach(() => resetIds())

const seg = (fx: number, fy: number, tx: number, ty: number): Segment => ({
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
  edgeMidpoint: { x: 0, y: 0 },
  polygonCenter: { x: 0, y: 0 },
  polygonId: 'p',
  polygonSides: 4,
  tileTypeId: '4',
  kind: 'star-arm',
})

describe('computeWeave', () => {
  it('assigns opposite roles to two strands crossing at a degree-4 vertex', () => {
    // X through the origin: horizontal + vertical thread, each of 2 segments.
    const strands = buildStrands([
      seg(-1, 0, 0, 0), seg(0, 0, 1, 0),
      seg(0, -1, 0, 0), seg(0, 0, 0, 1),
    ])
    expect(strands).toHaveLength(2)

    const weaves = computeWeave(strands)
    const underCounts = weaves.map(w => w.under.length)
    // Exactly one thread goes under at the single crossing.
    expect(underCounts.sort()).toEqual([0, 1])
    const under = weaves.find(w => w.under.length === 1)!
    // Perpendicular crossing ⇒ no angle widening; at the interior chain point.
    expect(under.under[0].factor).toBeCloseTo(1)
    expect(under.under[0].s).toBe(1)
  })

  it('alternates over/under along a thread with two crossings', () => {
    // One horizontal thread crossed by two vertical threads at x=0 and x=2.
    const strands = buildStrands([
      seg(-1, 0, 0, 0), seg(0, 0, 2, 0), seg(2, 0, 3, 0),
      seg(0, -1, 0, 0), seg(0, 0, 0, 1),
      seg(2, -1, 2, 0), seg(2, 0, 2, 1),
    ])
    expect(strands).toHaveLength(3)
    const weaves = computeWeave(strands)
    const horizontal = strands.findIndex(s => s.points.length === 4)
    // The long thread passes 2 crossings: over at one, under at the other.
    expect(weaves[horizontal].under.length).toBe(1)
    // Each vertical thread takes the opposite role to the horizontal one,
    // so across all three threads exactly 2 of the 4 visits are under.
    const total = weaves.reduce((n, w) => n + w.under.length, 0)
    expect(total).toBe(2)
  })

  it('ignores plain continuations (degree-2 vertices)', () => {
    const strands = buildStrands([seg(-1, 0, 0, 0), seg(0, 0, 1, 1)])
    expect(strands).toHaveLength(1)
    expect(computeWeave(strands)[0].under.length).toBe(0)
  })

  it('detects transversal mid-edge crossings (vertex-strand case)', () => {
    // Two single-segment strands crossing at the origin, mid-edge for both.
    const strands = buildStrands([seg(-1, 0, 1, 0), seg(0, -1, 0, 1)])
    expect(strands).toHaveLength(2)
    const weaves = computeWeave(strands)
    const total = weaves.reduce((n, w) => n + w.under.length, 0)
    expect(total).toBe(1)
    const under = weaves.find(w => w.under.length === 1)!
    expect(under.under[0].s).toBeCloseTo(0.5)
    expect(under.under[0].factor).toBeCloseTo(1)
  })

  it('mixes chain-point and mid-edge crossings in one alternation chain', () => {
    // Horizontal thread with a chain-point crossing at x=0 and a mid-edge
    // crossing at x=2 (the second vertical is a single segment spanning it).
    const strands = buildStrands([
      seg(-1, 0, 0, 0), seg(0, 0, 3, 0),
      seg(0, -1, 0, 0), seg(0, 0, 0, 1),
      seg(2, -1, 2, 1),
    ])
    expect(strands).toHaveLength(3)
    const weaves = computeWeave(strands)
    const horizontal = strands.findIndex(s => s.points.length === 3)
    // 2 crossings on the horizontal thread ⇒ exactly one under (alternation).
    expect(weaves[horizontal].under.length).toBe(1)
    const total = weaves.reduce((n, w) => n + w.under.length, 0)
    expect(total).toBe(2)
  })

  it('skips T-junctions (a thread tip touching another thread)', () => {
    const strands = buildStrands([seg(-1, 0, 1, 0), seg(0, 0, 0, 1)])
    expect(strands).toHaveLength(2)
    const weaves = computeWeave(strands)
    expect(weaves.reduce((n, w) => n + w.under.length, 0)).toBe(0)
  })

  it('dedupes a crossing seen from two adjacent edges of the same thread', () => {
    // Thread A bends at the origin; thread B passes straight through that
    // chain point mid-edge. Both of A's edges intersect B there — one visit.
    const strands = buildStrands([
      seg(-1, 0, 0, 0), seg(0, 0, 1, 1),
      seg(-0.5, -1, 0.5, 1),
    ])
    expect(strands).toHaveLength(2)
    const weaves = computeWeave(strands)
    expect(weaves.reduce((n, w) => n + w.under.length, 0)).toBe(1)
  })

  it('weaves vertex strands with edge strands on a real PIC field', () => {
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      figures: {
        4: {
          type: 'star', contactAngle: 67.5, lineLength: 1.0, autoLineLength: true,
          edgeLinesEnabled: true, vertexLinesEnabled: true,
        },
      },
    }
    const viewport = { x: -200, y: -200, width: 400, height: 400 }
    const polys = generateTiling(TILINGS['square'], viewport, config.tiling.scale)
    const segs = runPIC(polys, config)
    const strands = buildStrands(segs)
    const weaves = computeWeave(strands)

    // Strands made of vertex-line segments must participate in the weave.
    const vertexStrandIdxs = strands
      .map((sd, i) => ({ i, isVertex: sd.segmentIndices.every(si => segs[si].kind === 'vertex-line') }))
      .filter(x => x.isVertex)
      .map(x => x.i)
    expect(vertexStrandIdxs.length).toBeGreaterThan(0)
    const vertexUnders = vertexStrandIdxs.reduce((n, i) => n + weaves[i].under.length, 0)
    expect(vertexUnders).toBeGreaterThan(0)

    // Mid-edge cuts (non-integer s) must exist — the vertex/edge crossings.
    const midEdgeCuts = weaves.flatMap(w => w.under).filter(u => u.s % 1 > 1e-6)
    expect(midEdgeCuts.length).toBeGreaterThan(0)
  })
})

describe('wovenPathD', () => {
  it('cuts a straight strand around a chain-point crossing', () => {
    const d = wovenPathD(
      { points: [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], curves: [null, null] },
      [{ s: 1, half: 0.25 }],
    )
    expect(d).toBe('M-1 0 L-0.25 0 M0.25 0 L1 0')
  })

  it('cuts mid-edge', () => {
    const d = wovenPathD(
      { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], curves: [null] },
      [{ s: 0.5, half: 1 }],
    )
    expect(d).toBe('M0 0 L1 0 M3 0 L4 0')
  })

  it('merges overlapping cuts that swallow a middle edge', () => {
    const d = wovenPathD(
      { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], curves: [null, null, null] },
      [{ s: 1, half: 0.6 }, { s: 2, half: 0.6 }],
    )
    // Middle edge (length 1) is consumed by the merged [0.4, 2.6] interval.
    const nums = d.match(/-?[\d.]+/g)!.map(Number)
    expect(d.replace(/-?[\d.]+/g, '#')).toBe('M# # L# # M# # L# #')
    expect(nums[2]).toBeCloseTo(0.4)
    expect(nums[4]).toBeCloseTo(2.6)
  })

  it('keeps an uncut strand identical to a single continuous path', () => {
    const d = wovenPathD(
      { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }], curves: [null, null] },
      [],
    )
    expect(d).toBe('M0 0 L1 0 L2 1')
  })

  it('reports a cap per gap boundary with outward tangents', () => {
    const cut = { s: 0.5, half: 1, point: { x: 2, y: 0 }, over: { x: 0, y: 1 }, factor: 1 }
    const { caps } = wovenPath(
      { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], curves: [null] },
      [cut],
    )
    expect(caps).toHaveLength(2)
    // End of the first kept piece: stroke stops at x=1, gap lies ahead (+x).
    expect(caps[0].point.x).toBeCloseTo(1)
    expect(caps[0].dir.x).toBeCloseTo(1)
    // Start of the second kept piece: stroke resumes at x=3, gap behind (−x).
    expect(caps[1].point.x).toBeCloseTo(3)
    expect(caps[1].dir.x).toBeCloseTo(-1)
    expect(caps[0].cut).toBe(cut)
    expect(caps[1].cut).toBe(cut)
  })
})

describe('weaveCapWedgeD', () => {
  const w = 2
  const gap = 1 // clearance face at q = w/2 + gap = 2 from the over centreline

  it('builds a square-faced wedge at a perpendicular crossing', () => {
    const cut = { s: 0.5, half: (w + gap) * 1, point: { x: 0, y: 0 }, over: { x: 0, y: 1 }, factor: 1 }
    const d = weaveCapWedgeD(
      [{ point: { x: -3, y: 0 }, dir: { x: 1, y: 0 }, cut }],
      w, gap,
    )
    const nums = d.match(/-?[\d.]+/g)!.map(Number)
    // Quad: back corners at x=-3.5 (stroke overlap), face corners at x=-2.
    expect(nums[0]).toBeCloseTo(-3.5)
    expect(nums[1]).toBeCloseTo(1)
    expect(nums[2]).toBeCloseTo(-3.5)
    expect(nums[3]).toBeCloseTo(-1)
    expect(nums[4]).toBeCloseTo(-2)
    expect(nums[5]).toBeCloseTo(-1)
    expect(nums[6]).toBeCloseTo(-2)
    expect(nums[7]).toBeCloseTo(1)
  })

  it('mitres the face parallel to the over thread at a 45° crossing', () => {
    const s2 = Math.SQRT1_2
    const over = { x: s2, y: s2 }
    const factor = Math.SQRT2 // 1/sin(45°)
    const cut = { s: 0.5, half: (w + gap) * factor, point: { x: 0, y: 0 }, over, factor }
    const E = { x: -(w + gap) * factor, y: 0 }
    const d = weaveCapWedgeD([{ point: E, dir: { x: 1, y: 0 }, cut }], w, gap)
    const nums = d.match(/-?[\d.]+/g)!.map(Number)
    const F = { x: -2 * Math.SQRT2, y: 0 } // q·factor along the centreline
    // Outer corners (last two quad points) must lie on the face line
    // through F parallel to `over` — the angled cut.
    for (const [x, y] of [[nums[4], nums[5]], [nums[6], nums[7]]]) {
      expect((x - F.x) * over.y - (y - F.y) * over.x).toBeCloseTo(0)
    }
    // And the face is genuinely slanted: the two corners extend by
    // different amounts along the under thread.
    expect(Math.abs(nums[4] - nums[6])).toBeGreaterThan(1)
  })
})
