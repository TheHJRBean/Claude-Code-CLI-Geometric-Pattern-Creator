import { describe, it, expect } from 'vitest'
import { runPIC } from './index'
import { regularVertexStrandRange, vertexStrandRange } from './vertexStrandRange'
import type { Polygon } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

function regular(n: number, edgeLength = 100): Polygon {
  const R = edgeLength / (2 * Math.sin(Math.PI / n))
  return {
    id: `r${n}`,
    sides: n,
    center: { x: 0, y: 0 },
    vertices: Array.from({ length: n }, (_, i) => ({
      x: R * Math.cos((2 * Math.PI * i) / n),
      y: R * Math.sin((2 * Math.PI * i) / n),
    })),
    tileTypeId: String(n),
  }
}

function irregular(id: string, vertices: Vec2[]): Polygon {
  return {
    id,
    sides: vertices.length,
    center: {
      x: vertices.reduce((s, v) => s + v.x, 0) / vertices.length,
      y: vertices.reduce((s, v) => s + v.y, 0) / vertices.length,
    },
    vertices,
    tileTypeId: id,
  }
}

/** Vertex strands only — the family whose blackout this module describes. */
function vertexOnly(tileTypeId: string, contactAngle: number): PatternConfig {
  return {
    version: 1,
    tiling: { type: 'editor', scale: 100 },
    figures: {
      [tileTypeId]: {
        type: 'star',
        contactAngle,
        lineLength: 1,
        autoLineLength: true,
        edgeLinesEnabled: false,
        vertexLinesEnabled: true,
      },
    },
    strand: { width: 4, color: '#000', background: '#fff' },
  } as unknown as PatternConfig
}

const emitted = (poly: Polygon, theta: number): number =>
  runPIC([poly], vertexOnly(poly.tileTypeId, theta)).length

describe('vertexStrandRange — regular polygons', () => {
  // 180/n, in closed form. These are the numbers the panel puts in front of
  // the user, so they are worth stating literally rather than deriving twice.
  it.each([
    [3, 60],
    [4, 45],
    [5, 36],
    [6, 30],
    [8, 22.5],
    [12, 15],
  ])('%i-gon needs θ ≥ %f°', (sides, expectedDeg) => {
    const range = regularVertexStrandRange(sides)
    expect(range.anyFrom).toBeCloseTo(expectedDeg, 6)
    expect(range.allFrom).toBeCloseTo(expectedDeg, 6)
    expect(vertexStrandRange(regular(sides).vertices).anyFrom).toBeCloseTo(expectedDeg, 6)
  })

  // The claim that matters: BELOW the threshold the family draws nothing at
  // all. A derivation can be right about the formula and wrong about what the
  // renderer does with it, so this asks `runPIC`.
  it.each([3, 4, 5, 6, 8, 12])('%i-gon emits nothing below its threshold and everything above', sides => {
    const poly = regular(sides)
    const t = regularVertexStrandRange(sides).anyFrom
    expect(emitted(poly, t - 1)).toBe(0)
    expect(emitted(poly, t - 0.5)).toBe(0)
    expect(emitted(poly, t + 1)).toBe(sides * 2)
  })

  // The bound is the angle θ must EXCEED, which is why the panel says "above"
  // and not "≥". Exactly at it the rays lie along the tile's own edges, and
  // what survives the cone test clips to nothing — a triangle keeps a
  // degenerate half-set there, everything else keeps none. Getting this wrong
  // is a one-word copy bug that sends the user to an angle that still draws
  // nothing.
  it.each([3, 4, 5, 6, 8, 12])('%i-gon is not yet complete AT its threshold', sides => {
    const poly = regular(sides)
    const t = regularVertexStrandRange(sides).anyFrom
    expect(emitted(poly, t)).toBeLessThan(sides * 2)
  })
})

describe('vertexStrandRange — irregular Tiles', () => {
  // From the 2026-08-07 bug capture: a 3.12.12 Patch's Complete-fill Tiles.
  // An irregular Tile has a BAND — its widest corner lights up first and its
  // sharpest last — which is why the range carries two numbers.
  const REPORTER_QUAD: Vec2[] = [
    { x: -445.32428163372714, y: -445.324281633727 },
    { x: -240.64294677734367, y: -240.64294677734358 },
    { x: -281.70819200795916, y: -80.90169943749463 },
    { x: -608.3242816337272, y: -162.99999999999977 },
  ]
  const REPORTER_THIN_TRI: Vec2[] = [
    { x: -281.7081920079591, y: 80.90169943749468 },
    { x: -186.60254037844388, y: 49.99999999999996 },
    { x: -136.60254037844388, y: 136.60254037844388 },
  ]

  it('brackets the real emission on a Complete-fill quadrilateral', () => {
    const poly = irregular('quad', REPORTER_QUAD)
    const { anyFrom, allFrom } = vertexStrandRange(REPORTER_QUAD)
    expect(anyFrom).toBeLessThan(allFrom) // an irregular Tile has a band
    expect(emitted(poly, anyFrom - 1)).toBe(0)
    expect(emitted(poly, allFrom + 1)).toBe(REPORTER_QUAD.length * 2)
  })

  it('brackets the real emission on a Complete-fill triangle', () => {
    const poly = irregular('tri', REPORTER_THIN_TRI)
    const { anyFrom, allFrom } = vertexStrandRange(REPORTER_THIN_TRI)
    expect(emitted(poly, anyFrom - 1)).toBe(0)
    expect(emitted(poly, allFrom + 1)).toBe(REPORTER_THIN_TRI.length * 2)
  })

  it('a degenerate outline never reports a drawable range', () => {
    expect(vertexStrandRange([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toEqual({ anyFrom: 90, allFrom: 90 })
  })
})
