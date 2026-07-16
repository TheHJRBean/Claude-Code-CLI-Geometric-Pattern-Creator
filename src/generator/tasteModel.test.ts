import { describe, it, expect } from 'vitest'
import {
  MIN_TRAINING_SAMPLES,
  LAMBDA_GRID,
  predictScore,
  predictWithUncertainty,
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
    // Linear signal + mild clamping: r should be near-perfect. All rows are
    // random-sourced (no source field), so both metrics see all 200.
    expect(model!.cv.pearsonR).toBeGreaterThan(0.9)
    expect(model!.cv.randomPearsonR).toBeGreaterThan(0.9)
    expect(model!.cv.randomCount).toBe(200)
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

  it('scores guided-sourced rows out of the honest metric', () => {
    const records = syntheticRecords(120).map((r, i) =>
      i % 2 === 0 ? { ...r, source: 'guided' as const } : r,
    )
    const model = trainTasteModel(records)!
    expect(model.cv.randomCount).toBe(60)
  })

  it('absorbs per-era grading drift in the intercept, keeping r high', () => {
    // Same taste throughout, but era 1 grades a flat 3 points harsher.
    // Pooled naively, that shift is unexplainable noise; era centring
    // absorbs it and the correlation stays near-perfect.
    const records = syntheticRecords(200).map((r, i) =>
      i >= 100
        ? { ...r, era: 1, score: Math.max(0, r.score! - 3) }
        : r,
    )
    const model = trainTasteModel(records)!
    expect(model.cv.randomPearsonR).toBeGreaterThan(0.85)

    // The prediction anchor follows the requested era: era 1's (harsher)
    // intercept sits below era 0's.
    const era0 = trainTasteModel(records, 0)!
    const era1 = trainTasteModel(records, 1)!
    expect(era1.currentEra).toBe(1)
    expect(era1.intercept).toBeLessThan(era0.intercept)
    // Default currentEra = newest era in the data.
    expect(model.currentEra).toBe(1)
  })

  it('a freshly bumped era with no ratings anchors at the global mean', () => {
    const records = syntheticRecords(80)
    const scores = records.map(r => r.score!)
    const globalMean = scores.reduce((s, v) => s + v, 0) / scores.length
    const model = trainTasteModel(records, 5)!
    expect(model.intercept).toBeCloseTo(globalMean, 10)
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
      covInverse: order.map(r => order.map(c => model.covInverse[r][c])),
    }
    expect(predictScore(reordered, config)).toBeCloseTo(baseline, 10)
  })
})

describe('predictWithUncertainty', () => {
  it('matches predictScore and is non-negative', () => {
    const model = trainTasteModel(syntheticRecords(120))!
    const config = sampleRandomPattern(77).config
    const { score, uncertainty } = predictWithUncertainty(model, config)
    expect(score).toBeCloseTo(predictScore(model, config), 10)
    expect(uncertainty).toBeGreaterThanOrEqual(0)
  })

  it('is higher in feature regions the training data never covered', () => {
    const model = trainTasteModel(syntheticRecords(200))!
    const typical = sampleRandomPattern(3).config
    // Scale far outside the sampler band [70, 160] — unseen territory.
    const outlandish = {
      ...typical,
      tiling: { ...typical.tiling, scale: 2000 },
    }
    const near = predictWithUncertainty(model, typical)
    const far = predictWithUncertainty(model, outlandish)
    expect(far.uncertainty).toBeGreaterThan(near.uncertainty)
  })
})
