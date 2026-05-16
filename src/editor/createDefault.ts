import type {
  CellShape,
  EditorCell,
  EditorConfig,
  EditorRegularTile,
} from '../types/editor'
import { BOUNDARY_ROTATION } from './buildEditorPolygons'

/**
 * Defaults for a fresh editor **Patch** + **Cell**. Used by `EDITOR_NEW`
 * and as a base for the Design-Phase controls in 17.2.
 *
 * The Seed Tile is auto-placed at the Cell centre per Decision 6.
 * `edgeLength` is the Patch-level value locked at Seed time per Decision 14;
 * `boundarySize` is independent per Cell (Q9 Option B — resizing the
 * Boundary doesn't touch Tile sizes).
 */
export const DEFAULT_BOUNDARY_SHAPE: CellShape = 'square'
/**
 * Per-shape default Cell-Boundary edge length, picked so triangle, square and
 * hexagon all read as the same visual "size" on canvas. Hex feels largest
 * for a given edge (width across corners = 2L), so the lower-fold shapes
 * need bigger edges to match: triangle's altitude is ~0.87L and a square's
 * side is L, while a hex's width is 2L.
 */
export const DEFAULT_BOUNDARY_SIZE_BY_SHAPE: Record<CellShape, number> = {
  triangle: 460,
  square: 400,
  hexagon: 200,
  // Octagon never appears as a single-Cell Patch at the top level; the
  // entry exists so 4.8.8 / future multi-cell Configurations can read a sane
  // default. Roughly matches the square's visual footprint at the same edge.
  octagon: 200,
}
export const DEFAULT_BOUNDARY_SIZE = DEFAULT_BOUNDARY_SIZE_BY_SHAPE[DEFAULT_BOUNDARY_SHAPE]
/**
 * Slider max per shape. Triangle gets the most headroom (gap edge altitude is
 * the limiting factor — only 0.87× edge), square gets a moderate bump, hex
 * stays tight (corner-width = 2L already feels large).
 */
export const BOUNDARY_SIZE_MAX_BY_SHAPE: Record<CellShape, number> = {
  triangle: 1600,
  square: 1000,
  hexagon: 800,
  octagon: 800,
}
export const DEFAULT_SEED_SIDES = 4
export const DEFAULT_EDGE_LENGTH = 100

/** Build the auto-placed Seed Tile (Decision 6) at the Cell centre. */
export function createSeedTile(seedSides: number, edgeLength: number): EditorRegularTile {
  return {
    id: 'seed',
    kind: 'regular',
    sides: seedSides,
    center: { x: 0, y: 0 },
    edgeLength,
    rotation: 0,
    source: 'seed',
  }
}

export interface DefaultEditorOverrides {
  shape?: CellShape
  boundarySize?: number
  seedSides?: number
  edgeLength?: number
}

/**
 * Build a fresh single-Cell `EditorConfig` with defaults and an auto-placed
 * Seed Tile. The lone Cell carries id `'main'` and lives at the Patch origin.
 */
export function createDefaultEditorConfig(overrides: DefaultEditorOverrides = {}): EditorConfig {
  const shape = overrides.shape ?? DEFAULT_BOUNDARY_SHAPE
  const boundarySize = overrides.boundarySize ?? DEFAULT_BOUNDARY_SIZE_BY_SHAPE[shape]
  const seedSides = overrides.seedSides ?? DEFAULT_SEED_SIDES
  const edgeLength = overrides.edgeLength ?? DEFAULT_EDGE_LENGTH
  const cell: EditorCell = {
    id: 'main',
    shape,
    center: { x: 0, y: 0 },
    rotation: 0,
    boundarySize,
    seedSides,
    tiles: [createSeedTile(seedSides, edgeLength)],
  }
  return {
    version: 3,
    cells: [cell],
    activeCellId: 'main',
    edgeLength,
  }
}

/**
 * Build a Cell whose Seed Tile matches the Cell-Boundary outline exactly
 * (same shape, same edge length, same canonical rotation). Used to seed
 * multi-cell Configurations like 4.8.8: each Cell starts out as one
 * boundary-matching polygon so PIC sees the Cell's outline as the polygon
 * and Strands emerge from its edges, reproducing the canonical pattern.
 */
function createBoundaryMatchingCell(
  id: string,
  shape: CellShape,
  center: { x: number; y: number },
  rotation: number,
  edgeLength: number,
): EditorCell {
  const sides = shape === 'triangle' ? 3 : shape === 'square' ? 4 : shape === 'hexagon' ? 6 : 8
  return {
    id,
    shape,
    center,
    rotation,
    boundarySize: edgeLength,
    seedSides: sides,
    tiles: [
      {
        id: 'seed',
        kind: 'regular',
        sides,
        center: { x: 0, y: 0 },
        edgeLength,
        rotation: BOUNDARY_ROTATION[shape],
        source: 'seed',
      },
    ],
  }
}

/**
 * Build a fresh **4.8.8 Configuration** Patch (truncated square: octagon +
 * square). Lattice cell vectors `u = (L(1+√2), 0)`, `v = (0, L(1+√2))`.
 * Octagon Cell sits at the Patch origin in flat-top orientation; square
 * Cell sits at the lattice-cell centre rotated π/4 (diamond) so its edges
 * align with the octagon Cell's diagonal edges and Strands flow naturally
 * between them.
 *
 * Each Cell starts with its own auto-placed Seed Tile (octagon for the
 * octagon Cell, square for the square Cell) at the Cell centre — the user
 * can edit each independently in Design Phase and see the merged
 * Composition in Composition Phase.
 */
export function createDefault488EditorConfig(): EditorConfig {
  const edgeLength = DEFAULT_EDGE_LENGTH
  const offset = (edgeLength * (1 + Math.SQRT2)) / 2
  const cells: EditorCell[] = [
    createBoundaryMatchingCell('octagon', 'octagon', { x: 0, y: 0 }, 0, edgeLength),
    createBoundaryMatchingCell('square', 'square', { x: offset, y: offset }, Math.PI / 4, edgeLength),
  ]
  return {
    version: 3,
    cells,
    activeCellId: 'octagon',
    edgeLength,
    configuration: '4.8.8',
  }
}
