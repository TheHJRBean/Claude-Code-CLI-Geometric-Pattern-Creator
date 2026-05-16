import type { Polygon } from '../types/geometry'
import type { CellShape, EditorCell } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { regularPolygonVertices } from './regularPolygon'
import { centroid } from '../utils/math'
import { tileTypeIdFor } from './tileTypeId'

export { tileTypeIdFor }

/**
 * Side count for each supported Cell shape.
 */
export const BOUNDARY_SIDES: Record<CellShape, number> = {
  triangle: 3,
  square: 4,
  hexagon: 6,
  octagon: 8,
}

/**
 * Default rotation per Cell shape, picked so the Boundary appears in its
 * canonical screen orientation (triangle and hex point-up; square axis-aligned;
 * octagon flat-top — the canonical 4.8.8 orientation, edge 0 along the bottom
 * to match the square's convention). SVG y is flipped vs. math coords, so
 * "math −π/2" places vertex 0 visually at the top.
 */
export const BOUNDARY_ROTATION: Record<CellShape, number> = {
  triangle: -Math.PI / 2,
  square: Math.PI / 4,
  hexagon: -Math.PI / 2,
  // 3π/8 puts vertex 0 at the bottom-right of the bottom edge, mirroring the
  // square (vertex 0 at bottom-right, edge 0 = bottom). The result is a
  // flat-top octagon with screen-axis-aligned edges.
  octagon: (3 * Math.PI) / 8,
}

/**
 * Vertices of a Cell's Boundary outline in CCW order, in cell-local coords.
 * `cell.boundarySize` is the Boundary's edge length (Q9 Option B: this *only*
 * rescales the outline — Tile sizes are untouched).
 */
export function editorBoundaryVertices(cell: EditorCell): Vec2[] {
  const sides = BOUNDARY_SIDES[cell.shape]
  const rotation = BOUNDARY_ROTATION[cell.shape]
  // π/n flips the Boundary into its alternate orientation (diamond ↔
  // axis-aligned for a square, point-up ↔ flat-top for a hexagon,
  // point-up ↔ point-down for a triangle).
  const offset = cell.alternateBoundary ? Math.PI / sides : 0
  return regularPolygonVertices(sides, { x: 0, y: 0 }, cell.boundarySize, rotation + offset)
}

/**
 * Convert a Cell's Tiles into the runtime `Polygon[]` shape consumed by
 * `runPIC` and the existing render pipeline. Pure, deterministic, no
 * viewport awareness — the Cell is finite by construction.
 */
export function editorTilesToPolygons(cell: EditorCell): Polygon[] {
  const polys: Polygon[] = []
  for (const tile of cell.tiles) {
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
