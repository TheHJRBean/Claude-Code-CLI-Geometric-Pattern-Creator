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
 * Where several Origins could apply, the one whose **ramp is least advanced**
 * at that point wins — smallest `|d − position| / reach`, among Origins whose
 * active side faces the point. There is no blending and no compounding: one
 * Origin governs each point outright (user decision 2026-07-29).
 *
 * Comparing the *ramp parameter* rather than raw distance is what makes reach
 * claim territory (#49): two Origins hand over where their ramps meet, at
 * `gap · rA / (rA + rB)` from A, so an Origin with 3× its neighbour's reach
 * governs 3× as much of the gap. Equal reaches collapse it to the midpoint —
 * which is exactly what `autoReach` arranges, and what raw-distance
 * nearest-wins used to do unconditionally.
 *
 * Where no Origin's active side faces a point, the base recipe applies
 * unchanged.
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
 * The reach Origin `i` actually uses on the side facing offset `s`.
 *
 * With `autoReach` this is HALF the gap to the adjacent Origin on that side,
 * so neighbouring ramps meet exactly midway and the handover lands on the
 * midpoint (#49). `origins` is sorted ascending by position, so the
 * neighbours are simply `i ∓ 1`. Falls back to the stored `reach` where there
 * is no neighbour on that side, or where the gap is degenerate (coincident
 * Origins) — a zero auto-reach would silently turn the Origin into a hard
 * step, which is not what "meet halfway" should mean.
 *
 * Hot path: called per edge midpoint from `runPIC`, so it stays allocation-free.
 */
export function originReach(origins: readonly MorphOrigin[], i: number, s: number): number {
  const o = origins[i]
  if (!o.autoReach) return o.reach
  const nb = s < 0 ? origins[i - 1] : origins[i + 1]
  if (!nb) return o.reach
  const gap = Math.abs(o.position - nb.position)
  return gap > REACH_EPS ? gap / 2 : o.reach
}

/**
 * How far along its ramp Origin `i` is at `d` — `|d − position| / reach`,
 * unclamped, so it keeps discriminating past the end of the ramp. A
 * zero-reach Origin is fully advanced the instant you leave its line, so it
 * claims no territory against a neighbour that has any reach at all.
 */
function rampParam(origins: readonly MorphOrigin[], i: number, d: number): number {
  const s = d - origins[i].position
  const dist = Math.abs(s)
  if (dist === 0) return 0
  const r = originReach(origins, i, s)
  return r <= REACH_EPS ? Infinity : dist / r
}

/**
 * Index of the Origin governing distance `d`, or -1 when none reaches it.
 *
 * Least-advanced ramp wins, **among Origins whose active side faces `d`**.
 * Restricting the contest to active sides matters: an Origin that only morphs
 * to its left must not shadow a further Origin that really does morph the
 * point on its right. Ties keep the earlier array entry — the array is sorted
 * ascending by position, so that is the lower position. The first active-side
 * candidate is always adopted even at `u = Infinity`, so a lone zero-reach
 * Origin still governs (its hard step is the whole point).
 */
function governingIndex(morph: MorphConfig, d: number): number {
  const os = morph.origins
  let best = -1
  let bestU = Infinity
  for (let i = 0; i < os.length; i++) {
    if (!sideActive(os[i].sides, d - os[i].position)) continue
    const u = rampParam(os, i, d)
    if (best === -1 || u < bestU) {
      best = i
      bestU = u
    }
  }
  return best
}

/** The Origin governing distance `d`, or null when none reaches it. */
export function governingOrigin(morph: MorphConfig, d: number): MorphOrigin | null {
  const i = governingIndex(morph, d)
  return i === -1 ? null : morph.origins[i]
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
  const i = governingIndex(morph, d)
  if (i === -1) return startValue

  const o = morph.origins[i]
  const s = d - o.position
  const dist = Math.abs(s)
  const target = effectiveValue(o, tileTypeId, field, startValue)
  const reach = originReach(morph.origins, i, s)
  // A zero reach is a hard step: base exactly on the line, target off it.
  if (reach <= REACH_EPS) return dist > 0 ? target : startValue
  const u = Math.min(dist / reach, 1)
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
