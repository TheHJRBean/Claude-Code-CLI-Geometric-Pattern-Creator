import type { BoundaryShape, EditorConfig, EditorRegularTile } from '../types/editor'

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
export const DEFAULT_BOUNDARY_SIZE = 200
export const DEFAULT_ORIGIN_SIDES = 4
export const DEFAULT_EDGE_LENGTH = 100

/** Build the auto-placed origin tile (Decision 6) at the patch centre. */
export function createOriginTile(originSides: number, edgeLength: number): EditorRegularTile {
  return {
    id: 'origin',
    kind: 'regular',
    sides: originSides,
    center: { x: 0, y: 0 },
    edgeLength,
    rotation: 0,
    origin: 'origin',
  }
}

/** Build a fresh `EditorConfig` with defaults and a single auto-placed origin tile. */
export function createDefaultEditorConfig(overrides: Partial<EditorConfig> = {}): EditorConfig {
  const boundaryShape = overrides.boundaryShape ?? DEFAULT_BOUNDARY_SHAPE
  const boundarySize = overrides.boundarySize ?? DEFAULT_BOUNDARY_SIZE
  const originSides = overrides.originSides ?? DEFAULT_ORIGIN_SIDES
  const edgeLength = overrides.edgeLength ?? DEFAULT_EDGE_LENGTH
  return {
    version: 1,
    boundaryShape,
    boundarySize,
    originSides,
    edgeLength,
    tiles: overrides.tiles ?? [createOriginTile(originSides, edgeLength)],
  }
}
