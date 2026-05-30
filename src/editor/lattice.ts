import type { Vec2 } from '../utils/math'
import type { CellShape, EditorCell } from '../types/editor'
import { editorBoundaryVertices } from './buildEditorPolygons'
import type { BoundaryVertex } from './boundary'

/**
 * Step 17.6 — Composition-Phase lattice preview.
 *
 * Stamp the Cell across the viewport on the Boundary's translation lattice
 * so the user can see how Strands flow across boundaries (Decision 17).
 *
 * Lattice bases (centred on the Boundary centre = Cell origin):
 *   - Square (edge L): u = (L, 0), v = (0, L). One orientation per stamp.
 *   - Hexagon (edge L): u = (√3·L, 0), v = (√3·L/2, 1.5·L). One orientation
 *     per stamp (point-up hexes tile under the same rotation).
 *   - Triangle (edge L): equilateral triangles need a 2-orientation lattice
 *     (up + 180°-rotated down) — exposed via `intraStamps`.
 *   - Octagon: doesn't tile by translation alone; handled by the multi-cell
 *     **Configuration** path (`compositionLatticeStamps`).
 */
export interface LatticeStamp {
  /** Translation applied to every Cell tile in this stamp. */
  translation: Vec2
  /** Rotation applied (about the Cell centre) before translation. 0 in v1. */
  rotation: number
}

/** Cell's lattice basis vectors. `null` for shapes without a v1 lattice. */
function latticeBasis(cell: EditorCell): { u: Vec2; v: Vec2 } | null {
  const L = cell.boundarySize
  let basis: { u: Vec2; v: Vec2 }
  switch (cell.shape) {
    case 'square':
      basis = { u: { x: L, y: 0 }, v: { x: 0, y: L } }
      break
    case 'hexagon': {
      const s = Math.sqrt(3) * L
      basis = { u: { x: s, y: 0 }, v: { x: s / 2, y: 1.5 * L } }
      break
    }
    case 'triangle':
      return null // handled via expandedLattice's intra-cell stamps
    case 'octagon':
    case 'dodecagon':
      // Octagon and dodecagon don't tile by translation alone — only inside
      // a multi-cell Configuration (e.g. 4.8.8 / 3.12.12). Per-Cell lattice
      // helpers are inert here; the Configuration path uses
      // `compositionLatticeStamps` instead.
      return null
  }
  if (cell.alternateBoundary) {
    // Rotate basis vectors by π/n so the lattice cells track the rotated
    // boundary outline (square → diamond, hex point-up → flat-top).
    const sides = cell.shape === 'square' ? 4 : 6
    const a = Math.PI / sides
    const c = Math.cos(a), s = Math.sin(a)
    basis = {
      u: { x: basis.u.x * c - basis.u.y * s, y: basis.u.x * s + basis.u.y * c },
      v: { x: basis.v.x * c - basis.v.y * s, y: basis.v.x * s + basis.v.y * c },
    }
  }
  return basis
}

/** True iff the Cell shape supports a lattice preview in this version. */
export function supportsLatticePreview(_shape: CellShape): boolean {
  return true
}

/**
 * Expanded lattice descriptor: basis vectors that span the *cell* lattice
 * plus a list of intra-cell stamps (relative offsets + rotations) that
 * fill one cell. Square / hex have one stamp per cell; triangle has two —
 * the source orientation plus a 180°-flipped copy — since equilateral
 * triangles need two orientations to tile the plane.
 */
interface ExpandedLattice {
  u: Vec2
  v: Vec2
  intraStamps: LatticeStamp[]
}

export function expandedLattice(cell: EditorCell): ExpandedLattice | null {
  if (cell.shape === 'triangle') {
    const verts = editorBoundaryVertices(cell)
    if (verts.length !== 3) return null
    const m = [0, 1, 2].map(i => ({
      x: (verts[i].x + verts[(i + 1) % 3].x) / 2,
      y: (verts[i].y + verts[(i + 1) % 3].y) / 2,
    }))
    // u, v span the same-orientation triangle sublattice; the intra-cell
    // partner sits at 2·M[2] (an edge-shared opposite-orientation triangle).
    return {
      u: { x: 2 * (m[0].x - m[2].x), y: 2 * (m[0].y - m[2].y) },
      v: { x: 2 * (m[1].x - m[2].x), y: 2 * (m[1].y - m[2].y) },
      intraStamps: [
        { translation: { x: 0, y: 0 }, rotation: 0 },
        { translation: { x: 2 * m[2].x, y: 2 * m[2].y }, rotation: Math.PI },
      ],
    }
  }
  const basis = latticeBasis(cell)
  if (!basis) return null
  return {
    u: basis.u,
    v: basis.v,
    intraStamps: [{ translation: { x: 0, y: 0 }, rotation: 0 }],
  }
}

/**
 * Step 17.6d — one ring of neighbour stamps around the Cell (centre stamp
 * excluded). Used by Design-Phase "Show neighbours" preview so the user can
 * see how the Cell joins its lattice neighbours before flipping to Composition
 * Phase.
 *
 * - Square: 8 neighbours (orthogonal + diagonal); rotation 0.
 * - Hexagon: 6 axial neighbours; rotation 0.
 * - Triangle: 3 edge-shared neighbours, each flipped 180° around the Cell
 *   centroid (an up-triangle's edge-neighbours are point-down). Computed
 *   directly from boundary edge midpoints so it handles `alternateBoundary`.
 */
export function editorOneRingNeighbourStamps(cell: EditorCell): LatticeStamp[] {
  if (cell.shape === 'triangle') {
    const verts = editorBoundaryVertices(cell)
    if (verts.length !== 3) return []
    const stamps: LatticeStamp[] = []
    for (let i = 0; i < 3; i++) {
      const a = verts[i]
      const b = verts[(i + 1) % 3]
      // Edge midpoint M; the reflected (down-)triangle's centroid sits at
      // 2·M since the source centroid is at the origin. Stamp = translate
      // by 2·M, rotate 180° about the Cell centre.
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      stamps.push({
        translation: { x: 2 * m.x, y: 2 * m.y },
        rotation: Math.PI,
      })
    }
    return stamps
  }
  const basis = latticeBasis(cell)
  if (!basis) return []
  const offsets: Array<[number, number]> = cell.shape === 'square'
    ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]
  return offsets.map(([a, b]) => ({
    translation: {
      x: a * basis.u.x + b * basis.v.x,
      y: a * basis.u.y + b * basis.v.y,
    },
    rotation: 0,
  }))
}

/**
 * Apply a lattice stamp (rotation about origin → translation) to a point.
 * Mirrors the inline transform in `usePattern`'s Composition-Phase stamping.
 */
export function applyStamp(p: Vec2, stamp: LatticeStamp): Vec2 {
  if (stamp.rotation === 0) {
    return { x: p.x + stamp.translation.x, y: p.y + stamp.translation.y }
  }
  const c = Math.cos(stamp.rotation)
  const s = Math.sin(stamp.rotation)
  return {
    x: p.x * c - p.y * s + stamp.translation.x,
    y: p.x * s + p.y * c + stamp.translation.y,
  }
}

/**
 * Step 17.11.1 — neighbour-stamp outer-cycle vertices, exposed as click
 * targets in Complete mode when "Show neighbours" is on. Each entry is a
 * full transformed copy of the Cell's outer cycle, tagged with a synthetic
 * `tileId === 'neighbour-{stampIdx}'` so it round-trips through the same
 * `BoundaryVertex` pipeline as Cell / boundary / pocket vertices.
 *
 * Picking a neighbour vertex resolves to the transformed world `Vec2`, which
 * is exactly what `completeNGap` needs — the resulting irregular Tile's
 * vertices straddle the Boundary edge per Decision 5 (Tiles can poke
 * outside; coincident copies overlay correctly when stamped).
 */
export function neighbourCycleVertices(
  cell: EditorCell,
  outerCycle: BoundaryVertex[],
): BoundaryVertex[][] {
  if (outerCycle.length === 0) return []
  const stamps = editorOneRingNeighbourStamps(cell)
  return stamps.map((stamp, stampIdx) =>
    outerCycle.map((v, i) => ({
      p: applyStamp(v.p, stamp),
      tileId: `neighbour-${stampIdx}`,
      vertexIndex: i,
    })),
  )
}

/**
 * Generate enough lattice stamps to cover the given viewport (world coords).
 * The Cell always renders at lattice point (0,0); additional stamps are
 * added in a square envelope of the basis sufficient to fill the viewport
 * plus a one-cell margin so panning doesn't reveal seams.
 */
export function editorLatticeStamps(
  cell: EditorCell,
  viewport: { x: number; y: number; width: number; height: number },
): LatticeStamp[] {
  const lat = expandedLattice(cell)
  if (!lat) return [{ translation: { x: 0, y: 0 }, rotation: 0 }]

  // Map viewport corners back to lattice coords (a, b) such that
  // (a·u + b·v) lies near each corner. Solve a 2x2 linear system per corner.
  const det = lat.u.x * lat.v.y - lat.u.y * lat.v.x
  if (Math.abs(det) < 1e-9) return [{ translation: { x: 0, y: 0 }, rotation: 0 }]
  const inv = {
    a: lat.v.y / det, b: -lat.v.x / det,
    c: -lat.u.y / det, d: lat.u.x / det,
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
      const baseX = a * lat.u.x + b * lat.v.x
      const baseY = a * lat.u.y + b * lat.v.y
      for (const intra of lat.intraStamps) {
        stamps.push({
          translation: {
            x: baseX + intra.translation.x,
            y: baseY + intra.translation.y,
          },
          rotation: intra.rotation,
        })
      }
    }
  }
  return stamps
}
