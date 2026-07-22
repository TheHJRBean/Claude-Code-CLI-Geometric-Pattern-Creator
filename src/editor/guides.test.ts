import { describe, it, expect } from 'vitest'
import type { EditorGuideCircle, EditorGuideLine, EditorPatch } from '../types/editor'
import {
  collectGuideAnchors,
  collectSnapPoints,
  createGuideCircle,
  guideEdgeIntersections,
  type GuideAnchor,
  createGuideLine,
  DEFAULT_CIRCLE_DIVISIONS,
  guideAnchorPoints,
  guideCircleDivisionPoints,
  guideCircleManualPoints,
  guideCircleRadiusPoint,
  guideCircleTickPoints,
  guideIntersections,
  guideLineAngleDeg,
  guideLineSpan,
  guideTickPoints,
  snapAngle,
  snapToPoint,
  withGuideLineAngle,
} from './guides'
import { migrateEditorConfig } from './migrations'
import { patchTickEdgeLength } from './active'

function line(partial: Partial<EditorGuideLine> = {}): EditorGuideLine {
  return {
    id: 'g1',
    kind: 'line',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    stamp: false,
    extend: 'none',
    manualAnchors: [],
    ...partial,
  }
}

/** Single-cell square patch with the default Seed Tile. */
function patch(extra: Partial<EditorPatch> = {}): EditorPatch {
  return {
    cells: [
      {
        id: 'main',
        shape: 'square',
        center: { x: 0, y: 0 },
        rotation: 0,
        boundarySize: 200,
        seedSides: 4,
        tiles: [
          { id: 'seed', kind: 'regular', sides: 4, center: { x: 0, y: 0 }, edgeLength: 100, rotation: 0, source: 'seed' },
        ],
      },
    ],
    activeCellId: 'main',
    edgeLength: 100,
    ...extra,
  }
}

describe('Guides — angle snap', () => {
  it('snaps to the nearest 15° multiple from horizontal', () => {
    // Cursor at ~17° from start → snaps to 15°.
    const cursor = { x: Math.cos(17 * Math.PI / 180) * 100, y: Math.sin(17 * Math.PI / 180) * 100 }
    const snapped = snapAngle({ x: 0, y: 0 }, cursor, 15)
    const angle = Math.atan2(snapped.y, snapped.x) * 180 / Math.PI
    expect(angle).toBeCloseTo(15, 6)
  })

  it('prefers the start-edge reference when closer (continuation comes free)', () => {
    // Edge at 20°; cursor at 21° — 20° (edge continuation) beats 15°/30°.
    const edgeAngle = 20 * Math.PI / 180
    const cursor = { x: Math.cos(21 * Math.PI / 180) * 50, y: Math.sin(21 * Math.PI / 180) * 50 }
    const snapped = snapAngle({ x: 0, y: 0 }, cursor, 15, edgeAngle)
    const angle = Math.atan2(snapped.y, snapped.x) * 180 / Math.PI
    expect(angle).toBeCloseTo(20, 6)
  })

  it('gives the perpendicular of the start edge for free', () => {
    const edgeAngle = 20 * Math.PI / 180
    const cursor = { x: Math.cos(111 * Math.PI / 180) * 50, y: Math.sin(111 * Math.PI / 180) * 50 }
    const snapped = snapAngle({ x: 0, y: 0 }, cursor, 15, edgeAngle)
    const angle = Math.atan2(snapped.y, snapped.x) * 180 / Math.PI
    expect(angle).toBeCloseTo(110, 6) // 20° + 6×15°
  })

  it('returns the cursor unchanged at zero length', () => {
    const p = { x: 0, y: 0 }
    expect(snapAngle(p, p, 15)).toEqual(p)
  })
})

describe('Guides — anchor engine (slice 3)', () => {
  // A CCW unit-ish square, half-extent 50, as Patch-world geometry edges.
  const square: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
    [{ x: -50, y: -50 }, { x: 50, y: -50 }],
    [{ x: 50, y: -50 }, { x: 50, y: 50 }],
    [{ x: 50, y: 50 }, { x: -50, y: 50 }],
    [{ x: -50, y: 50 }, { x: -50, y: -50 }],
  ]

  const near = (anchors: GuideAnchor[], x: number, y: number) =>
    anchors.filter(a => Math.hypot(a.p.x - x, a.p.y - y) < 1e-6)

  it('finds Guide line × edge crossings on both sides of the square', () => {
    const pts = guideEdgeIntersections(line({ start: { x: -100, y: 0 }, end: { x: 100, y: 0 } }), square)
    expect(pts.length).toBe(2)
    const xs = pts.map(p => p.x).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(-50)
    expect(xs[1]).toBeCloseTo(50)
    expect(pts.every(p => Math.abs(p.y) < 1e-9)).toBe(true)
  })

  it("respects the Guide line's extend range", () => {
    // Segment stops short of the square (extend none) → no crossing; extend
    // both reaches the far edges.
    const g = line({ start: { x: -100, y: 0 }, end: { x: -80, y: 0 } })
    expect(guideEdgeIntersections(g, square).length).toBe(0)
    expect(guideEdgeIntersections({ ...g, extend: 'both' }, square).length).toBe(2)
  })

  it('finds Guide circle × edge crossings (2 per edge when the rim cuts it)', () => {
    // radius 60: 50 < 60 < 50√2, so the rim crosses every edge twice → 8 pts.
    expect(guideEdgeIntersections(circle({ radius: 60 }), square).length).toBe(8)
    // radius 40: rim sits inside the square → no crossings.
    expect(guideEdgeIntersections(circle({ radius: 40 }), square).length).toBe(0)
  })

  it('collectGuideAnchors includes Guide×Tile-edge crossings', () => {
    // Horizontal line straight through the Seed square's body.
    const g = line({ id: 'gx', start: { x: -200, y: 0 }, end: { x: 200, y: 0 }, ticksEnabled: true })
    const anchors = collectGuideAnchors(patch({ guides: [g] }), 0)
    // The Seed square (edge 100, rotation 0) is a diamond; the line crosses its
    // two side vertices at (±100/√2·√2 …) — assert there are crossings off the
    // Guide's own endpoints/ticks by checking anchors exist beyond x=±100.
    expect(anchors.some(a => Math.abs(a.p.y) < 1e-6 && Math.abs(a.p.x) > 1e-6 && Math.abs(a.p.x) < 100)).toBe(true)
  })

  it('tags stamp per Decision 2: intersection = AND, and non-stamping downgrades a coincident stamping point', () => {
    const a = line({ id: 'a', start: { x: -100, y: 0 }, end: { x: 100, y: 0 }, stamp: false, ticksEnabled: false })
    const b = line({ id: 'b', start: { x: 30, y: -100 }, end: { x: 30, y: 100 }, stamp: true, ticksEnabled: false })
    const anchors = collectGuideAnchors(patch({ guides: [a, b] }), 0)
    // Crossing at (30, 0): a is world-space ⇒ AND ⇒ false, and it downgrades
    // b's coincident endpoint-tick pass to world-space too.
    const cross = near(anchors, 30, 0)
    expect(cross.length).toBe(1)
    expect(cross[0].stamp).toBe(false)
  })

  it("tags a stamping Guide's own anchors as stamp=true", () => {
    const g = line({ id: 's', start: { x: -300, y: 300 }, end: { x: -200, y: 300 }, stamp: true, ticksEnabled: false })
    const anchors = collectGuideAnchors(patch({ guides: [g] }), 0)
    const end = near(anchors, -200, 300)
    expect(end.length).toBe(1)
    expect(end[0].stamp).toBe(true)
  })
})

describe('Guides — typed angle', () => {
  it('reads the line angle in degrees [0, 360)', () => {
    expect(guideLineAngleDeg(line())).toBeCloseTo(0)
    expect(guideLineAngleDeg(line({ end: { x: 0, y: -100 } }))).toBeCloseTo(270)
  })

  it('withGuideLineAngle rotates about the start preserving length', () => {
    const { end } = withGuideLineAngle(line(), 90)
    expect(end.x).toBeCloseTo(0)
    expect(end.y).toBeCloseTo(100)
  })
})

describe('Guides — extend span', () => {
  const bounds = { minX: -500, minY: -500, maxX: 500, maxY: 500 }

  it("extend 'none' returns the drawn segment", () => {
    expect(guideLineSpan(line(), bounds)).toEqual({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } })
  })

  it("extend 'both' clips the infinite line to the bounds", () => {
    const span = guideLineSpan(line({ extend: 'both' }), bounds)!
    expect(span.a.x).toBeCloseTo(-500)
    expect(span.b.x).toBeCloseTo(500)
    expect(span.a.y).toBeCloseTo(0)
  })

  it("extend 'end' extends forward only", () => {
    const span = guideLineSpan(line({ extend: 'end' }), bounds)!
    expect(span.a).toEqual({ x: 0, y: 0 })
    expect(span.b.x).toBeCloseTo(500)
  })

  it("extend 'start' extends backward only", () => {
    const span = guideLineSpan(line({ extend: 'start' }), bounds)!
    expect(span.a.x).toBeCloseTo(-500)
    expect(span.b).toEqual({ x: 100, y: 0 })
  })
})

describe('Guides — anchors', () => {
  it('ticks march from start at the default (patch edge length) spacing', () => {
    const ticks = guideTickPoints(line({ end: { x: 250, y: 0 } }), 100)
    expect(ticks.map(t => Math.round(t.x))).toEqual([100, 200])
  })

  it('per-guide tickSpacing overrides the default', () => {
    const ticks = guideTickPoints(line({ tickSpacing: 50 }), 100)
    expect(ticks.map(t => Math.round(t.x))).toEqual([50, 100])
  })

  it('ticksEnabled false suppresses ticks', () => {
    expect(guideTickPoints(line({ ticksEnabled: false }), 100)).toEqual([])
  })

  it('anchor points include endpoints, ticks, and manual anchors', () => {
    const g = line({ manualAnchors: [0.25] })
    const pts = guideAnchorPoints(g, 100)
    expect(pts).toContainEqual({ x: 0, y: 0 })
    expect(pts).toContainEqual({ x: 100, y: 0 })
    expect(pts).toContainEqual({ x: 25, y: 0 })
  })

  it('crossing guides intersect; parallel guides do not', () => {
    const a = line()
    const b = line({ id: 'g2', start: { x: 50, y: -50 }, end: { x: 50, y: 50 } })
    const c = line({ id: 'g3', start: { x: 0, y: 10 }, end: { x: 100, y: 10 } })
    const hits = guideIntersections([a, b, c])
    expect(hits).toHaveLength(2) // a×b and b×c; a∥c
    expect(hits[0].x).toBeCloseTo(50)
    expect(hits[0].y).toBeCloseTo(0)
  })

  it('intersections respect extend: segments that stop short miss', () => {
    const a = line() // x ∈ [0, 100] at y=0
    const b = line({ id: 'g2', start: { x: 150, y: -50 }, end: { x: 150, y: 50 } })
    expect(guideIntersections([a, b])).toHaveLength(0)
    // Extending `a` forward reaches the crossing.
    expect(guideIntersections([line({ extend: 'end' }), b])).toHaveLength(1)
  })
})

describe('Guides — snap points', () => {
  it('collects tile vertices, edge midpoints, boundary corners, and guide anchors', () => {
    const p = patch({ guides: [line()] })
    const pts = collectSnapPoints(p, 0)
    expect(pts.some(s => s.kind === 'tile-vertex')).toBe(true)
    expect(pts.some(s => s.kind === 'edge-midpoint' && s.edgeAngle !== undefined)).toBe(true)
    expect(pts.some(s => s.kind === 'boundary-corner')).toBe(true)
    expect(pts.some(s => s.kind === 'guide-anchor')).toBe(true)
  })

  it('snapToPoint returns the nearest candidate within tolerance only', () => {
    const pts = collectSnapPoints(patch(), 0)
    const vertex = pts.find(s => s.kind === 'tile-vertex')!
    const near = { x: vertex.p.x + 3, y: vertex.p.y - 2 }
    expect(snapToPoint(near, pts, 10)?.p).toEqual(vertex.p)
    expect(snapToPoint({ x: 9999, y: 9999 }, pts, 10)).toBeNull()
  })
})

describe('Guides — creation defaults', () => {
  it('createGuideLine defaults: stamp off, no extension, no manual anchors', () => {
    const g = createGuideLine({ x: 0, y: 0 }, { x: 10, y: 10 }, [])
    expect(g.stamp).toBe(false)
    expect(g.extend).toBe('none')
    expect(g.manualAnchors).toEqual([])
    expect(g.kind).toBe('line')
  })
})

function circle(partial: Partial<EditorGuideCircle> = {}): EditorGuideCircle {
  return {
    id: 'c1',
    kind: 'circle',
    center: { x: 0, y: 0 },
    radius: 100,
    stamp: false,
    manualAnchors: [],
    ...partial,
  }
}

describe('Guides — circles', () => {
  it('createGuideCircle: plain circle takes radius + phase from the two clicks, ticks on, no divisions', () => {
    const c = createGuideCircle({ x: 0, y: 0 }, { x: 0, y: 50 }, false, [])
    expect(c.kind).toBe('circle')
    expect(c.radius).toBeCloseTo(50)
    expect(c.phase).toBeCloseTo(Math.PI / 2)
    expect(c.divisions).toBeUndefined()
    expect(c.ticksEnabled).toBe(true)
  })

  it('createGuideCircle: divided circle seeds the default division count and leads with divisions (ticks off)', () => {
    const c = createGuideCircle({ x: 0, y: 0 }, { x: 40, y: 0 }, true, [])
    expect(c.divisions).toBe(DEFAULT_CIRCLE_DIVISIONS)
    expect(c.ticksEnabled).toBe(false)
  })

  it('division points: n divisions → 2n equally-spaced rim points starting at phase', () => {
    const pts = guideCircleDivisionPoints(circle({ divisions: 3, phase: 0 }))
    expect(pts).toHaveLength(6) // 2·3
    expect(pts[0].x).toBeCloseTo(100)
    expect(pts[0].y).toBeCloseTo(0)
    expect(pts[1].x).toBeCloseTo(100 * Math.cos(Math.PI / 3))
    expect(pts[1].y).toBeCloseTo(100 * Math.sin(Math.PI / 3))
  })

  it('division points: none for a plain circle', () => {
    expect(guideCircleDivisionPoints(circle())).toEqual([])
  })

  it('arc ticks: count = round(circumference / spacing), evenly spread', () => {
    // Circumference 2π·100 ≈ 628; spacing 100 → round(6.28) = 6 ticks.
    const ticks = guideCircleTickPoints(circle({ tickSpacing: 100 }), 100)
    expect(ticks).toHaveLength(6)
    // First tick sits on the phase (east) point.
    expect(ticks[0].x).toBeCloseTo(100)
    expect(ticks[0].y).toBeCloseTo(0)
  })

  it('arc ticks: suppressed when disabled or when fewer than two would fit', () => {
    expect(guideCircleTickPoints(circle({ ticksEnabled: false }), 100)).toEqual([])
    expect(guideCircleTickPoints(circle({ radius: 10, tickSpacing: 1000 }), 100)).toEqual([])
  })

  it('radius point sits at phase; manual anchors are angle fractions from phase', () => {
    expect(guideCircleRadiusPoint(circle({ phase: Math.PI / 2 })).y).toBeCloseTo(100)
    const m = guideCircleManualPoints(circle({ phase: 0, manualAnchors: [0.25] }))
    expect(m[0].x).toBeCloseTo(0)
    expect(m[0].y).toBeCloseTo(100) // quarter turn CCW
  })

  it('anchor points include centre, radius handle, divisions and ticks', () => {
    const pts = guideAnchorPoints(circle({ divisions: 2, phase: 0 }), 100)
    expect(pts).toContainEqual({ x: 0, y: 0 }) // centre
    expect(pts.some(p => Math.abs(p.x - 100) < 1e-6 && Math.abs(p.y) < 1e-6)).toBe(true)
  })
})

describe('Guides — circle intersections', () => {
  it('circle × line: a line through the centre crosses at both poles', () => {
    const c = circle() // centre 0,0 r=100
    const l: EditorGuideLine = {
      id: 'l1', kind: 'line', start: { x: -200, y: 0 }, end: { x: 200, y: 0 },
      stamp: false, extend: 'none', manualAnchors: [],
    }
    const hits = guideIntersections([c, l])
    expect(hits).toHaveLength(2)
    expect(hits.map(h => Math.round(h.x)).sort((a, b) => a - b)).toEqual([-100, 100])
  })

  it('circle × line: a segment inside the circle misses; extending it reaches the rim', () => {
    const c = circle() // centre 0,0 r=100
    const short: EditorGuideLine = {
      id: 'l2', kind: 'line', start: { x: 0, y: 0 }, end: { x: 50, y: 0 },
      stamp: false, extend: 'none', manualAnchors: [],
    }
    // Both roots (t = ±2) fall outside the drawn [0, 1] segment.
    expect(guideIntersections([c, short])).toHaveLength(0)
    // Extending forward reaches the +x pole (t = 2).
    const hits = guideIntersections([c, { ...short, extend: 'end' }])
    expect(hits).toHaveLength(1)
    expect(hits[0].x).toBeCloseTo(100)
  })

  it('circle × circle: two overlapping circles meet at two points', () => {
    const a = circle({ id: 'a', center: { x: 0, y: 0 }, radius: 100 })
    const b = circle({ id: 'b', center: { x: 120, y: 0 }, radius: 100 })
    const hits = guideIntersections([a, b])
    expect(hits).toHaveLength(2)
    expect(hits[0].x).toBeCloseTo(60)
    expect(Math.abs(hits[0].y)).toBeCloseTo(80)
  })

  it('circle × circle: disjoint / concentric circles do not meet', () => {
    const a = circle({ id: 'a', radius: 50 })
    const far = circle({ id: 'b', center: { x: 500, y: 0 }, radius: 50 })
    expect(guideIntersections([a, far])).toHaveLength(0)
    const concentric = circle({ id: 'b', radius: 80 })
    expect(guideIntersections([a, concentric])).toHaveLength(0)
  })
})

describe('Guides — tick spacing tracks the Seed-Tile edge, not the lattice constant', () => {
  /** Two-cell Patch whose lattice constant (`edgeLength`) drifts far above the
   *  actual Seed-Tile edge — the multi-cell case where the two diverge. */
  function multiCellPatch(extra: Partial<EditorPatch> = {}): EditorPatch {
    const cell = (id: string, cx: number) => ({
      id,
      shape: 'square' as const,
      center: { x: cx, y: 0 },
      rotation: 0,
      boundarySize: 100,
      seedSides: 4,
      tiles: [
        { id: `${id}-seed`, kind: 'regular' as const, sides: 4, center: { x: cx, y: 0 }, edgeLength: 100, rotation: 0, source: 'seed' as const },
      ],
    })
    return {
      cells: [cell('a', 0), cell('b', 400)],
      activeCellId: 'a',
      edgeLength: 300, // lattice constant, ≠ the 100-unit Seed Tiles
      ...extra,
    }
  }

  it('patchTickEdgeLength returns the Seed-Tile edge in a multi-cell Patch', () => {
    expect(patchTickEdgeLength(multiCellPatch())).toBe(100)
  })

  it('patchTickEdgeLength falls back to patch.edgeLength single-cell', () => {
    // Single-cell: the Seed Tile is created at patch.edgeLength, so they coincide.
    expect(patchTickEdgeLength(patch())).toBe(100)
  })

  it('collectGuideAnchors spaces line ticks by the Seed-Tile edge, not the lattice constant', () => {
    // A horizontal guide the full lattice width. Lattice-constant spacing (300)
    // would emit a single interior tick; Seed-Tile spacing (100) emits three.
    const g = line({ id: 'guide-0', start: { x: 0, y: 0 }, end: { x: 300, y: 0 } })
    const onLine = collectGuideAnchors(multiCellPatch({ guides: [g] }), 0)
      .filter(a => Math.abs(a.p.y) < 1e-6)
      .map(a => Math.round(a.p.x))
      .sort((m, n) => m - n)
    expect(onLine).toContain(100)
    expect(onLine).toContain(200)
    expect(onLine).not.toEqual([0, 300]) // not just the endpoints
  })
})

describe('Guides — migration', () => {
  function v3Patch(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: 3,
      activeCellId: 'main',
      edgeLength: 100,
      cells: [
        {
          id: 'main',
          shape: 'square',
          center: { x: 0, y: 0 },
          rotation: 0,
          boundarySize: 100,
          seedSides: 4,
          tiles: [
            { id: 'seed', kind: 'regular', sides: 4, center: { x: 0, y: 0 }, edgeLength: 100, rotation: 0, source: 'seed' },
          ],
        },
      ],
      ...extra,
    }
  }

  it('a v3 patch with no guides loads with guides undefined', () => {
    const out = migrateEditorConfig(v3Patch())
    expect(out).not.toBeNull()
    expect(out!.guides).toBeUndefined()
  })

  it('round-trips a valid guide line, preserving optionals', () => {
    const g = {
      id: 'guide-0', kind: 'line', start: { x: 0, y: 0 }, end: { x: 50, y: 50 },
      stamp: true, extend: 'both', tickSpacing: 40, ticksEnabled: false, manualAnchors: [0.5],
    }
    const out = migrateEditorConfig(v3Patch({ guides: [g] }))
    expect(out!.guides).toEqual([g])
  })

  it('drops malformed guides but keeps valid siblings', () => {
    const good = { id: 'g1', kind: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, stamp: false, extend: 'none', manualAnchors: [] }
    const bads = [
      { ...good, id: 'b1', kind: 'squiggle' },
      { ...good, id: 'b2', start: { x: 'no' } },
      { ...good, id: 'b3', extend: 'sideways' },
      { ...good, id: '' },
      'not-an-object',
    ]
    const out = migrateEditorConfig(v3Patch({ guides: [good, ...bads] }))
    expect(out!.guides).toEqual([good])
  })

  it('non-boolean stamp coerces to false; bad tickSpacing is stripped', () => {
    const g = { id: 'g1', kind: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, stamp: 'yes', extend: 'none', tickSpacing: -5, manualAnchors: [0.5, 'x', NaN] }
    const out = migrateEditorConfig(v3Patch({ guides: [g] }))
    expect(out!.guides![0].stamp).toBe(false)
    expect(out!.guides![0].tickSpacing).toBeUndefined()
    expect(out!.guides![0].manualAnchors).toEqual([0.5])
  })

  it('an empty guides array drops to undefined', () => {
    const out = migrateEditorConfig(v3Patch({ guides: [] }))
    expect(out!.guides).toBeUndefined()
  })

  it('round-trips a valid circle guide, preserving phase / divisions / tick fields', () => {
    const g = {
      id: 'guide-0', kind: 'circle', center: { x: 10, y: 20 }, radius: 75,
      phase: 1.2, divisions: 6, stamp: true, tickSpacing: 40, ticksEnabled: false, manualAnchors: [0.25],
    }
    const out = migrateEditorConfig(v3Patch({ guides: [g] }))
    expect(out!.guides).toEqual([g])
  })

  it('drops circles with a bad centre or non-positive radius; rounds divisions', () => {
    const bads = [
      { id: 'b1', kind: 'circle', center: { x: 'no' }, radius: 10, stamp: false, manualAnchors: [] },
      { id: 'b2', kind: 'circle', center: { x: 0, y: 0 }, radius: 0, stamp: false, manualAnchors: [] },
      { id: 'b3', kind: 'circle', center: { x: 0, y: 0 }, radius: -5, stamp: false, manualAnchors: [] },
    ]
    const good = { id: 'g', kind: 'circle', center: { x: 0, y: 0 }, radius: 30, divisions: 5.6, stamp: false, manualAnchors: [] }
    const out = migrateEditorConfig(v3Patch({ guides: [...bads, good] }))
    expect(out!.guides).toHaveLength(1)
    const c = out!.guides![0] as EditorGuideCircle
    expect(c.id).toBe('g')
    expect(c.divisions).toBe(6) // rounded
  })
})
