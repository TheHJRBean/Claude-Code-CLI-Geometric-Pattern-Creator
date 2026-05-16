import type {
  BoundaryComposition,
  BoundaryShape,
  BoundaryTile,
  EditorConfig,
  EditorPatch,
  EditorRegularTile,
} from '../types/editor'
import { BOUNDARY_ROTATION, BOUNDARY_SIDES } from './buildEditorPolygons'

/**
 * Defaults for a fresh editor patch. Used by `EDITOR_NEW` and as a base for
 * the design-mode controls in 17.2.
 *
 * The origin polygon is auto-placed at the boundary centre per Decision 6.
 * `edgeLength` is the global value locked at origin time per Decision 14;
 * `boundarySize` is independent (Q9 Option B — resizing the boundary
 * doesn't touch tile sizes).
 */
export const DEFAULT_BOUNDARY_SHAPE: BoundaryShape = 'square'
/**
 * Per-shape default boundary edge length, picked so triangle, square and
 * hexagon all read as the same visual "size" on canvas. Hex feels largest
 * for a given edge (width across corners = 2L), so the lower-fold shapes
 * need bigger edges to match: triangle's altitude is ~0.87L and a square's
 * side is L, while a hex's width is 2L.
 */
export const DEFAULT_BOUNDARY_SIZE_BY_SHAPE: Record<BoundaryShape, number> = {
  triangle: 460,
  square: 400,
  hexagon: 200,
  // Octagon never appears as a single-shape boundary at the top level; the
  // entry exists so 4.8.8 / future composition tiles can read a sane default.
  // Roughly matches the square's visual footprint at the same edge length.
  octagon: 200,
}
export const DEFAULT_BOUNDARY_SIZE = DEFAULT_BOUNDARY_SIZE_BY_SHAPE[DEFAULT_BOUNDARY_SHAPE]
/**
 * Slider max per shape. Triangle gets the most headroom (gap edge altitude is
 * the limiting factor — only 0.87× edge), square gets a moderate bump, hex
 * stays tight (corner-width = 2L already feels large).
 */
export const BOUNDARY_SIZE_MAX_BY_SHAPE: Record<BoundaryShape, number> = {
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

/** Build a fresh `EditorConfig` with defaults and a single auto-placed Seed Tile. */
export function createDefaultEditorConfig(overrides: Partial<EditorConfig> = {}): EditorConfig {
  const boundaryShape = overrides.boundaryShape ?? DEFAULT_BOUNDARY_SHAPE
  const boundarySize = overrides.boundarySize ?? DEFAULT_BOUNDARY_SIZE
  const seedSides = overrides.seedSides ?? DEFAULT_SEED_SIDES
  const edgeLength = overrides.edgeLength ?? DEFAULT_EDGE_LENGTH
  return {
    version: 2,
    boundaryShape,
    boundarySize,
    seedSides,
    edgeLength,
    tiles: overrides.tiles ?? [createSeedTile(seedSides, edgeLength)],
  }
}

/**
 * Per-boundary-tile patch defaults inside a composition. Mirrors
 * `createDefaultEditorConfig` but produces an `EditorPatch` (no `version`,
 * no `composition`) since these patches sit *inside* `BoundaryTile.patch`.
 *
 * The boundary outline of a composition tile is determined by the
 * composition's lattice, not its individual `boundarySize` — but the field
 * still has to be populated for legacy helpers (e.g. `editorBoundaryVertices`
 * called inside placement / Complete flows). It's set to a value matching
 * the tile's circumradius at the shared `edgeLength` so single-patch
 * helpers see a coherent outline if invoked.
 */
function createInnerPatch(shape: BoundaryShape, edgeLength: number): EditorPatch {
  const sides = BOUNDARY_SIDES[shape]
  // The origin tile matches the boundary outline exactly (same shape, same
  // edge length, same rotation) so PIC sees the boundary tile itself as the
  // polygon — strands emerge from its edges, which is the 4.8.8 strand
  // pattern. Sub-tile authoring inside a composition tile is a v2 feature;
  // until then origin = boundary leaves the picker overlay nothing useful
  // to do (the picker is hidden under composition).
  return {
    boundaryShape: shape,
    boundarySize: edgeLength,
    seedSides: sides,
    edgeLength,
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
 * Build a fresh **4.8.8 boundary configuration** (truncated square: octagon
 * + square). Cell vectors `u = (L(1+√2), 0)`, `v = (0, L(1+√2))`. Octagon
 * sits at the cell origin in flat-top orientation; square sits at the cell
 * centre rotated π/4 (diamond) so its edges align with the octagon's
 * diagonal edges and strands flow naturally between them.
 *
 * Each boundary tile starts with its own auto-placed origin polygon (octagon
 * for the octagon tile, square for the square tile) at the tile centre — the
 * user can edit each independently in Design mode and see the merged
 * composition in Strand mode.
 */
export function createDefault488Composition(edgeLength: number = DEFAULT_EDGE_LENGTH): BoundaryComposition {
  const offset = (edgeLength * (1 + Math.SQRT2)) / 2
  const tiles: BoundaryTile[] = [
    {
      id: 'octagon',
      shape: 'octagon',
      center: { x: 0, y: 0 },
      rotation: 0,
      patch: createInnerPatch('octagon', edgeLength),
    },
    {
      id: 'square',
      shape: 'square',
      center: { x: offset, y: offset },
      rotation: Math.PI / 4,
      patch: createInnerPatch('square', edgeLength),
    },
  ]
  return {
    configurationId: '4.8.8',
    edgeLength,
    activeTileId: 'octagon',
    tiles,
  }
}

/**
 * Build a fresh `EditorConfig` wrapping a 4.8.8 composition. The wrapper's
 * top-level fields are inert when `composition` is set — populated with
 * sensible no-op defaults (single-shape readers should never reach them
 * because they go through `activePatch` / `allPatches` first).
 */
export function createDefault488EditorConfig(): EditorConfig {
  const composition = createDefault488Composition(DEFAULT_EDGE_LENGTH)
  const active = composition.tiles.find(t => t.id === composition.activeTileId)!
  return {
    version: 2,
    boundaryShape: active.patch.boundaryShape,
    boundarySize: active.patch.boundarySize,
    seedSides: active.patch.seedSides,
    edgeLength: active.patch.edgeLength,
    tiles: active.patch.tiles,
    composition,
  }
}
