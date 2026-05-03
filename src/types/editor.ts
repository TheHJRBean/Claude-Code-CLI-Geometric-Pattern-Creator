import type { Vec2 } from '../utils/math'

/**
 * Step 17 — user-editable tessellation editor data model.
 *
 * Authoritative schema for an editor patch. Lives on `PatternConfig.editor`
 * (Q13 resolution: Option C) and round-trips through `lab-tessellations-v1`
 * localStorage and `saveJSON` / `loadJSON`.
 *
 * `version` is the inner schema version for `EditorConfig` itself; future
 * shape changes bump it and migrate without touching the outer
 * `lab-tessellations-v1` envelope.
 */

export type BoundaryShape = 'triangle' | 'square' | 'hexagon'

/**
 * Provenance of a tile inside the patch.
 *
 * Decision 12 says completed tiles are first-class polygons with the same
 * data model as user-placed tiles, so we keep them in a single array and
 * track origin as a discriminator. `'origin'` marks the auto-placed centre
 * polygon (Decision 6); `'placed'` is a manual user placement; `'completed'`
 * came from the Complete operation (Decisions 9–12).
 */
export type EditorTileOrigin = 'origin' | 'placed' | 'completed'

export interface EditorRegularTile {
  id: string
  kind: 'regular'
  /** Side count (≥ 3). */
  sides: number
  /** Centre in patch-local world coordinates (origin = boundary centre). */
  center: Vec2
  /** Edge length in world units. All regular placements share `EditorConfig.edgeLength`. */
  edgeLength: number
  /** Rotation in radians; with rotation 0, vertex 0 lies on the +x axis. */
  rotation: number
  origin: EditorTileOrigin
}

/**
 * Irregular tile (bowtie, kite, etc.) produced by Complete when no regular
 * polygon fits the gap (Decision 10). Vertices in CCW order.
 */
export interface EditorIrregularTile {
  id: string
  kind: 'irregular'
  vertices: Vec2[]
  origin: 'completed'
}

export type EditorTile = EditorRegularTile | EditorIrregularTile

export interface EditorConfig {
  /** Inner schema version. Bumped independently of the outer storage envelope. */
  version: 1
  boundaryShape: BoundaryShape
  /** Lattice cell size in world units (Q9 Option B: rescales the cell only). */
  boundarySize: number
  /** Side count of the auto-placed origin polygon (Decision 6). */
  originSides: number
  /** Global edge length for all regular placements (Decision 14, locked at origin time). */
  edgeLength: number
  tiles: EditorTile[]
}
