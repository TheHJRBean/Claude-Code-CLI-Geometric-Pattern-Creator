import type { EditorConfig, EditorRegularTile } from '../types/editor'

/**
 * 17.1 acceptance fixture.
 *
 * A square Cell with a square Seed Tile at the centre and four equilateral
 * triangle Tiles flush against each side of the square. Chosen because it
 * exercises:
 *   - Cell-Boundary shape + size (square / 240)
 *   - Seed Tile auto-placement (Decision 6)
 *   - regular n-gon tiles with non-trivial rotation (4-gon at π/4, 3-gons
 *     rotated to face outward)
 *   - the Patch-shared edge-length invariant (Decision 14): every Tile
 *     shares the same edge length, so triangle bases sit flush with square
 *     sides
 *
 * Replaced by user-built configs once the Design-Phase UI lands at 17.2+.
 */
const EDGE = 100
const HALF = EDGE / 2

/**
 * Build the four triangles around an axis-aligned square of half-edge `half`
 * and shared edge length `edge`. For each square side we place an
 * equilateral triangle whose base sits on the square's edge and whose apex
 * points outward.
 */
function trianglesAroundSquare(half: number, edge: number): EditorRegularTile[] {
  const h = (Math.sqrt(3) / 2) * edge
  const inradius = h / 3
  const sides: { normalAngle: number; suffix: string }[] = [
    { normalAngle: -Math.PI / 2, suffix: 'top' },
    { normalAngle: 0, suffix: 'right' },
    { normalAngle: Math.PI / 2, suffix: 'bottom' },
    { normalAngle: Math.PI, suffix: 'left' },
  ]
  return sides.map(({ normalAngle, suffix }) => ({
    id: `triangle-${suffix}`,
    kind: 'regular' as const,
    sides: 3,
    center: {
      x: (half + inradius) * Math.cos(normalAngle),
      y: (half + inradius) * Math.sin(normalAngle),
    },
    edgeLength: edge,
    rotation: normalAngle,
    source: 'placed' as const,
  }))
}

export const SAMPLE_EDITOR_CONFIG: EditorConfig = {
  version: 3,
  cells: [
    {
      id: 'main',
      shape: 'square',
      center: { x: 0, y: 0 },
      rotation: 0,
      boundarySize: 240,
      seedSides: 4,
      tiles: [
        {
          id: 'seed',
          kind: 'regular',
          sides: 4,
          center: { x: 0, y: 0 },
          edgeLength: EDGE,
          rotation: Math.PI / 4,
          source: 'seed',
        },
        ...trianglesAroundSquare(HALF, EDGE),
      ],
    },
  ],
  activeCellId: 'main',
  edgeLength: EDGE,
}
