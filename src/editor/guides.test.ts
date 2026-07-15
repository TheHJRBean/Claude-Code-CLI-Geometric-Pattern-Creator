import { describe, it, expect } from 'vitest'
import type { EditorGuideLine, EditorPatch } from '../types/editor'
import {
  collectSnapPoints,
  createGuideLine,
  guideAnchorPoints,
  guideIntersections,
  guideLineAngleDeg,
  guideLineSpan,
  guideTickPoints,
  snapAngle,
  snapToPoint,
  withGuideLineAngle,
} from './guides'
import { migrateEditorConfig } from './migrations'

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
})
