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
  rosetteS?: number
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
