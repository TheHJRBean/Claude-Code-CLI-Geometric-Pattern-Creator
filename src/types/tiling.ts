import type { PatternConfig } from './pattern'

export type TilingCategory = 'archimedean' | 'rosette-patch'

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
  defaultConfig: Partial<PatternConfig>
}

export interface SymmetryGroup {
  fold: number
  label: string
  tilings: string[]
}
