import type { Polygon } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import { rotate } from '../utils/math'
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
  const r = rotation === 0 ? p : rotate(p, rotation)
  return { x: r.x + translation.x, y: r.y + translation.y }
}

function transformPolygon(poly: Polygon, translation: Vec2, rotation: number): Polygon {
  return {
    ...poly,
    center: transformPoint(poly.center, translation, rotation),
    vertices: poly.vertices.map(v => transformPoint(v, translation, rotation)),
  }
}

/** Rotate a `Vec2` about the origin by `theta` radians. */
function rotateVec(p: Vec2, theta: number): Vec2 {
  if (theta === 0) return p
  const c = Math.cos(theta), s = Math.sin(theta)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/**
 * Patch-level "alternate orientation" angle for a multi-cell **Configuration**.
 *
 * Unlike single-cell alternate (which rotates one Cell's outline + lattice by
 * π/n *in place*), a composite Patch must reorient *rigidly* — every Cell, the
 * lattice basis, and the outlines turn together by one angle about the Patch
 * origin, so the whole tiling reads as a genuinely different orientation
 * instead of each Cell spinning on the spot. The angle is a half-step of the
 * lattice's rotational symmetry, matching single-cell semantics: π/4 for the
 * square lattice (4.8.8) → diamond; π/6 for the hex lattices → flat-top ↔
 * point-up.
 */
export function compositionAlternateAngle(configuration: EditorPatch['configuration']): number {
  switch (configuration) {
    case '4.8.8':
      return Math.PI / 4
    case '3.12.12':
    case '4.6.12':
    case '3.6.3.6':
    case '3.4.6.4':
      return Math.PI / 6
    default:
      return 0
  }
}

/**
 * Effective rigid rotation applied to the whole Patch. Non-zero only for a
 * multi-cell Patch flagged `alternateOrientation`. Single-cell Patches reorient
 * per-Cell via `cell.alternateBoundary` (see `editorBoundaryVertices` +
 * `lattice.ts`), so this returns 0 for them.
 */
export function patchRotation(patch: EditorPatch): number {
  if (patch.cells.length <= 1 || !patch.alternateOrientation) return 0
  return compositionAlternateAngle(patch.configuration)
}

/**
 * The transform that places `cell` into Patch-local coords, including any
 * patch-level rigid rotation. Composing the Patch rotation `θ` with the Cell's
 * own transform: `p' = R(θ)·(R(cell.rotation)·p + cell.center)`, i.e. rotate
 * the Cell's centre by θ and add θ to its rotation. Used by both the geometry
 * pipeline here and the Canvas picker overlays so tiles and overlays stay
 * aligned when the Patch reorients.
 */
export function patchCellTransform(
  patch: EditorPatch,
  cell: { center: Vec2; rotation: number },
): { translation: Vec2; rotation: number } {
  const theta = patchRotation(patch)
  if (theta === 0) return { translation: cell.center, rotation: cell.rotation }
  return { translation: rotateVec(cell.center, theta), rotation: cell.rotation + theta }
}

/**
 * Lattice basis vectors `(u, v)` for a Configuration's translation lattice,
 * rotated by any patch-level alternate orientation so the stamped field tracks
 * the rigidly-rotated unit cell.
 */
export function compositionCellBasis(patch: EditorPatch): { u: Vec2; v: Vec2 } {
  const { u, v } = unrotatedCompositionCellBasis(patch)
  const theta = patchRotation(patch)
  return { u: rotateVec(u, theta), v: rotateVec(v, theta) }
}

function unrotatedCompositionCellBasis(patch: EditorPatch): { u: Vec2; v: Vec2 } {
  const L = patch.edgeLength
  switch (patch.configuration) {
    case '4.8.8': {
      // Truncated square: cell vectors L(1+√2) on both axes (the octagon's
      // width plus one square edge in either direction).
      const period = L * (1 + Math.SQRT2)
      return { u: { x: period, y: 0 }, v: { x: 0, y: period } }
    }
    case '3.12.12': {
      // Truncated hexagonal: hex lattice of dodecagons sharing every other
      // edge, separated by 2·apothem = L(2+√3). Pick two adjacent
      // dodecagon-shared edge directions (angle π/2 and π/6) as the lattice
      // basis. Two triangles per cell fill the interstitial gaps.
      const period = L * (2 + Math.sqrt(3))
      return {
        u: { x: 0, y: period },
        v: { x: (period * Math.sqrt(3)) / 2, y: period / 2 },
      }
    }
    case '4.6.12': {
      // Great rhombitrihexagonal: hex lattice of dodecagons separated by
      // L(3+√3) (the dodecagon-to-nearest-dodecagon distance, equal whether
      // reached via a hex bridge or a sq bridge). Each lattice cell holds
      // 1 dodecagon + 2 hexagons + 3 squares.
      const period = L * (3 + Math.sqrt(3))
      return {
        u: { x: period, y: 0 },
        v: { x: period / 2, y: (period * Math.sqrt(3)) / 2 },
      }
    }
    case '3.6.3.6': {
      // Trihexagonal (Kagome): hex lattice of hexagons separated by 2L
      // (nearest hex-to-hex distance via the triangle bridge). Two triangles
      // per cell fill the interstitial gaps. Basis vectors at angles π/6
      // and π/2 — the hex-neighbour directions of the central hexagon.
      const period = 2 * L
      return {
        u: { x: (period * Math.sqrt(3)) / 2, y: period / 2 },
        v: { x: 0, y: period },
      }
    }
    case '3.4.6.4': {
      // Small rhombitrihexagonal: hex lattice of hexagons separated by
      // L(√3+1) — the hex-to-hex distance via the square bridge. Each lattice
      // cell holds 1 hexagon + 3 squares + 2 triangles.
      const period = L * (Math.sqrt(3) + 1)
      return {
        u: { x: period, y: 0 },
        v: { x: period / 2, y: (period * Math.sqrt(3)) / 2 },
      }
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
    const tx = patchCellTransform(patch, cell)
    const inner = editorTilesToPolygons(cell)
    for (const poly of inner) {
      const transformed = transformPolygon(poly, tx.translation, tx.rotation)
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
    const tx = patchCellTransform(patch, cell)
    // Multi-cell alternate reorients the whole Patch rigidly via `tx`, so the
    // per-Cell π/n flip must NOT also fire here — strip `alternateBoundary`
    // before reading the Cell-local outline.
    const local = editorBoundaryVertices({ ...cell, alternateBoundary: false })
    return local.map(v => transformPoint(v, tx.translation, tx.rotation))
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

/**
 * Multi-cell sibling of `editorNeighbourStamps` — the full visible lattice of
 * unit-cell stamps minus the centre copy (the live Patch). Drives both the
 * "Show neighbours" ghost preview and the Complete-mode clickable vertices in
 * multi-cell Configurations, replacing the fixed `compositionOneRingStamps`.
 * Stamps are pure translations, so the centre copy is simply (0, 0).
 */
export function compositionNeighbourStamps(
  patch: EditorPatch,
  viewport: { x: number; y: number; width: number; height: number },
): LatticeStamp[] {
  return compositionLatticeStamps(patch, viewport).filter(
    s => Math.abs(s.translation.x) > 1e-6 || Math.abs(s.translation.y) > 1e-6,
  )
}
