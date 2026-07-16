import { describe, it, expect } from 'vitest'
import { sampleGuidedPattern, GUIDED_CANDIDATES, EXPLORE_MAX } from './guidedPattern'
import { predictScore, predictWithUncertainty, type TasteModel } from './tasteModel'
import { FEATURE_NAMES } from './features'
import { sampleRandomPattern } from './randomPattern'

/** Hand-built model that scores purely on contactAngleMean — no training
 * needed to test the candidate-selection mechanics. Identity covInverse
 * gives every feature unit leverage, so uncertainty = rmse · ‖xs‖. */
function angleLovingModel(): TasteModel {
  const idx = FEATURE_NAMES.indexOf('contactAngleMean')
  return {
    featureNames: [...FEATURE_NAMES],
    standardizer: {
      mean: FEATURE_NAMES.map(() => 0),
      std: FEATURE_NAMES.map(() => 1),
    },
    weights: FEATURE_NAMES.map((_, i) => (i === idx ? 0.1 : 0)),
    intercept: 0,
    currentEra: 0,
    lambda: 1,
    nSamples: 100,
    cv: { pearsonR: 0.5, rmse: 2, randomPearsonR: 0.5, randomCount: 100 },
    covInverse: FEATURE_NAMES.map((_, r) =>
      FEATURE_NAMES.map((_, c) => (r === c ? 1 : 0)),
    ),
  }
}

describe('sampleGuidedPattern', () => {
  it('at explore 0 returns the candidate the model scores highest', () => {
    const model = angleLovingModel()
    const seeds = Array.from({ length: GUIDED_CANDIDATES }, (_, i) => i * 31 + 1)
    const guided = sampleGuidedPattern(model, seeds)

    const scores = seeds.map(s => predictScore(model, sampleRandomPattern(s).config))
    expect(guided.predictedScore).toBe(Math.max(...scores))
    expect(seeds).toContain(guided.sample.seed)
    // The winner reproduces from its own seed — provenance intact.
    expect(guided.sample.config).toEqual(sampleRandomPattern(guided.sample.seed).config)
  })

  it('at explore > 0 returns the argmax of score + explore × uncertainty', () => {
    const model = angleLovingModel()
    const seeds = Array.from({ length: GUIDED_CANDIDATES }, (_, i) => i * 53 + 7)
    const explore = EXPLORE_MAX
    const guided = sampleGuidedPattern(model, seeds, explore)

    const bids = seeds.map(s => {
      const { score, uncertainty } = predictWithUncertainty(model, sampleRandomPattern(s).config)
      return { seed: s, bid: score + explore * uncertainty }
    })
    const best = bids.reduce((a, b) => (b.bid > a.bid ? b : a))
    expect(guided.sample.seed).toBe(best.seed)
    // The reported score stays the raw prediction, not the bid.
    expect(guided.predictedScore).toBe(
      predictScore(model, sampleRandomPattern(best.seed).config),
    )
    expect(guided.uncertainty).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic in the candidate seeds', () => {
    const model = angleLovingModel()
    const seeds = [5, 6, 7, 8]
    expect(sampleGuidedPattern(model, seeds, 1)).toEqual(sampleGuidedPattern(model, seeds, 1))
  })

  it('a single candidate wins by default', () => {
    const model = angleLovingModel()
    const guided = sampleGuidedPattern(model, [42])
    expect(guided.sample.seed).toBe(42)
  })

  it('throws on an empty candidate list', () => {
    expect(() => sampleGuidedPattern(angleLovingModel(), [])).toThrow()
  })
})
