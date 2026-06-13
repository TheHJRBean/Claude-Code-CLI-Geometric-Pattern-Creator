import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { applyCellTransform } from './patchSelectable'

/**
 * Characterization tests for `applyCellTransform` — the canonical Cell-local →
 * Patch-world transform shared by the reducer, patch-selection validation, and
 * (after Chunk-2 dedup) Canvas's overlay positioning.
 *
 * Contract: result = R(patchRot) · ( R(cell.rotation) · p + cell.center ).
 * Equivalently R(cell.rotation + patchRot) · p + R(patchRot) · cell.center.
 * These pin that contract so consumers can rely on it.
 */

const approx = (a: Vec2, b: Vec2, eps = 1e-9) => {
  expect(a.x).toBeCloseTo(b.x, 9)
  expect(a.y).toBeCloseTo(b.y, 9)
  void eps
}

describe('applyCellTransform', () => {
  it('is the identity for a cell at the origin with no rotation', () => {
    approx(applyCellTransform({ x: 3, y: -7 }, { center: { x: 0, y: 0 }, rotation: 0 }), { x: 3, y: -7 })
  })

  it('applies pure translation (cell.center) when unrotated', () => {
    approx(applyCellTransform({ x: 1, y: 0 }, { center: { x: 10, y: 5 }, rotation: 0 }), { x: 11, y: 5 })
  })

  it('rotates the point about the origin by cell.rotation, then translates', () => {
    // rotate (1,0) by +90° → (0,1), then + center (10,0) → (10,1)
    approx(applyCellTransform({ x: 1, y: 0 }, { center: { x: 10, y: 0 }, rotation: Math.PI / 2 }), { x: 10, y: 1 })
  })

  it('applies patchRot about the origin AFTER the cell transform', () => {
    // base = (1,0)+(10,0) = (11,0); rotate about origin by +90° → (0,11)
    approx(applyCellTransform({ x: 1, y: 0 }, { center: { x: 10, y: 0 }, rotation: 0 }, Math.PI / 2), { x: 0, y: 11 })
  })

  it('composes cell rotation and patch rotation correctly', () => {
    // base = rot((1,0),90°)+(2,0) = (0,1)+(2,0) = (2,1); rot about origin 90° → (-1,2)
    approx(applyCellTransform({ x: 1, y: 0 }, { center: { x: 2, y: 0 }, rotation: Math.PI / 2 }, Math.PI / 2), { x: -1, y: 2 })
  })

  it('matches the closed-form R(cell+patch)·p + R(patch)·center for arbitrary inputs', () => {
    const cases = [
      { p: { x: 3.2, y: -1.7 }, cell: { center: { x: 5, y: -2 }, rotation: 0.7 }, patchRot: 0.4 },
      { p: { x: -9, y: 4 }, cell: { center: { x: -3, y: 8 }, rotation: -1.1 }, patchRot: -0.9 },
      { p: { x: 0, y: 0 }, cell: { center: { x: 6, y: 6 }, rotation: 2.0 }, patchRot: 1.3 },
    ]
    for (const { p, cell, patchRot } of cases) {
      const a = cell.rotation + patchRot
      const cp = Math.cos(patchRot), sp = Math.sin(patchRot)
      const expected = {
        x: p.x * Math.cos(a) - p.y * Math.sin(a) + (cell.center.x * cp - cell.center.y * sp),
        y: p.x * Math.sin(a) + p.y * Math.cos(a) + (cell.center.x * sp + cell.center.y * cp),
      }
      approx(applyCellTransform(p, cell, patchRot), expected)
    }
  })

  it('defaults patchRot to 0', () => {
    const cell = { center: { x: 4, y: 9 }, rotation: 0.5 }
    approx(applyCellTransform({ x: 2, y: 1 }, cell), applyCellTransform({ x: 2, y: 1 }, cell, 0))
  })
})
