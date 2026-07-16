import { describe, it, expect } from 'vitest'
import {
  MIN_TRAINING_SAMPLES,
  LAMBDA_GRID,
  predictScore,
  trainTasteModel,
  type TasteModel,
} from './tasteModel'
import { extractFeatures, FEATURE_NAMES } from './features'
import { sampleRandomPattern } from './randomPattern'
import type { DatasetRecord } from './datasetStore'

/** Records whose score is a known linear function of two real features
 * (contactAngleMean ↑ good, strandWidth ↓ good) plus clamping to 0–10 —
 * a taste the ridge should recover almost exactly. */
function syntheticRecords(count: number): DatasetRecord[] {
  const records: DatasetRecord[] = []
  for (let i = 0; i < count; i++) {
    const config = sampleRandomPattern(i * 7919 + 13).config
    const feats = extractFeatures(config)
    const angle = feats[FEATURE_NAMES.indexOf('contactAngleMean')]
    const width = feats[FEATURE_NAMES.indexOf('strandWidth')]
    // angle ∈ [30, 85] → ~[0, 10]; width ∈ [2, 8] subtracts up to ~3.
    const score = Math.max(0, Math.min(10, (angle - 30) / 5.5 - (width - 2) / 2))
    records.push({
      id: i + 1,
      seed: i,
      generatorVersion: 1,
      scoreSchemaVersion: 2,
      config,
      score,
      flagged: false,
      timestamp: 1700000000000 + i,
    })
  }
  return records
}

describe('trainTasteModel', () => {
  it('returns null below the minimum sample gate', () => {
    expect(trainTasteModel(syntheticRecords(MIN_TRAINING_SAMPLES - 1))).toBeNull()
  })

  it('unscored records do not count toward the gate', () => {
    const records = syntheticRecords(MIN_TRAINING_SAMPLES)
    records[0].score = null
    expect(trainTasteModel(records)).toBeNull()
  })

  it('learns a linear taste with high cross-validated correlation', () => {
    const model = trainTasteModel(syntheticRecords(200))
    expect(model).not.toBeNull()
    expect(model!.nSamples).toBe(200)
    expect(model!.featureNames).toEqual([...FEATURE_NAMES])
    expect(model!.weights).toHaveLength(FEATURE_NAMES.length)
    expect(LAMBDA_GRID).toContain(model!.lambda)
    // Linear signal + mild clamping: r should be near-perfect.
    expect(model!.cv.pearsonR).toBeGreaterThan(0.9)
    expect(model!.cv.rmse).toBeLessThan(1.5)
  })

  it('is deterministic for a given dataset', () => {
    const records = syntheticRecords(80)
    const a = trainTasteModel(records)!
    const b = trainTasteModel(records)!
    expect(a.lambda).toBe(b.lambda)
    expect(a.weights).toEqual(b.weights)
    expect(a.cv).toEqual(b.cv)
  })

  it('reports r=0 rather than NaN on a constant-score dataset', () => {
    const records = syntheticRecords(60).map(r => ({ ...r, score: 5 }))
    const model = trainTasteModel(records)!
    expect(model.cv.pearsonR).toBe(0)
    expect(Number.isFinite(model.cv.rmse)).toBe(true)
  })
})

describe('predictScore', () => {
  it('ranks a preferred config above a disliked one', () => {
    const model = trainTasteModel(syntheticRecords(200))!
    const records = syntheticRecords(40)
    const scored = records.map(r => ({
      actual: r.score!,
      predicted: predictScore(model, r.config),
    }))
    const best = scored.reduce((a, b) => (b.actual > a.actual ? b : a))
    const worst = scored.reduce((a, b) => (b.actual < a.actual ? b : a))
    expect(best.predicted).toBeGreaterThan(worst.predicted)
  })

  it('re-indexes by feature name, tolerating names the app no longer has', () => {
    const model = trainTasteModel(syntheticRecords(200))!
    const config = sampleRandomPattern(999).config
    const baseline = predictScore(model, config)

    // A model trained against a feature that has since vanished: the alien
    // column falls back to its training mean (standardizes to 0), so its
    // weight contributes nothing.
    const alien: TasteModel = {
      ...model,
      featureNames: [...model.featureNames, 'tiling:hyperbolic-7-3'],
      standardizer: {
        mean: [...model.standardizer.mean, 0.5],
        std: [...model.standardizer.std, 0.5],
      },
      weights: [...model.weights, 123],
    }
    expect(predictScore(alien, config)).toBeCloseTo(baseline, 10)
  })

  it('is invariant to feature-column reordering', () => {
    const model = trainTasteModel(syntheticRecords(200))!
    const config = sampleRandomPattern(4242).config
    const baseline = predictScore(model, config)

    const order = model.featureNames.map((_, i) => i).reverse()
    const reordered: TasteModel = {
      ...model,
      featureNames: order.map(i => model.featureNames[i]),
      standardizer: {
        mean: order.map(i => model.standardizer.mean[i]),
        std: order.map(i => model.standardizer.std[i]),
      },
      weights: order.map(i => model.weights[i]),
    }
    expect(predictScore(reordered, config)).toBeCloseTo(baseline, 10)
  })
})
