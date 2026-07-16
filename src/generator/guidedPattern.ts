import { sampleRandomPattern, type GeneratedPattern } from './randomPattern'
import { predictWithUncertainty, type TasteModel } from './tasteModel'

/**
 * Guided sampling (ADR-0007 ML arc, tickets #35 + #36) — best-of-K over the
 * v1 random sampler, scored by the taste model. Guided is a source *option*
 * beside Random (user decision 2026-07-14), never a replacement: every
 * candidate is a legitimate `GeneratedPattern` whose seed reproduces it, so
 * provenance and the determinism contract are untouched.
 *
 * Exploration (#36) is a UCB acquisition: candidates bid
 * `predicted + explore × uncertainty`, where uncertainty is the model's
 * leverage-based predictive std — large exactly in feature regions the
 * training data hasn't covered. `explore = 0` is pure taste (argmax
 * predicted); higher values deliberately steer into unused spaces. This
 * lives HERE, not in the random sampler: Random is already maximum
 * exploration, and widening SAMPLER_TUNING would change the rated universe
 * (GENERATOR_VERSION bump) rather than the model's curiosity.
 */

/** Candidates per guided draw. Large enough that the model's preference
 * shows, small enough that each draw still explores a fresh random batch
 * (variety comes from the batch, not from softmax noise). */
export const GUIDED_CANDIDATES = 16

/** UI slider band for the explore weight. At 2 the bonus can dominate the
 * predicted score for genuinely unseen regions. */
export const EXPLORE_MAX = 2

export interface GuidedPattern {
  sample: GeneratedPattern
  /** The model's 0–10 estimate for the winning candidate — surfaced in the
   * UI so the user can calibrate the model against their own reaction. */
  predictedScore: number
  /** The winner's leverage-based uncertainty (0 ≈ well-charted territory). */
  uncertainty: number
}

/**
 * Draw `candidateSeeds.length` random samples and return the one with the
 * best acquisition value (`predicted + explore × uncertainty`). Callers
 * normally pass fresh random seeds; tests pass fixed ones for determinism.
 */
export function sampleGuidedPattern(
  model: TasteModel,
  candidateSeeds: number[],
  explore = 0,
): GuidedPattern {
  let best: (GuidedPattern & { acquisition: number }) | null = null
  for (const seed of candidateSeeds) {
    const sample = sampleRandomPattern(seed)
    const { score, uncertainty } = predictWithUncertainty(model, sample.config)
    const acquisition = score + explore * uncertainty
    if (best === null || acquisition > best.acquisition) {
      best = { sample, predictedScore: score, uncertainty, acquisition }
    }
  }
  if (best === null) throw new Error('sampleGuidedPattern needs at least one candidate seed')
  return { sample: best.sample, predictedScore: best.predictedScore, uncertainty: best.uncertainty }
}
