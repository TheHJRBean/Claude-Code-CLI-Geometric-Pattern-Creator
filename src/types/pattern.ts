export interface TilingConfig {
  type: string
  scale: number
}

export interface FigureConfig {
  type: 'star' | 'rosette' | 'infer'
  contactAngle: number  // degrees
  /** Line length as a fraction of auto-computed length (1.0 = meet neighbours) */
  lineLength: number
  /** When true, lineLength is ignored and lines extend to meet neighbours */
  autoLineLength: boolean
  /** When true, manual slider snaps to values where lines meet neighbors */
  snapLineLength?: boolean
  /** Rosette petal shape: 0 = straight tip-to-tip, 1 = full knee at edge midpoint */
  rosetteQ?: number
  rosetteS?: number
  /** Whether vertex-based lines are enabled */
  vertexLinesEnabled?: boolean
  /** When true, vertex lines use their own angle/lineLength instead of the edge-midpoint values */
  vertexLinesDecoupled?: boolean
  /** Contact angle for vertex lines (used only when decoupled) */
  vertexContactAngle?: number
  /** Line length for vertex lines (used only when decoupled) */
  vertexLineLength?: number
  /** Auto line length for vertex lines (used only when decoupled) */
  vertexAutoLineLength?: boolean
}

export interface LacingConfig {
  enabled: boolean
  strandWidth: number
  gapWidth: number
  strandColor: string
  gapColor: string
}

export interface PatternConfig {
  tiling: TilingConfig
  /** keyed by polygon side count */
  figures: Record<number, FigureConfig>
  edgeAngles?: Record<string, number>
  lacing: LacingConfig
}
