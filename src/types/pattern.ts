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

/**
 * An **additional line set** on a Figure recipe (ticket #42, `multi-ray-sets`).
 * A set emits the same PIC line family (edge star-arms or vertex lines) from
 * the same origins as the primary figure, but with its own contact angle,
 * length, and curve — layering rosettes / multiple star families onto one
 * Tiling. The primary figure is the flat `FigureConfig` fields (set 0);
 * `extraSets` are additive.
 *
 * Extra sets hold **uniform θ** and are **not morphed** in v1 — only the
 * primary set responds to an active `MorphConfig`.
 */
export interface FigureLineSet {
  /** Stable id; also stamped on emitted `Segment`s as `setId` so this set's
   *  Rays chain/dedup only among themselves. */
  id: string
  /** Which family this set emits. `'boundary'` traces the Tile outlines
   *  themselves as Strands — no PIC rays, so `contactAngle` / length are
   *  ignored for it; the curve still applies. */
  kind: 'edge' | 'vertex' | 'boundary'
  /** Default true; `false` suppresses emission without deleting the set. */
  enabled?: boolean
  /** Contact angle θ (degrees), uniform across the set. Unused for `boundary`. */
  contactAngle: number
  /** Line length as a fraction of the auto-computed length (1.0 = meet neighbours). */
  lineLength: number
  /** When true, `lineLength` is ignored and lines extend to meet neighbours. */
  autoLineLength: boolean
  /** Optional curve recipe for this set's lines (mirrors `FigureConfig.curve`). */
  curve?: CurveConfig
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
  /** Additional line sets (ticket #42) emitted from the same origins as the
   *  primary figure, each with independent θ / length / curve. Additive:
   *  absent or empty ⇒ single-set behaviour identical to pre-#42. */
  extraSets?: FigureLineSet[]
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
/**
 * How each Strand's stroke is drawn:
 * - `'solid'`  — one continuous stroke (default).
 * - `'double'` — two parallel lines (the stroke's centre is cut out with a
 *                mask, so Void fills / background show through the middle).
 * - `'triple'` — double plus a thin centre line.
 * - `'dashed'` — dash pattern scaled to the Strand width.
 * - `'dotted'` — round dots scaled to the Strand width.
 */
export type StrandLineStyle = 'solid' | 'double' | 'triple' | 'dashed' | 'dotted'

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
  /** Stroke rendering variant. Default `'solid'`. */
  lineStyle?: StrandLineStyle
  /** Fill colour painted in the centre gap of `double`/`triple` strokes.
   * Absent ⇒ the gap stays cut out (Void fills / background show through). */
  innerFill?: string
}

/**
 * A **Morph Boundary** — one gradient stop of a Morph (ADR-0009). Carries a
 * partial per-tile-type `FigureConfig` overlay; a stop's *effective* value for
 * a field is the start recipe's value overridden by the overlay, so an
 * untouched stop reproduces the start recipe. v1 reads `contactAngle` (and
 * `vertexContactAngle` when decoupled) from the overlay; other fields are
 * stored but held from the start recipe until slice 3.
 */
export interface MorphBoundary {
  id: string
  /** World-space distance from the Morph origin (along `direction` for
   * linear, radially for radial). Boundaries are kept sorted ascending. */
  position: number
  /** Partial overlay per tileTypeId. */
  figures: Record<string, Partial<FigureConfig>>
}

/**
 * A **Morph** (ADR-0009, PATTERN_MORPH_SPEC.md) spatially interpolates
 * Figure-recipe angles across the canvas. Top-level on `PatternConfig`
 * (mirrors `figures` / `frame`); absent ⇒ no morph. Field evaluation is in
 * world/Patch space so pan/zoom never changes the pattern:
 * `d ≤ first stop` → first stop's effective values; between stops →
 * piecewise-linear blend; `d ≥ last stop` → last stop's values.
 */
export interface MorphConfig {
  enabled: boolean
  mode: 'linear' | 'radial'
  /** World/Patch space. Linear: d = dot(p − origin, direction); radial:
   * d = |p − origin|. */
  origin: { x: number; y: number }
  /** Linear mode only; unit vector. */
  direction?: { x: number; y: number }
  /** Reserved; only 'linear' in v1. */
  easing: 'linear'
  /** Ordered by `position` ascending. */
  boundaries: MorphBoundary[]
}

export interface PatternConfig {
  tiling: TilingConfig
  /** keyed by tile type ID (e.g. "6", "6.1", "6.2") */
  figures: Record<string, FigureConfig>
  edgeAngles?: Record<string, number>
  strand: StrandStyle
  /** When true, adjacent Bézier curves' control points are adjusted to share a tangent at interior join points (G1 continuity) */
  smoothTransitions?: boolean
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
  /**
   * Step 20 — **Morph** (spatial Figure-recipe interpolation). Builder-only
   * authoring (Composition Phase onwards) but rendered wherever the save is
   * loaded. Absent ⇒ no morph.
   */
  morph?: MorphConfig
}
