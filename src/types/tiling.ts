import type { PatternConfig } from './pattern'

export interface TilingDefinition {
  name: string
  label: string
  /** Vertex configuration e.g. [4,8,8] */
  vertexConfig: number[]
  /** Which polygon side count to use as the BFS seed */
  seedSides: number
  defaultConfig: Partial<PatternConfig>
}
