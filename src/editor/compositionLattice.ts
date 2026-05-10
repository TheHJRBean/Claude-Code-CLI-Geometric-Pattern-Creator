import type { Polygon } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import type { BoundaryComposition } from '../types/editor'
import { BOUNDARY_SIDES, editorBoundaryVertices } from './buildEditorPolygons'
import type { LatticeStamp } from './lattice'

/**
 * Geometry helpers for multi-tile boundary configurations (e.g. 4.8.8).
 *
 * The single-shape lattice machinery in `lattice.ts` operates per-patch:
 * each cell contains one transformed copy of the same patch. A composition
 * cell already contains multiple boundary tiles (each with its own authored
 * patch) — `compositionToPolygons` builds the merged unit cell once and the
 * rest of the rendering pipeline just stamps that across the viewport.
 *
 * Today we ship 4.8.8 (truncated square: octagon at the cell origin in
 * flat-top orientation + square at the cell centre rotated π/4 / diamond).
 * Future configurations will expand `cellBasis` and `compositionToPolygons`'s
 * per-tile transforms.
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


/** Cell basis vectors `(u, v)` for a composition's translation lattice. */
export function compositionCellBasis(composition: BoundaryComposition): { u: Vec2; v: Vec2 } {
  const L = composition.edgeLength
  switch (composition.configurationId) {
    case '4.8.8': {
      // Truncated square: cell vectors L(1+√2) on both axes (the octagon's
      // width plus one square edge in either direction).
      const period = L * (1 + Math.SQRT2)
      return { u: { x: period, y: 0 }, v: { x: 0, y: period } }
    }
  }
}

/**
 * Build the unit-cell polygon set for PIC and rendering. v1 produces one
 * polygon per boundary tile — the boundary outline itself, sides matching
 * the tile's shape (octagon → 8, square → 4). Strands emerge from these
 * outlines, which is the canonical 4.8.8 strand pattern: octagon and
 * square share contact angles at their shared edges.
 *
 * The inner patch's `tiles` array (its origin polygon) is intentionally
 * **not** projected into PIC output here — its sole role in v1 is
 * tile-type discovery via `editorTileTypes(patch)` so the strand panel
 * gets one card per shape. Including it would double-stamp polygons
 * (boundary AND a coincident origin) and produce visual artefacts when
 * the user scales the cell with the slider (origin stays at its seeded
 * size; boundary follows the slider).
 */
export function compositionToPolygons(composition: BoundaryComposition): Polygon[] {
  const polys: Polygon[] = []
  for (const boundaryTile of composition.tiles) {
    const sides = BOUNDARY_SIDES[boundaryTile.shape]
    const local = editorBoundaryVertices(boundaryTile.patch)
    const cellLocal = local.map(v => transformPoint(v, boundaryTile.center, boundaryTile.rotation))
    polys.push({
      id: `${boundaryTile.id}/boundary`,
      sides,
      tileTypeId: String(sides),
      center: { x: boundaryTile.center.x, y: boundaryTile.center.y },
      vertices: cellLocal,
    })
  }
  return polys
}

/**
 * One outline polygon per boundary tile in the unit cell, transformed into
 * cell-local coords. Used for rendering the dimmed-ghost outlines of
 * inactive tiles in Design mode and for the lattice-preview boundaries in
 * Strand mode.
 */
export function compositionBoundaryOutlines(composition: BoundaryComposition): Vec2[][] {
  return composition.tiles.map(boundaryTile => {
    const local = editorBoundaryVertices(boundaryTile.patch)
    return local.map(v => transformPoint(v, boundaryTile.center, boundaryTile.rotation))
  })
}

/**
 * Generate enough cell-level stamps to cover `viewport`. The composition's
 * unit cell is treated as one merged patch (per `compositionToPolygons`), so
 * stamps are pure translations along the cell basis — no intra-cell stamps
 * needed (those are baked into `compositionToPolygons`).
 */
export function compositionLatticeStamps(
  composition: BoundaryComposition,
  viewport: { x: number; y: number; width: number; height: number },
): LatticeStamp[] {
  const { u, v } = compositionCellBasis(composition)
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
