import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import { evalQuadratic, evalCubic } from '../utils/math'
import { buildStrands, type StrandData } from '../strand/buildStrands'
import { computeCurves, smoothCurves } from '../strand/computeCurves'

/**
 * Step 19.3 (#5) — flatten curved Strands into straight sub-segments for Void
 * extraction, so the Voids follow the *rendered* (Bézier) Ray edges instead of
 * the straight pre-curve `Segment`s. Mirrors StrandLayer's curve pipeline
 * (buildStrands → computeCurves → optional smoothCurves) and samples each
 * curved edge into `SAMPLES` chords.
 *
 * Only call when {@link curvesEnabled}; with curves off the straight segments
 * are already exact (and cheaper for the O(n²) arrangement).
 */
const SAMPLES = 8

export function curvesEnabled(config: PatternConfig): boolean {
  return Object.values(config.figures).some(f =>
    f?.curve?.enabled || f?.vertexCurve?.enabled || f?.extraSets?.some(s => s.curve?.enabled),
  )
}

function sampleCurve(p0: Vec2, cps: Vec2[], p1: Vec2): Vec2[] {
  const pts: Vec2[] = [p0]
  for (let s = 1; s <= SAMPLES; s++) {
    const t = s / SAMPLES
    pts.push(cps.length === 1
      ? evalQuadratic(p0, cps[0], p1, t)
      : evalCubic(p0, cps[0], cps[1], p1, t))
  }
  return pts
}

export function flattenStrandsToSegments(
  segments: Segment[],
  config: PatternConfig,
): { from: Vec2; to: Vec2 }[] {
  const strandData = buildStrands(segments)
  let curved = computeCurves(strandData, segments, config)
  if (config.smoothTransitions) curved = curved.map(smoothCurves)

  const out: { from: Vec2; to: Vec2 }[] = []
  for (const cs of curved) {
    const { points, curves } = cs
    for (let i = 0; i < curves.length; i++) {
      const p0 = points[i]
      const p1 = points[i + 1]
      const cps = curves[i]
      if (!cps || cps.length === 0) {
        out.push({ from: p0, to: p1 })
        continue
      }
      const pts = sampleCurve(p0, cps, p1)
      for (let s = 1; s < pts.length; s++) out.push({ from: pts[s - 1], to: pts[s] })
    }
  }
  return out
}

/**
 * Per-SEGMENT flattened rendered polyline for the Decoration strand Paint
 * hit-test: `result[i]` is the sampled Bézier polyline segment `i` renders
 * with, or `null` when it renders straight. A curved stroke's body deviates
 * from its straight chord by up to ~offset·edgeLen, so chord-distance picks
 * leave dead zones mid-bulge — at a Frame border the clip can leave ONLY the
 * bulge visible, making the whole visible stroke unclickable. Reuses the
 * caller's already-built strand chains (`strandData`) so hit building doesn't
 * re-chain the field.
 */
export function flattenSegmentPolylines(
  segments: Segment[],
  strandData: StrandData[],
  config: PatternConfig,
): (Vec2[] | null)[] {
  let curved = computeCurves(strandData, segments, config)
  if (config.smoothTransitions) curved = curved.map(smoothCurves)
  const out: (Vec2[] | null)[] = new Array(segments.length).fill(null)
  for (let s = 0; s < strandData.length; s++) {
    const { segmentIndices } = strandData[s]
    const { points, curves } = curved[s]
    for (let i = 0; i < curves.length; i++) {
      const cps = curves[i]
      if (!cps || cps.length === 0) continue
      out[segmentIndices[i]] = sampleCurve(points[i], cps, points[i + 1])
    }
  }
  return out
}
