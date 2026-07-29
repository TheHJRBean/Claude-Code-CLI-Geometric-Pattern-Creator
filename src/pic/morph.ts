import type { FigureConfig, MorphConfig, MorphOrigin, PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * Step 20 — Morph field evaluation (ADR-0009, PATTERN_MORPH_SPEC.md).
 *
 * A Morph interpolates Figure-recipe angles across the canvas in world/Patch
 * space. The scalar field is a distance `d` from the Morph's axis origin
 * (signed along `direction` for linear mode, radial distance for radial).
 *
 * **Origin model (amended 2026-07-29, #48).** Each Morph **Origin** is a
 * self-contained ramp rather than a stop in a shared sequence:
 *
 * - the Origin's own line/ring holds the **live base recipe** (whatever the
 *   ordinary angle sliders currently say),
 * - its `figures` overlay is the **target**, reached at `position ± reach`
 *   and clamped beyond,
 * - `sides` picks which side(s) the ramp extends into — the other side is
 *   left at the base recipe.
 *
 *       BOTH SIDES                      NEGATIVE SIDE ONLY
 *       target ───╮         ╭───        target ───╮
 *                  ╲       ╱                       ╲
 *       base        ╰──◉──╯             base        ╰──◉────────
 *               P-r    P   P+r                  P-r   P
 *
 * The blend is therefore always continuous at the Origin itself, and `reach`
 * is literally "the distance over which the morph takes place".
 *
 * Where several Origins could apply, the **nearest Origin whose active side
 * faces the point wins** — a hard handover at the midpoint, no blending and
 * no compounding (user decision 2026-07-29). Where no Origin's active side
 * faces a point, the base recipe applies unchanged.
 *
 * This replaces the pre-#48 model (one sorted stop sequence with an implicit
 * base stop spliced in at position 0). That implicit stop is gone: base is
 * now simply the value everywhere no Origin reaches.
 *
 * v1 interpolates angles only; the overlay schema is full-`FigureConfig`
 * shaped so lengths/curves can land later without migration (slice 3, #39).
 */

/** The `FigureConfig` fields the v1 morph engine reads from stop overlays. */
export type MorphAngleField = 'contactAngle' | 'vertexContactAngle'

/** Below this, a `reach` is treated as a hard step at the Origin line. */
const REACH_EPS = 1e-9

/** The morph the render pipeline should apply, or null when there is none
 * (absent, disabled, or no Origins — all render identically to no morph). */
export function activeMorph(config: PatternConfig): MorphConfig | null {
  const m = config.morph
  return m && m.enabled && m.origins.length > 0 ? m : null
}

/** True when the config renders through the per-edge-θ morph path. Used by
 * the periodic fast-path gate: under a morph every polygon's Figure is
 * genuinely unique, so `<use>`-stamping a base domain would be wrong. */
export function morphActive(config: PatternConfig): boolean {
  return activeMorph(config) !== null
}

/** Scalar field parameter at a world point: distance from the Morph's axis
 * origin — signed along `direction` for linear mode, radial for radial. */
export function morphDistance(morph: MorphConfig, p: Vec2): number {
  const dx = p.x - morph.axisOrigin.x
  const dy = p.y - morph.axisOrigin.y
  if (morph.mode === 'radial') return Math.hypot(dx, dy)
  const dir = morph.direction ?? { x: 1, y: 0 }
  return dx * dir.x + dy * dir.y
}

/**
 * Whether an Origin's ramp extends toward a point offset `s = d − position`
 * from it. A point exactly on the line (`s === 0`) counts as on every side —
 * the value there is the base recipe either way, so this only matters when
 * choosing which Origin wins.
 */
export function sideActive(sides: MorphOrigin['sides'], s: number): boolean {
  if (sides === 'both') return true
  return sides === 'negative' ? s <= 0 : s >= 0
}

function effectiveValue(
  o: MorphOrigin,
  tileTypeId: string,
  field: MorphAngleField,
  startValue: number,
): number {
  const overlay = o.figures[tileTypeId] as Partial<FigureConfig> | undefined
  const v = overlay?.[field]
  return typeof v === 'number' ? v : startValue
}

/**
 * The Origin governing distance `d`, or null when none reaches it.
 *
 * "Governing" = nearest by `|d − position|` **among Origins whose active side
 * faces `d`**. Restricting the contest to active sides matters: an Origin
 * that only morphs to its left must not shadow a further Origin that really
 * does morph the point on its right. Ties keep the earlier array entry — the
 * array is sorted ascending by position, so that is the lower position.
 */
export function governingOrigin(morph: MorphConfig, d: number): MorphOrigin | null {
  let best: MorphOrigin | null = null
  let bestDist = Infinity
  for (const o of morph.origins) {
    const s = d - o.position
    if (!sideActive(o.sides, s)) continue
    const dist = Math.abs(s)
    if (dist < bestDist) {
      best = o
      bestDist = dist
    }
  }
  return best
}

/**
 * Evaluate one overlay field of the morph field at parameter `d`.
 * `startValue` is the start recipe's resolved value for the field (the caller
 * resolves `vertexContactAngle ?? contactAngle` fallbacks — this function
 * never falls across fields).
 */
export function morphFieldValue(
  morph: MorphConfig,
  tileTypeId: string,
  field: MorphAngleField,
  startValue: number,
  d: number,
): number {
  const o = governingOrigin(morph, d)
  if (!o) return startValue

  const dist = Math.abs(d - o.position)
  const target = effectiveValue(o, tileTypeId, field, startValue)
  // A zero reach is a hard step: base exactly on the line, target off it.
  if (o.reach <= REACH_EPS) return dist > 0 ? target : startValue
  const u = Math.min(dist / o.reach, 1)
  return startValue * (1 - u) + target * u
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
