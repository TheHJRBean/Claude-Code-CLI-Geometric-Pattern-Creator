import type { EditorConfig, FrameConfig } from './editor'

export interface TilingConfig {
  type: string
  scale: number
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
  type: 'star'
  contactAngle: number  // degrees
  /** Line length as a fraction of auto-computed length (1.0 = meet neighbours) */
  lineLength: number
  /** When true, lineLength is ignored and lines extend to meet neighbours */
  autoLineLength: boolean
  /** When true, manual slider snaps to values where lines meet neighbors */
  snapLineLength?: boolean
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
  /** Independent curve recipe for vertex lines (used only when decoupled).
   *  When coupled, vertex lines follow `curve` like edge lines. Seeded from
   *  `curve` when decoupling is first turned on so the switch is seamless. */
  vertexCurve?: CurveConfig
  /** Curve configuration for bending straight segments into Bezier curves.
   *  Applies to edge (star-arm) lines, and to vertex lines too unless
   *  `vertexLinesDecoupled` is set (then they use `vertexCurve`). */
  curve?: CurveConfig
}

/**
 * Strand rendering style.
 *
 * Replaces the v2 `LacingConfig`. The over/under interlace (the "Lacing"
 * effect) was non-functional and removed in Phase 6 of the context refactor
 * — slated for reintroduction under the Decoration Phase
 * (`project_decoration_stage_idea.md`). `background` keeps the canvas
 * background colour that the legacy `lacing.gapColor` field was carrying.
 */
export interface StrandStyle {
  /** Stroke width of each Strand (px). */
  width: number
  /** Stroke colour of each Strand. */
  color: string
  /** Canvas background colour. Persisted with the Strand style since the
   * pair is what defines the pattern's "look". */
  background: string
  /** Over/under weave (Taprats-style interlacing — the Lacing effect).
   * Strands alternate over and under at each crossing; the under thread is
   * drawn with a gap. Default off. */
  weave?: boolean
  /** Extra breathing space (px) on each side of the over thread at an
   * under-crossing gap. Default 2. */
  weaveGap?: number
}

/**
 * How emitStarArms handles asymmetric / outside pair-A meetings (the cases
 * where the natural star tip falls outside the polygon). On irregular
 * polygons this is a genuine geometric degeneracy with no canonical
 * answer; the routing modes pick among different approximations.
 *
 * - `auto`: convex polygons route through `polygonCenter` (centroid V),
 *   concave polygons fall back to the original edge-slide with the
 *   same-edge guard. Default. No "running along the edge" artifact on
 *   convex tiles; concave bowties keep legitimate edge slides.
 * - `edge`: always emit the original edge-slide. Brings back the
 *   "running along the edge" appearance but never drops a ray pair.
 * - `centroid`: same as `auto` (centroid V on convex; concave still
 *   uses edge-slide since the centroid may lie outside the polygon).
 *   Provided as an explicit override symmetric with `edge`.
 */
export type FigureRouting = 'auto' | 'edge' | 'centroid'

export interface PatternConfig {
  tiling: TilingConfig
  /** keyed by tile type ID (e.g. "6", "6.1", "6.2") */
  figures: Record<string, FigureConfig>
  edgeAngles?: Record<string, number>
  strand: StrandStyle
  /** When true, adjacent Bézier curves' control points are adjusted to share a tangent at interior join points (G1 continuity) */
  smoothTransitions?: boolean
  /** Routing mode for degenerate pair-A meetings on irregular polygons. Default `auto`. */
  figureRouting?: FigureRouting
  /**
   * Step 17 — user-editable tessellation editor patch (Q13 Option C).
   *
   * Active only when `tiling.type === 'editor'`. When present, the render
   * pipeline ignores `tiling.scale` and renders the patch directly. Always
   * carries an inner `version` independent of the outer storage envelope.
   */
  editor?: EditorConfig
  /**
   * Gallery-mode **Frame** (clip-only). A parametric Shape Frame wrapped
   * around the infinite tiling: the pattern is clipped to its outline and the
   * outline is stroked on top. Distinct from Builder framing, which lives on
   * `editor.frame` and carries node/completion machinery. Gallery only ever
   * uses `type: 'shape'` — n-ring frames have no fundamental-domain outline in
   * the Gallery's infinite field. Absent ⇒ no Frame.
   */
  frame?: FrameConfig
}
