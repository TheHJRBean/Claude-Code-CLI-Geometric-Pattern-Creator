import type { PatternConfig } from './pattern'
import type { VertexStrandRange } from '../pic/vertexStrandRange'

export type TilingCategory = 'archimedean' | 'rosette-patch'

export interface TileTypeInfo {
  /** Config key (e.g. "6", "6.1", "6.2") */
  id: string
  /** Polygon side count (for geometry) */
  sides: number
  /** Display label (e.g. "6-gon", "6-gon (bowtie)") */
  label: string
  /** The θ band in which this Tile's **Vertex strands** can draw at all
   *  (`pic/vertexStrandRange.ts`). Below `anyFrom` the family emits nothing —
   *  the Strands panel says so rather than letting the Tile go silently dark.
   *  Optional: a caller that only knows the side count can leave it off and the
   *  panel falls back to the regular-n-gon closed form. */
  vertexStrandRange?: VertexStrandRange
}

export interface TilingDefinition {
  name: string
  label: string
  /** Vertex configuration e.g. [4,8,8] */
  vertexConfig: number[]
  /** Which polygon side count to use as the BFS seed */
  seedSides: number
  /** Dominant rotational symmetry order (3 through 12) */
  foldSymmetry: number
  /** Whether this is a true Archimedean tiling or a synthetic rosette patch */
  category: TilingCategory
  /** Tile types with labels for UI. If omitted, derived from vertexConfig. */
  tileTypes?: TileTypeInfo[]
  defaultConfig: Partial<PatternConfig>
}

export interface SymmetryGroup {
  fold: number
  label: string
  tilings: string[]
}
