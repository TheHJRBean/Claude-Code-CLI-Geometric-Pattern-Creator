import { sampleRandomPattern, type GeneratedPattern } from './randomPattern'
import { predictScore, type TasteModel } from './tasteModel'

/**
 * Guided sampling (ADR-0007 ML arc, ticket #35) — best-of-K over the v1
 * random sampler, scored by the taste model. Guided is a source *option*
 * beside Random (user decision 2026-07-14), never a replacement: every
 * candidate is a legitimate `GeneratedPattern` whose seed reproduces it, so
 * provenance and the determinism contract are untouched.
 */

/** Candidates per guided draw. Large enough that the model's preference
 * shows, small enough that each draw still explores a fresh random batch
 * (variety comes from the batch, not from softmax noise). */
export const GUIDED_CANDIDATES = 16

export interface GuidedPattern {
  sample: GeneratedPattern
  /** The model's 0–10 estimate for the winning candidate — surfaced in the
   * UI so the user can calibrate the model against their own reaction. */
  predictedScore: number
}

/**
 * Draw `candidateSeeds.length` random samples and return the one the model
 * scores highest. Callers normally pass fresh random seeds; tests pass fixed
 * ones for determinism.
 */
export function sampleGuidedPattern(
  model: TasteModel,
  candidateSeeds: number[],
): GuidedPattern {
  let best: GuidedPattern | null = null
  for (const seed of candidateSeeds) {
    const sample = sampleRandomPattern(seed)
    const predictedScore = predictScore(model, sample.config)
    if (best === null || predictedScore > best.predictedScore) {
      best = { sample, predictedScore }
    }
  }
  if (best === null) throw new Error('sampleGuidedPattern needs at least one candidate seed')
  return best
}
