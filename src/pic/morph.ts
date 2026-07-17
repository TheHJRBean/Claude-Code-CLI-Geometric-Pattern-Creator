import type { FigureConfig, MorphBoundary, MorphConfig, PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * Step 20 (slice 1) — Morph field evaluation (ADR-0009, PATTERN_MORPH_SPEC.md).
 *
 * A Morph interpolates Figure-recipe angles across the canvas in world/Patch
 * space. The scalar field is a distance `d` from the Morph origin (along the
 * direction for linear mode, radial distance for radial mode); the value at a
 * point blends piecewise-linearly between consecutive Morph Boundaries
 * (gradient stops), clamped to the first/last stop's values beyond the band.
 *
 * A stop's *effective* value = the start recipe's value overridden by the
 * stop's partial `FigureConfig` overlay — so a freshly added stop (empty
 * overlay) reproduces the start recipe and adding it changes nothing.
 *
 * v1 interpolates angles only; the overlay schema is full-`FigureConfig`
 * shaped so lengths/curves can land later without migration (slice 3).
 */

/** The `FigureConfig` fields the v1 morph engine reads from stop overlays. */
export type MorphAngleField = 'contactAngle' | 'vertexContactAngle'

/** The morph the render pipeline should apply, or null when there is none
 * (absent, disabled, or no stops — all render identically to no morph). */
export function activeMorph(config: PatternConfig): MorphConfig | null {
  const m = config.morph
  return m && m.enabled && m.boundaries.length > 0 ? m : null
}

/** True when the config renders through the per-edge-θ morph path. Used by
 * the periodic fast-path gate: under a morph every polygon's Figure is
 * genuinely unique, so `<use>`-stamping a base domain would be wrong. */
export function morphActive(config: PatternConfig): boolean {
  return activeMorph(config) !== null
}

/** Scalar field parameter at a world point: distance from the Morph origin —
 * signed along `direction` for linear mode, radial for radial mode. */
export function morphDistance(morph: MorphConfig, p: Vec2): number {
  const dx = p.x - morph.origin.x
  const dy = p.y - morph.origin.y
  if (morph.mode === 'radial') return Math.hypot(dx, dy)
  const dir = morph.direction ?? { x: 1, y: 0 }
  return dx * dir.x + dy * dir.y
}

function effectiveValue(
  b: MorphBoundary,
  tileTypeId: string,
  field: MorphAngleField,
  startValue: number,
): number {
  const overlay = b.figures[tileTypeId] as Partial<FigureConfig> | undefined
  const v = overlay?.[field]
  return typeof v === 'number' ? v : startValue
}

/**
 * Evaluate one overlay field of the morph field at parameter `d`.
 * `startValue` is the start recipe's resolved value for the field (the caller
 * resolves `vertexContactAngle ?? contactAngle` fallbacks — this function
 * never falls across fields). Boundaries must be sorted ascending by
 * `position` (load validation and the reducer both maintain that).
 */
export function morphFieldValue(
  morph: MorphConfig,
  tileTypeId: string,
  field: MorphAngleField,
  startValue: number,
  d: number,
): number {
  const bs = morph.boundaries
  if (bs.length === 0) return startValue
  if (d <= bs[0].position) return effectiveValue(bs[0], tileTypeId, field, startValue)
  const last = bs[bs.length - 1]
  if (d >= last.position) return effectiveValue(last, tileTypeId, field, startValue)
  for (let i = 0; i < bs.length - 1; i++) {
    const b = bs[i + 1]
    if (d > b.position) continue
    const a = bs[i]
    const span = b.position - a.position
    const vb = effectiveValue(b, tileTypeId, field, startValue)
    // Coincident stops: no interior to blend across — the later stop wins.
    if (span <= 1e-9) return vb
    const va = effectiveValue(a, tileTypeId, field, startValue)
    const u = (d - a.position) / span
    return va * (1 - u) + vb * u
  }
  return effectiveValue(last, tileTypeId, field, startValue)
}

/** Evaluate one overlay field at a world point. */
export function morphValueAt(
  morph: MorphConfig,
  tileTypeId: string,
  field: MorphAngleField,
  startValue: number,
  p: Vec2,
): number {
  return morphFieldValue(morph, tileTypeId, field, startValue, morphDistance(morph, p))
}
