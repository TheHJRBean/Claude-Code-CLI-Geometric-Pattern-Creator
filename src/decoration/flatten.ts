import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import { evalQuadratic, evalCubic } from '../utils/math'
import { buildStrands } from '../strand/buildStrands'
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
      let prev = p0
      for (let s = 1; s <= SAMPLES; s++) {
        const t = s / SAMPLES
        const pt = cps.length === 1
          ? evalQuadratic(p0, cps[0], p1, t)
          : evalCubic(p0, cps[0], cps[1], p1, t)
        out.push({ from: prev, to: pt })
        prev = pt
      }
    }
  }
  return out
}
