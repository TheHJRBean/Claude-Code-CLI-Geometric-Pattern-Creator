import { describe, it, expect, beforeEach } from 'vitest'
import { generateTapratsTiling, getTapratsTileTypes } from './tapratsTiling'
import { resetIds } from './shared'
import { buildEdgeMap } from './archimedean'

/** Every shipping Taprats tiling key (characterization anchor for the data-
 *  integrity sweep below — TAPRATS_DATA is module-private). */
const ALL_KEYS = [
  'pentagonal-rosette', 'heptagonal-rosette', 'nonagonal-rosette',
  'decagonal-rosette', 'hendecagonal-rosette', 'tetrakis-square',
  'cairo-pentagonal', 'kisrhombille', 'deltoidal-trihexagonal',
  'floret-pentagonal', 'rhombille', 'hexadecagonal-rosette',
] as const

beforeEach(() => resetIds())

const viewport = { x: -200, y: -200, width: 400, height: 400 }
const edgeLen = 50

describe('generateTapratsTiling — pentagonal rosette', () => {
  it('produces polygons', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
  })

  it('produces pentagons and quads', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(5)).toBe(true)
    expect(sides.has(4)).toBe(true)
  })

  it('has shared edges (tiling is connected)', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })

  it('all polygons have unique IDs', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', viewport, edgeLen)
    const ids = new Set(polys.map(p => p.id))
    expect(ids.size).toBe(polys.length)
  })
})

describe('generateTapratsTiling — heptagonal rosette', () => {
  it('produces heptagons and pentagons', () => {
    const polys = generateTapratsTiling('heptagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(7)).toBe(true)
    expect(sides.has(5)).toBe(true)
  })

  it('has shared edges', () => {
    const polys = generateTapratsTiling('heptagonal-rosette', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — nonagonal rosette', () => {
  it('produces nonagons, hexagons, and pentagons', () => {
    const polys = generateTapratsTiling('nonagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(9)).toBe(true)
    expect(sides.has(6)).toBe(true)
    expect(sides.has(5)).toBe(true)
  })
})

describe('generateTapratsTiling — decagonal rosette', () => {
  it('produces decagons', () => {
    const polys = generateTapratsTiling('decagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(10)).toBe(true)
  })
})

describe('generateTapratsTiling — hendecagonal rosette', () => {
  it('produces hendecagons', () => {
    const polys = generateTapratsTiling('hendecagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(11)).toBe(true)
  })
})

describe('generateTapratsTiling — Tetrakis square', () => {
  it('produces triangles', () => {
    const polys = generateTapratsTiling('tetrakis-square', viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
    expect(polys.every(p => p.sides === 3)).toBe(true)
  })

  it('has shared edges', () => {
    const polys = generateTapratsTiling('tetrakis-square', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — Cairo pentagonal', () => {
  it('produces pentagons', () => {
    const polys = generateTapratsTiling('cairo-pentagonal', viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
    expect(polys.every(p => p.sides === 5)).toBe(true)
  })

  it('has shared edges', () => {
    const polys = generateTapratsTiling('cairo-pentagonal', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — kisrhombille', () => {
  it('produces triangles', () => {
    const polys = generateTapratsTiling('kisrhombille', viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
    expect(polys.every(p => p.sides === 3)).toBe(true)
  })

  it('has shared edges', () => {
    const polys = generateTapratsTiling('kisrhombille', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — deltoidal trihexagonal', () => {
  it('produces kites (4-gons)', () => {
    const polys = generateTapratsTiling('deltoidal-trihexagonal', viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
    expect(polys.every(p => p.sides === 4)).toBe(true)
  })

  it('has shared edges', () => {
    const polys = generateTapratsTiling('deltoidal-trihexagonal', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — floret pentagonal', () => {
  it('produces pentagons', () => {
    const polys = generateTapratsTiling('floret-pentagonal', viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
    expect(polys.every(p => p.sides === 5)).toBe(true)
  })

  it('has shared edges', () => {
    const polys = generateTapratsTiling('floret-pentagonal', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — rhombille', () => {
  it('produces rhombi (4-gons)', () => {
    const polys = generateTapratsTiling('rhombille', viewport, edgeLen)
    expect(polys.length).toBeGreaterThan(0)
    expect(polys.every(p => p.sides === 4)).toBe(true)
  })

  it('has shared edges', () => {
    const polys = generateTapratsTiling('rhombille', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — hexadecagonal rosette', () => {
  it('produces 16-gons and 12-gon gaps', () => {
    const polys = generateTapratsTiling('hexadecagonal-rosette', viewport, edgeLen)
    const sides = new Set(polys.map(p => p.sides))
    expect(sides.has(16)).toBe(true)
    expect(sides.has(12)).toBe(true)
  })

  it('has shared edges (tiling is connected)', () => {
    const polys = generateTapratsTiling('hexadecagonal-rosette', viewport, edgeLen)
    const edgeMap = buildEdgeMap(polys)
    let shared = 0
    for (const [, edge] of edgeMap) {
      if (edge.polygonIds.length === 2) shared++
    }
    expect(shared).toBeGreaterThan(0)
  })
})

describe('generateTapratsTiling — unknown key', () => {
  it('returns empty array', () => {
    const polys = generateTapratsTiling('nonexistent', viewport, edgeLen)
    expect(polys).toEqual([])
  })
})

// ── Adversarial / boundary coverage (thermo-nuclear review Chunk 6) ──────────

describe('generateTapratsTiling — degenerate edge length', () => {
  // A non-positive edgeLen zeroes the lattice vectors; without the guard the
  // lattice range is ceil(diag/0)=Infinity and the generation loop never
  // terminates. Each of these would HANG the suite (test timeout) pre-fix.
  it('returns [] for a zero edge length instead of hanging', () => {
    expect(generateTapratsTiling('pentagonal-rosette', viewport, 0)).toEqual([])
  })
  it('returns [] for a negative edge length', () => {
    expect(generateTapratsTiling('kisrhombille', viewport, -50)).toEqual([])
  })
  it('returns [] for a NaN edge length', () => {
    expect(generateTapratsTiling('rhombille', viewport, Number.NaN)).toEqual([])
  })
})

describe('generateTapratsTiling — degenerate viewport', () => {
  it('does not crash on a zero-area viewport', () => {
    const polys = generateTapratsTiling('pentagonal-rosette', { x: 0, y: 0, width: 0, height: 0 }, edgeLen)
    expect(Array.isArray(polys)).toBe(true) // may be empty; must not throw/hang
  })
})

describe('generateTapratsTiling — viewport straddle (AABB-only inclusion)', () => {
  // After deleting the redundant "any vertex inside the viewport" pre-check, a
  // tile that covers a window WITHOUT placing a vertex inside it must still be
  // included by the AABB-overlap test. With ~50-spaced vertices and a 2×2
  // window, essentially every covering tile straddles with no vertex inside —
  // so such a polygon must exist (proves the simplification kept coverage).
  it('includes tiles that straddle a tiny window with no vertex inside it', () => {
    const tiny = { x: -1, y: -1, width: 2, height: 2 }
    const polys = generateTapratsTiling('pentagonal-rosette', tiny, 50)
    expect(polys.length).toBeGreaterThan(0)
    const inWindow = (v: { x: number; y: number }) =>
      v.x >= tiny.x && v.x <= tiny.x + tiny.width && v.y >= tiny.y && v.y <= tiny.y + tiny.height
    expect(polys.some(p => p.vertices.every(v => !inWindow(v)))).toBe(true)
  })
})

describe('generateTapratsTiling — data integrity across all tilings', () => {
  for (const key of ALL_KEYS) {
    it(`${key}: every polygon is well-formed (sides === vertices, all finite)`, () => {
      const polys = generateTapratsTiling(key, viewport, edgeLen)
      expect(polys.length).toBeGreaterThan(0)
      for (const p of polys) {
        expect(p.sides).toBeGreaterThanOrEqual(3)
        expect(p.vertices.length).toBe(p.sides) // catches hand-entered data typos
        for (const v of p.vertices) {
          expect(Number.isFinite(v.x)).toBe(true)
          expect(Number.isFinite(v.y)).toBe(true)
        }
        expect(Number.isFinite(p.center.x)).toBe(true)
        expect(Number.isFinite(p.center.y)).toBe(true)
      }
    })
  }
})

describe('generateTapratsTiling — determinism & polygon cap', () => {
  it('is deterministic: identical inputs yield identical count and IDs', () => {
    const a = generateTapratsTiling('nonagonal-rosette', viewport, edgeLen)
    const b = generateTapratsTiling('nonagonal-rosette', viewport, edgeLen)
    expect(b.length).toBe(a.length)
    expect(b.map(p => p.id)).toEqual(a.map(p => p.id))
  })

  it('never exceeds the MAX_POLYGONS cap on a huge viewport', () => {
    const huge = { x: -5000, y: -5000, width: 10000, height: 10000 }
    const polys = generateTapratsTiling('rhombille', huge, 50)
    expect(polys.length).toBeLessThanOrEqual(4000)
  })
})

describe('getTapratsTileTypes', () => {
  it('returns [] for an unknown key', () => {
    expect(getTapratsTileTypes('nonexistent')).toEqual([])
  })

  it('suffixes duplicate side counts (pentagonal: two quads → 4.1 / 4.2)', () => {
    const ids = getTapratsTileTypes('pentagonal-rosette').map(t => t.id)
    expect(new Set(ids)).toEqual(new Set(['4.1', '5', '4.2']))
  })

  it('honours explicit tileTypeId overrides (decagonal: 6.1 / 6.2 / 6.3)', () => {
    const ids = getTapratsTileTypes('decagonal-rosette').map(t => t.id)
    expect(ids).toContain('10')
    expect(ids).toContain('6.1')
    expect(ids).toContain('6.2')
    expect(ids).toContain('6.3')
  })

  it('returns one entry per distinct tile-type id', () => {
    const types = getTapratsTileTypes('kisrhombille') // two tiles both tileTypeId '3'
    expect(types).toEqual([{ id: '3', sides: 3 }])
  })
})
