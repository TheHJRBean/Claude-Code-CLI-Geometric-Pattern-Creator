export interface TilingConfig {
  type: string
  scale: number
}

/** A single ring of a layered mandala tessellation. */
export interface MandalaLayer {
  /** Sides of the regular polygon (must divide outerFold under strict-divisor rule) */
  fold: number
  /** Scale relative to the outer ring (0..1] */
  scale: number
  /**
   * Stepwise rotation in units of half the inter-vertex angle (π / fold).
   * 0 = aligned with outer's primary axis. Even steps align vertices with
   * the outer's vertex axis; odd steps align edge-midpoints with that axis.
   */
  rotationStep?: number
}

export interface MandalaConfig {
  /** Sides of the outer ring (4, 6, 8, 10, 12, or 16 in v1) */
  outerFold: number
  layers: MandalaLayer[]
}

export interface CurvePoint {
  /** Where along the segment the bend peaks (0 = start, 0.5 = center, 1 = end) */
  position: number
  /** Perpendicular displacement as fraction of segment length (-1 to 1) */
  offset: number
}

export interface CurveConfig {
  enabled: boolean
  /** 1–3 control points defining the curve shape */
  points: CurvePoint[]
  /** When true, adjacent segments alternate curve direction */
  alternating?: boolean
  /** Which side of the travel direction curves bulge toward */
  direction?: 'left' | 'right'
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
  /** Whether edge-based (star-arm) lines are enabled (default true) */
  edgeLinesEnabled?: boolean
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
  /** Curve configuration for bending straight segments into Bezier curves */
  curve?: CurveConfig
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
  /** keyed by tile type ID (e.g. "6", "6.1", "6.2") */
  figures: Record<string, FigureConfig>
  edgeAngles?: Record<string, number>
  lacing: LacingConfig
  /** When true, adjacent Bézier curves' control points are adjusted to share a tangent at interior join points (G1 continuity) */
  smoothTransitions?: boolean
  /** Configuration for the layered-mandala tessellation. Only consulted when `tiling.type === 'layered-mandala'`. */
  mandala?: MandalaConfig
}
