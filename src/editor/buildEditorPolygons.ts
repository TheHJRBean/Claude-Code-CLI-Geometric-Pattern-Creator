import type { Polygon } from '../types/geometry'
import type { BoundaryShape, EditorConfig, EditorTile } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { regularPolygonVertices } from './regularPolygon'
import { centroid } from '../utils/math'

/**
 * Side count for each supported boundary shape.
 */
export const BOUNDARY_SIDES: Record<BoundaryShape, number> = {
  triangle: 3,
  square: 4,
  hexagon: 6,
}

/**
 * Default rotation per boundary shape, picked so the boundary appears in its
 * canonical screen orientation (triangle and hex point-up; square axis-aligned).
 * SVG y is flipped vs. math coords, so "math −π/2" places vertex 0 visually at
 * the top.
 */
const BOUNDARY_ROTATION: Record<BoundaryShape, number> = {
  triangle: -Math.PI / 2,
  square: Math.PI / 4,
  hexagon: -Math.PI / 2,
}

/**
 * Vertices of the patch boundary outline in CCW order. `boundarySize` is
 * the boundary's edge length (Q9 Option B: this *only* rescales the
 * outline — tile sizes are untouched).
 */
export function editorBoundaryVertices(editor: EditorConfig): Vec2[] {
  const sides = BOUNDARY_SIDES[editor.boundaryShape]
  const rotation = BOUNDARY_ROTATION[editor.boundaryShape]
  return regularPolygonVertices(sides, { x: 0, y: 0 }, editor.boundarySize, rotation)
}

/**
 * Map an editor tile onto the `tileTypeId` used by `runPIC` for figure-config
 * lookup.
 *
 * Q11 resolution (Option B):
 *   - Regular n-gon → `"<n>"` (matches the existing archimedean convention).
 *   - Irregular tile → canonical-signature hash, planned for sub-step 17.5.
 *
 * 17.1 only ships regular tiles, so the irregular branch returns a
 * provisional placeholder. Replaced wholesale at 17.5.
 */
export function tileTypeIdFor(tile: EditorTile): string {
  if (tile.kind === 'regular') return String(tile.sides)
  return `${tile.vertices.length}i:provisional`
}

/**
 * Convert an `EditorConfig` into the runtime `Polygon[]` shape consumed by
 * `runPIC` and the existing render pipeline. Pure, deterministic, no
 * viewport awareness — the editor patch is finite by construction.
 */
export function editorTilesToPolygons(editor: EditorConfig): Polygon[] {
  const polys: Polygon[] = []
  for (const tile of editor.tiles) {
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
