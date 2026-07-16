import { describe, it, expect } from 'vitest'
import { sampleGuidedPattern, GUIDED_CANDIDATES } from './guidedPattern'
import { predictScore, type TasteModel } from './tasteModel'
import { FEATURE_NAMES } from './features'
import { sampleRandomPattern } from './randomPattern'

/** Hand-built model that scores purely on contactAngleMean — no training
 * needed to test the candidate-selection mechanics. */
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
    lambda: 1,
    nSamples: 100,
    cv: { pearsonR: 0.5, rmse: 2 },
  }
}

describe('sampleGuidedPattern', () => {
  it('returns the candidate the model scores highest', () => {
    const model = angleLovingModel()
    const seeds = Array.from({ length: GUIDED_CANDIDATES }, (_, i) => i * 31 + 1)
    const guided = sampleGuidedPattern(model, seeds)

    const scores = seeds.map(s => predictScore(model, sampleRandomPattern(s).config))
    expect(guided.predictedScore).toBe(Math.max(...scores))
    expect(seeds).toContain(guided.sample.seed)
    // The winner reproduces from its own seed — provenance intact.
    expect(guided.sample.config).toEqual(sampleRandomPattern(guided.sample.seed).config)
  })

  it('is deterministic in the candidate seeds', () => {
    const model = angleLovingModel()
    const seeds = [5, 6, 7, 8]
    expect(sampleGuidedPattern(model, seeds)).toEqual(sampleGuidedPattern(model, seeds))
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
