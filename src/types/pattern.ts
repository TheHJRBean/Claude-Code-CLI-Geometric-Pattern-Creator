export interface TilingConfig {
  type: string
  scale: number
}

export interface FigureConfig {
  type: 'star' | 'rosette' | 'infer'
  contactAngle: number  // degrees
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
