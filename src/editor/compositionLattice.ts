import type { Polygon } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import type { EditorPatch } from '../types/editor'
import { editorBoundaryVertices, editorTilesToPolygons } from './buildEditorPolygons'
import type { LatticeStamp } from './lattice'

/**
 * Geometry helpers for multi-cell **Configurations** (e.g. 4.8.8).
 *
 * The single-Cell lattice machinery in `lattice.ts` operates per-Cell: each
 * lattice cell contains one transformed copy of the same Cell. A multi-cell
 * Configuration already contains multiple **Cells** in its Patch —
 * `compositionToPolygons` builds the merged unit cell once (by walking
 * `patch.cells`) and the rest of the rendering pipeline just stamps that
 * across the viewport.
 *
 * Today we ship 4.8.8 (truncated square: octagon Cell at the patch origin in
 * flat-top orientation + square Cell at the lattice-cell centre rotated π/4 /
 * diamond). Future Configurations will expand `cellBasis` and
 * `compositionToPolygons`'s per-Cell transforms.
 */

/** Transform a `Vec2` by a rotation about origin then a translation. */
function transformPoint(p: Vec2, translation: Vec2, rotation: number): Vec2 {
  if (rotation === 0) {
    return { x: p.x + translation.x, y: p.y + translation.y }
  }
  const c = Math.cos(rotation), s = Math.sin(rotation)
  return {
    x: p.x * c - p.y * s + translation.x,
    y: p.x * s + p.y * c + translation.y,
  }
}

function transformPolygon(poly: Polygon, translation: Vec2, rotation: number): Polygon {
  return {
    ...poly,
    center: transformPoint(poly.center, translation, rotation),
    vertices: poly.vertices.map(v => transformPoint(v, translation, rotation)),
  }
}

/** Lattice basis vectors `(u, v)` for a Configuration's translation lattice. */
export function compositionCellBasis(patch: EditorPatch): { u: Vec2; v: Vec2 } {
  const L = patch.edgeLength
  switch (patch.configuration) {
    case '4.8.8': {
      // Truncated square: cell vectors L(1+√2) on both axes (the octagon's
      // width plus one square edge in either direction).
      const period = L * (1 + Math.SQRT2)
      return { u: { x: period, y: 0 }, v: { x: 0, y: period } }
    }
    default:
      // Single-Cell Patches don't have a Configuration; the per-Cell lattice
      // helper handles them. Treat as a square unit so callers don't crash.
      return { u: { x: L, y: 0 }, v: { x: 0, y: L } }
  }
}

/**
 * Build the unit-cell polygon set for PIC and rendering. Walks each Cell in
 * the Patch, projects its Tiles into Patch-local coords via the Cell's
 * `center` + `rotation`, and tags every polygon with `cellId/tileId` so the
 * UI can map a click back to a specific Cell.
 *
 * Single-Cell parity: the polygons returned here are the user's Tiles —
 * **not** the Boundary outline. The Cell-Boundary slider rescales the
 * Boundary outline (visual only, via `compositionBoundaryOutlines`) and the
 * lattice cell vectors (via `compositionLatticeStamps`), but it doesn't
 * touch the Seed Tile, so the polygon the user sees inside each Cell stays
 * at its seeded size — same behaviour as the Seed Tile in single-Cell
 * Patches.
 */
export function compositionToPolygons(patch: EditorPatch): Polygon[] {
  const polys: Polygon[] = []
  for (const cell of patch.cells) {
    const inner = editorTilesToPolygons(cell)
    for (const poly of inner) {
      const transformed = transformPolygon(poly, cell.center, cell.rotation)
      polys.push({ ...transformed, id: `${cell.id}/${poly.id}` })
    }
  }
  return polys
}

/**
 * One outline polygon per Cell in the unit cell, transformed into Patch-local
 * coords. Used for rendering the dimmed-ghost outlines of inactive Cells in
 * Design Phase and for the lattice-preview boundaries in Composition Phase.
 */
export function compositionBoundaryOutlines(patch: EditorPatch): Vec2[][] {
  return patch.cells.map(cell => {
    const local = editorBoundaryVertices(cell)
    return local.map(v => transformPoint(v, cell.center, cell.rotation))
  })
}

/**
 * One ring of lattice-cell neighbour stamps around the source cell (centre
 * stamp excluded). 8 stamps total — orthogonal + diagonal — analogous to
 * single-Cell `editorOneRingNeighbourStamps` for square boundaries. Used by
 * Design-Phase "Show neighbours" preview in multi-cell Configurations so the
 * user can see how the unit cell joins its lattice neighbours.
 *
 * Stamps are pure translations (rotation 0) — the unit cell tiles by
 * translation alone. Future Configurations (e.g. p3, p6m) would override
 * this with the appropriate symmetry-stamp set.
 */
export function compositionOneRingStamps(patch: EditorPatch): LatticeStamp[] {
  const { u, v } = compositionCellBasis(patch)
  const offsets: Array<[number, number]> = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ]
  return offsets.map(([a, b]) => ({
    translation: { x: a * u.x + b * v.x, y: a * u.y + b * v.y },
    rotation: 0,
  }))
}

/**
 * Generate enough lattice-cell stamps to cover `viewport`. The unit cell is
 * treated as one merged Patch (per `compositionToPolygons`), so stamps are
 * pure translations along the lattice basis — no intra-cell stamps needed
 * (those are baked into `compositionToPolygons`).
 */
export function compositionLatticeStamps(
  patch: EditorPatch,
  viewport: { x: number; y: number; width: number; height: number },
): LatticeStamp[] {
  const { u, v } = compositionCellBasis(patch)
  const det = u.x * v.y - u.y * v.x
  if (Math.abs(det) < 1e-9) return [{ translation: { x: 0, y: 0 }, rotation: 0 }]
  const inv = {
    a: v.y / det, b: -v.x / det,
    c: -u.y / det, d: u.x / det,
  }
  const corners: Vec2[] = [
    { x: viewport.x, y: viewport.y },
    { x: viewport.x + viewport.width, y: viewport.y },
    { x: viewport.x, y: viewport.y + viewport.height },
    { x: viewport.x + viewport.width, y: viewport.y + viewport.height },
  ]
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity
  for (const c of corners) {
    const a = inv.a * c.x + inv.b * c.y
    const b = inv.c * c.x + inv.d * c.y
    if (a < aMin) aMin = a
    if (a > aMax) aMax = a
    if (b < bMin) bMin = b
    if (b > bMax) bMax = b
  }
  const a0 = Math.floor(aMin) - 1
  const a1 = Math.ceil(aMax) + 1
  const b0 = Math.floor(bMin) - 1
  const b1 = Math.ceil(bMax) + 1

  const stamps: LatticeStamp[] = []
  for (let a = a0; a <= a1; a++) {
    for (let b = b0; b <= b1; b++) {
      stamps.push({
        translation: { x: a * u.x + b * v.x, y: a * u.y + b * v.y },
        rotation: 0,
      })
    }
  }
  return stamps
}
