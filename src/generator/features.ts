import type { FigureConfig, PatternConfig, StrandLineStyle } from '../types/pattern'
import { TILING_NAMES } from '../tilings/index'

/**
 * Feature extraction for the taste model (ADR-0007 ML arc).
 *
 * Pure module: `PatternConfig` → fixed-length numeric vector. The features
 * mirror the v1 sampler's dimensions (`SAMPLER_TUNING`) — the model can only
 * learn along axes the sampler actually varies. Per-tile-type figure recipes
 * are aggregated (mean / fraction) so tilings with different tile-type counts
 * map to the same vector length.
 *
 * `FEATURE_NAMES` depends on the shipped tiling list, so it can grow when a
 * tiling is added. Any trained model artifact MUST persist the featureNames
 * it was trained against and re-index by name at inference time — never
 * assume positional stability across app versions.
 */

export const LINE_STYLES: readonly StrandLineStyle[] = [
  'solid',
  'double',
  'triple',
  'dashed',
  'dotted',
]

export const FEATURE_NAMES: readonly string[] = [
  ...TILING_NAMES.map(t => `tiling:${t}`),
  'scale',
  'contactAngleMean',
  'contactAngleSpread',
  'autoLineLengthFrac',
  'lineLengthMean',
  'edgeLinesFrac',
  'vertexLinesFrac',
  'vertexDecoupledFrac',
  'curveFrac',
  'curvePointsMean',
  'curveOffsetAbsMean',
  'curveAlternatingFrac',
  // Extra line sets (#42) — layered families. Without these, set-bearing
  // configs are invisible to the model and their scores misattribute onto the
  // primary-figure axes. `*Frac` = fraction of figures carrying ≥1 such set.
  'extraSetFrac',
  'extraSetCountMean',
  'extraSetEdgeFrac',
  'extraSetVertexFrac',
  'extraSetBoundaryFrac',
  'smoothTransitions',
  'strandWidth',
  'weave',
  ...LINE_STYLES.map(s => `lineStyle:${s}`),
]

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length
}

function frac(figures: FigureConfig[], predicate: (f: FigureConfig) => boolean): number {
  return figures.length === 0 ? 0 : figures.filter(predicate).length / figures.length
}

/**
 * Extract the feature vector for one config, ordered as `FEATURE_NAMES`.
 * Total function: unknown tiling types / empty figure maps yield zeros in the
 * affected slots rather than throwing, so stale records never break a
 * training run.
 */
export function extractFeatures(config: PatternConfig): number[] {
  const figures = Object.values(config.figures)
  const curved = figures.filter(f => f.curve?.enabled)
  const curvePoints = curved.flatMap(f => f.curve?.points ?? [])

  const named: Record<string, number> = {
    scale: config.tiling.scale,
    contactAngleMean: mean(figures.map(f => f.contactAngle)),
    contactAngleSpread:
      figures.length === 0
        ? 0
        : Math.max(...figures.map(f => f.contactAngle)) -
          Math.min(...figures.map(f => f.contactAngle)),
    autoLineLengthFrac: frac(figures, f => f.autoLineLength),
    lineLengthMean: mean(figures.map(f => f.lineLength)),
    // edgeLinesEnabled defaults to true when absent (types/pattern.ts).
    edgeLinesFrac: frac(figures, f => f.edgeLinesEnabled !== false),
    vertexLinesFrac: frac(figures, f => f.vertexLinesEnabled === true),
    vertexDecoupledFrac: frac(figures, f => f.vertexLinesDecoupled === true),
    curveFrac: figures.length === 0 ? 0 : curved.length / figures.length,
    curvePointsMean: mean(curved.map(f => f.curve?.points.length ?? 0)),
    curveOffsetAbsMean: mean(curvePoints.map(p => Math.abs(p.offset))),
    curveAlternatingFrac: frac(curved, f => f.curve?.alternating === true),
    extraSetFrac: frac(figures, f => (f.extraSets?.length ?? 0) > 0),
    extraSetCountMean: mean(figures.map(f => f.extraSets?.length ?? 0)),
    extraSetEdgeFrac: frac(figures, f => f.extraSets?.some(s => s.kind === 'edge') === true),
    extraSetVertexFrac: frac(figures, f => f.extraSets?.some(s => s.kind === 'vertex') === true),
    extraSetBoundaryFrac: frac(figures, f => f.extraSets?.some(s => s.kind === 'boundary') === true),
    smoothTransitions: config.smoothTransitions ? 1 : 0,
    strandWidth: config.strand.width,
    weave: config.strand.weave ? 1 : 0,
  }
  for (const t of TILING_NAMES) {
    named[`tiling:${t}`] = config.tiling.type === t ? 1 : 0
  }
  const lineStyle = config.strand.lineStyle ?? 'solid'
  for (const s of LINE_STYLES) {
    named[`lineStyle:${s}`] = lineStyle === s ? 1 : 0
  }

  return FEATURE_NAMES.map(name => named[name])
}
