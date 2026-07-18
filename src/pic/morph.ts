import type { FigureConfig, MorphBoundary, MorphConfig, PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * Step 20 (slice 1) — Morph field evaluation (ADR-0009, PATTERN_MORPH_SPEC.md).
 *
 * A Morph interpolates Figure-recipe angles across the canvas in world/Patch
 * space. The scalar field is a distance `d` from the Morph origin (along the
 * direction for linear mode, radial distance for radial mode); the value at a
 * point blends piecewise-linearly between consecutive stops, clamped to the
 * first/last stop's values beyond the band.
 *
 * The stop sequence = the explicit Morph Boundaries plus an IMPLICIT stop at
 * position 0 carrying the start recipe (amended 2026-07-18 — originally the
 * start recipe was only the value stops patch, which made a single Boundary
 * apply uniformly and left the ordinary angle sliders inert while a Morph was
 * active). The Origin line/Centre therefore always holds the live base
 * recipe, one Boundary already yields a real gradient, and an explicit stop
 * placed exactly at 0 replaces the implicit one.
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

  // Merged stop sequence: explicit Boundaries (sorted ascending, invariant
  // maintained by the reducer + load validation) with the implicit Origin
  // stop spliced in at position 0. An explicit stop numerically at 0
  // replaces the implicit one.
  const stops: Array<{ position: number; value: number }> = []
  let implicitPlaced = false
  for (const b of bs) {
    if (!implicitPlaced && b.position >= 0) {
      if (b.position > 1e-9) stops.push({ position: 0, value: startValue })
      implicitPlaced = true
    }
    stops.push({ position: b.position, value: effectiveValue(b, tileTypeId, field, startValue) })
  }
  if (!implicitPlaced) stops.push({ position: 0, value: startValue })

  if (d <= stops[0].position) return stops[0].value
  const last = stops[stops.length - 1]
  if (d >= last.position) return last.value
  for (let i = 0; i < stops.length - 1; i++) {
    const b = stops[i + 1]
    if (d > b.position) continue
    const a = stops[i]
    const span = b.position - a.position
    // Coincident stops: no interior to blend across — the later stop wins.
    if (span <= 1e-9) return b.value
    const u = (d - a.position) / span
    return a.value * (1 - u) + b.value * u
  }
  return last.value
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
