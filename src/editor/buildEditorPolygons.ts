import type { Polygon } from '../types/geometry'
import type { BoundaryShape, EditorPatch } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { regularPolygonVertices } from './regularPolygon'
import { centroid } from '../utils/math'
import { tileTypeIdFor } from './tileTypeId'

export { tileTypeIdFor }

/**
 * Side count for each supported boundary shape.
 */
export const BOUNDARY_SIDES: Record<BoundaryShape, number> = {
  triangle: 3,
  square: 4,
  hexagon: 6,
  octagon: 8,
}

/**
 * Default rotation per boundary shape, picked so the boundary appears in its
 * canonical screen orientation (triangle and hex point-up; square axis-aligned;
 * octagon flat-top — the canonical 4.8.8 orientation, edge 0 along the bottom
 * to match the square's convention). SVG y is flipped vs. math coords, so
 * "math −π/2" places vertex 0 visually at the top.
 */
export const BOUNDARY_ROTATION: Record<BoundaryShape, number> = {
  triangle: -Math.PI / 2,
  square: Math.PI / 4,
  hexagon: -Math.PI / 2,
  // 3π/8 puts vertex 0 at the bottom-right of the bottom edge, mirroring the
  // square (vertex 0 at bottom-right, edge 0 = bottom). The result is a
  // flat-top octagon with screen-axis-aligned edges.
  octagon: (3 * Math.PI) / 8,
}

/**
 * Vertices of the patch boundary outline in CCW order. `boundarySize` is
 * the boundary's edge length (Q9 Option B: this *only* rescales the
 * outline — tile sizes are untouched).
 */
export function editorBoundaryVertices(patch: EditorPatch): Vec2[] {
  const sides = BOUNDARY_SIDES[patch.boundaryShape]
  const rotation = BOUNDARY_ROTATION[patch.boundaryShape]
  // π/n flips the boundary into its alternate orientation (diamond ↔
  // axis-aligned for a square, point-up ↔ flat-top for a hexagon,
  // point-up ↔ point-down for a triangle).
  const offset = patch.alternateBoundary ? Math.PI / sides : 0
  return regularPolygonVertices(sides, { x: 0, y: 0 }, patch.boundarySize, rotation + offset)
}

/**
 * Convert an `EditorConfig` into the runtime `Polygon[]` shape consumed by
 * `runPIC` and the existing render pipeline. Pure, deterministic, no
 * viewport awareness — the editor patch is finite by construction.
 */
export function editorTilesToPolygons(patch: EditorPatch): Polygon[] {
  const polys: Polygon[] = []
  for (const tile of patch.tiles) {
    if (tile.kind === 'regular') {
      polys.push({
        id: tile.id,
        sides: tile.sides,
        tileTypeId: tileTypeIdFor(tile),
        center: tile.center,
        vertices: regularPolygonVertices(tile.sides, tile.center, tile.edgeLength, tile.rotation),
      })
    } else {
      polys.push({
        id: tile.id,
        sides: tile.vertices.length,
        tileTypeId: tileTypeIdFor(tile),
        center: centroid(tile.vertices),
        vertices: tile.vertices,
      })
    }
  }
  return polys
}
