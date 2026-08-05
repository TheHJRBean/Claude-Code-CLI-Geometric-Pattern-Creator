import type { DecorationConfig, EditorConfig, FrameConfig } from './editor'

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
 * - `'solid'` — one continuous stroke (default).
 * - `'lines'` — divided into `lineCount` parallel lines (2–10); the gaps are
 *               cut out of the stroke with a mask, so Void fills / background
 *               show through between the lines.
 *
 * The legacy `'double'` / `'triple'` values load as `'lines'` with the
 * matching count (`editor/migrations.ts`, `state/configValidation.ts`); the
 * legacy `'dashed'` / `'dotted'` styles were withdrawn and load as `'solid'`.
 */
export type StrandLineStyle = 'solid' | 'lines'

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
  /** Fill colour painted in the gaps of a `'lines'` stroke.
   * Absent ⇒ the gaps stay cut out (Void fills / background show through). */
  innerFill?: string
  /** How many parallel lines a `'lines'` stroke divides into, 2–10.
   * Default 2 (`DEFAULT_LINE_COUNT`). Ignored while `lineStyle` is solid. */
  lineCount?: number
  /** Line thickness ÷ gap thickness for a `'lines'` stroke
   * (`rendering/strandStyle.ts`). Default 1 = equal; higher = thicker lines,
   * tighter gaps. */
  styleRatio?: number
}

/**
 * Which side(s) of a Morph Origin its blend extends into. Stored
 * direction-relative so the same union serves both modes; the UI labels it
 * per-mode (Linear → Left/Right, Radial → Inside/Outside).
 */
export type MorphSides = 'both' | 'negative' | 'positive'

/**
 * A **Morph Origin** — one anchor of a Morph (ADR-0009, amended 2026-07-29).
 *
 * The Origin's own line/ring holds the **live base recipe**; its `figures`
 * overlay is the **target**, reached at `position ± reach` on whichever
 * `sides` are active and clamped beyond. So the blend is always continuous at
 * the Origin itself, and `reach` is exactly "the distance over which the
 * morph takes place".
 *
 * v1 reads `contactAngle` (and `vertexContactAngle` when decoupled) from the
 * overlay; other fields are stored but held from the start recipe until
 * slice 3 (#39).
 *
 * Replaces the pre-2026-07-29 `MorphBoundary`, which was a gradient stop in a
 * single sorted sequence sharing one implicit base stop at `d = 0`.
 */
export interface MorphOrigin {
  id: string
  /** World-space distance from the Morph's `axisOrigin` (along `direction`
   * for linear, radially for radial). Origins are kept sorted ascending. */
  position: number
  /** Distance from the line/ring over which the base recipe blends to this
   * Origin's target overlay. `0` ⇒ a hard step at the line. Ignored on a side
   * where `autoReach` finds a neighbour — see `originReach`. */
  reach: number
  /** When true, the reach on each side is computed live as HALF the gap to
   * the adjacent Origin on that side, so neighbouring ramps meet exactly
   * midway and the handover lands on the midpoint. Falls back to `reach` on a
   * side with no neighbour. Absent ⇒ false, so pre-#49 saves are unchanged;
   * newly added Origins set it true. */
  autoReach?: boolean
  /** Which side(s) of the line/ring the blend extends into. */
  sides: MorphSides
  /** Partial overlay per tileTypeId — the TARGET values, reached at `reach`. */
  figures: Record<string, Partial<FigureConfig>>
}

/**
 * A **Morph** (ADR-0009, PATTERN_MORPH_SPEC.md) spatially interpolates
 * Figure-recipe angles across the canvas. Top-level on `PatternConfig`
 * (mirrors `figures` / `frame`); absent ⇒ no morph. Field evaluation is in
 * world/Patch space so pan/zoom never changes the pattern.
 *
 * Each Origin owns a self-contained base→target ramp; where several could
 * apply, the **nearest Origin whose active side faces the point wins** (hard
 * handover at the midpoint, no blending, no compounding). Where no Origin's
 * active side faces a point, the base recipe applies unchanged.
 */
export interface MorphConfig {
  enabled: boolean
  mode: 'linear' | 'radial'
  /** The axis reference point in world/Patch space — where `position` is
   * measured from. Linear: d = dot(p − axisOrigin, direction); radial:
   * d = |p − axisOrigin|. Labelled "Axis" (linear) / "Centre" (radial) in the
   * UI; named `axisOrigin` rather than `origin` so it doesn't collide with
   * the per-stop Morph Origins. */
  axisOrigin: { x: number; y: number }
  /** Linear mode only; unit vector. */
  direction?: { x: number; y: number }
  /** Reserved; only 'linear' in v1. */
  easing: 'linear'
  /** Ordered by `position` ascending. */
  origins: MorphOrigin[]
}

export interface PatternConfig {
  /**
   * Schema generation of this config (roadmap #6). Optional because **absent
   * means "pre-versioning"** — every save written before 2026-07-30 lacks it
   * and must keep loading unchanged.
   *
   * Owned by `state/configValidation.ts`: `loadPatternConfig` dispatches on it
   * and stamps `CURRENT_PATTERN_CONFIG_VERSION` on everything it returns, and
   * the library stamps it on write. Independent of the carriers it rides in —
   * the library envelope, `lab-state-v1`, a Generator dataset record and an
   * exported `.json` each version themselves separately (two of them not at
   * all), which is exactly why this lives on the config.
   */
  version?: number
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
   * Decoration for a **legacy-substrate** pattern — one with no Builder Patch
   * to hang it on (a Gallery preset, a Generator sample, any BFS / Taprats
   * tiling). A Patch keeps its decoration on `editor.decoration` as it always
   * has; the two homes are mutually exclusive, and `decoration/store.ts` is
   * the only place that picks between them. Never read this field directly —
   * use `patternDecoration(config)`, or a Patch's decoration is invisible to
   * you.
   */
  decoration?: DecorationConfig
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
