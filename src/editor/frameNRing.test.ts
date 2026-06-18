import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import type { CellShape, EditorCell } from '../types/editor'
import { editorBoundaryVertices } from './buildEditorPolygons'
import { nRingCellStamps, nRingOutline, unionOutline, compositionNRingStamps, compositionNRingOutline } from './frameNRing'
import { compositionBoundaryOutlines } from './compositionLattice'
import {
  createDefault488EditorConfig,
  createDefault31212EditorConfig,
  createDefault4612EditorConfig,
  createDefault3636EditorConfig,
  createDefault3464EditorConfig,
} from './createDefault'

/** Minimal single-cell of the given shape (edge length = `size`). */
function cell(shape: CellShape, size = 100): EditorCell {
  return { id: 'main', shape, center: { x: 0, y: 0 }, rotation: 0, boundarySize: size, seedSides: 4, tiles: [] }
}

function polyArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y
  }
  return Math.abs(a) / 2
}

const baseArea = (shape: CellShape, size = 100) => polyArea(editorBoundaryVertices(cell(shape, size)))

describe('nRingCellStamps', () => {
  it('square uses the box (Chebyshev) ring: (2N+1)^2 cells', () => {
    expect(nRingCellStamps(cell('square'), 0)!.length).toBe(1)
    expect(nRingCellStamps(cell('square'), 1)!.length).toBe(9)
    expect(nRingCellStamps(cell('square'), 2)!.length).toBe(25)
  })

  it('hexagon uses the hex-distance ring: 1 + 3N(N+1) cells', () => {
    expect(nRingCellStamps(cell('hexagon'), 0)!.length).toBe(1)
    expect(nRingCellStamps(cell('hexagon'), 1)!.length).toBe(7)
    expect(nRingCellStamps(cell('hexagon'), 2)!.length).toBe(19)
  })

  it('triangle BFS: centre + 3 edge-neighbours at N=1', () => {
    expect(nRingCellStamps(cell('triangle'), 0)!.length).toBe(1)
    expect(nRingCellStamps(cell('triangle'), 1)!.length).toBe(4)
  })

  it('returns null for shapes without a single-cell lattice', () => {
    expect(nRingCellStamps(cell('octagon'), 1)).toBeNull()
    expect(nRingCellStamps(cell('dodecagon'), 1)).toBeNull()
  })
})

describe('nRingOutline', () => {
  it('N=0 returns the single Cell outline', () => {
    const out = nRingOutline(cell('square'), 0)!
    expect(out).not.toBeNull()
    expect(polyArea(out)).toBeCloseTo(baseArea('square'), 3)
  })

  it('square N=1 is a 3×3 block: 4 corners, area = 9 cells', () => {
    const out = nRingOutline(cell('square', 100), 1)!
    expect(out.length).toBe(4) // collinear edge runs merged
    expect(polyArea(out)).toBeCloseTo(9 * baseArea('square', 100), 3)
    // Axis-aligned square of side 3L spanning [-150, 150].
    const xs = out.map(v => v.x), ys = out.map(v => v.y)
    expect(Math.min(...xs)).toBeCloseTo(-150, 3)
    expect(Math.max(...xs)).toBeCloseTo(150, 3)
    expect(Math.min(...ys)).toBeCloseTo(-150, 3)
    expect(Math.max(...ys)).toBeCloseTo(150, 3)
  })

  it('hexagon N=1 union area = 7 cells', () => {
    const out = nRingOutline(cell('hexagon', 100), 1)!
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(polyArea(out)).toBeCloseTo(7 * baseArea('hexagon', 100), 2)
  })

  it('triangle N=1 union is a side-2L triangle (3 verts, area = 4 cells)', () => {
    const out = nRingOutline(cell('triangle', 100), 1)!
    expect(out.length).toBe(3)
    expect(polyArea(out)).toBeCloseTo(4 * baseArea('triangle', 100), 3)
  })

  it('returns null for unsupported shapes', () => {
    expect(nRingOutline(cell('octagon'), 1)).toBeNull()
  })

  it('rotation preserves area and turns the outline about the origin', () => {
    const plain = nRingOutline(cell('square', 100), 1)!
    const turned = nRingOutline(cell('square', 100), 1, Math.PI / 4)!
    // Clip-only spin about (0,0): same shape (area), just oriented.
    expect(polyArea(turned)).toBeCloseTo(polyArea(plain), 3)
    // A 45°-turned 3×3 square block reaches its corner at 150·√2 on an axis.
    const xs = turned.map(v => v.x)
    expect(Math.max(...xs)).toBeCloseTo(150 * Math.SQRT2, 2)
  })
})

// ── Multi-cell n-ring (every shipping Configuration) ──────────────────────
const hexConfigs = [
  ['3.12.12', createDefault31212EditorConfig],
  ['4.6.12', createDefault4612EditorConfig],
  ['3.6.3.6', createDefault3636EditorConfig],
  ['3.4.6.4', createDefault3464EditorConfig],
] as const

/** Sum of the Patch's per-Cell Boundary-outline areas = one unit-cell area. */
function unitCellArea(patch: ReturnType<typeof createDefault488EditorConfig>): number {
  return compositionBoundaryOutlines(patch).reduce((s, o) => s + polyArea(o), 0)
}

describe('compositionNRingStamps', () => {
  it('4.8.8 (square lattice) uses the Chebyshev box: (2N+1)^2', () => {
    const p = createDefault488EditorConfig()
    expect(compositionNRingStamps(p, 0).length).toBe(1)
    expect(compositionNRingStamps(p, 1).length).toBe(9)
    expect(compositionNRingStamps(p, 2).length).toBe(25)
  })

  it.each(hexConfigs)('%s (hex lattice) uses the hex-distance ring: 1 + 3N(N+1)', (_name, make) => {
    const p = make()
    expect(compositionNRingStamps(p, 0).length).toBe(1)
    expect(compositionNRingStamps(p, 1).length).toBe(7)
    expect(compositionNRingStamps(p, 2).length).toBe(19)
  })
})

describe('compositionNRingOutline', () => {
  const allConfigs = [['4.8.8', createDefault488EditorConfig] as const, ...hexConfigs]

  it.each(allConfigs)('%s N=0 union equals one unit-cell boundary area', (_name, make) => {
    const p = make()
    const out = compositionNRingOutline(p, 0)
    expect(out).not.toBeNull()
    // Cells tile edge-to-edge, so the union has no holes: area = Σ cell areas.
    expect(polyArea(out!) / unitCellArea(p)).toBeCloseTo(1, 4)
  })

  it.each(allConfigs)('%s ring area scales with the cell count', (name, make) => {
    const p = make()
    const square = name === '4.8.8'
    const cellCount = (N: number) => (square ? (2 * N + 1) ** 2 : 1 + 3 * N * (N + 1))
    for (const N of [1, 2]) {
      const out = compositionNRingOutline(p, N)
      expect(out).not.toBeNull()
      expect(polyArea(out!) / unitCellArea(p)).toBeCloseTo(cellCount(N), 3)
    }
  })

  it('rotation preserves area and turns the outline about the origin', () => {
    const p = createDefault488EditorConfig()
    const plain = compositionNRingOutline(p, 1)!
    const turned = compositionNRingOutline(p, 1, Math.PI / 6)!
    expect(polyArea(turned)).toBeCloseTo(polyArea(plain), 2)
  })
})

describe('unionOutline', () => {
  it('cancels the shared edge of two adjacent unit squares', () => {
    // Two unit squares sharing the x=1 edge → a 2×1 rectangle.
    const left: Vec2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const right: Vec2[] = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }]
    const out = unionOutline([left, right])!
    expect(out.length).toBe(4)
    expect(polyArea(out)).toBeCloseTo(2, 6)
  })

  it('returns null for degenerate input', () => {
    expect(unionOutline([])).toBeNull()
  })
})
