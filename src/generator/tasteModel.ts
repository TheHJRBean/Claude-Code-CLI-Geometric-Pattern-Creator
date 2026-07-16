import type { PatternConfig } from '../types/pattern'
import type { DatasetRecord } from './datasetStore'
import { extractFeatures, FEATURE_NAMES } from './features'
import {
  applyStandardizer,
  fitStandardizer,
  preprocessRecords,
  type Standardizer,
} from './preprocess'

/**
 * Taste model (ADR-0007 ML arc, ticket #35) — in-browser ridge regression
 * over `extractFeatures`. Pure module: records in, model artifact out; no IO.
 *
 * The problem is tiny (≈30 features, hundreds of samples) so the closed-form
 * normal-equations solve is instant — the model retrains from IndexedDB every
 * time the Generator opens rather than persisting weights.
 *
 * λ is chosen by k-fold cross-validation over a small grid; the pooled
 * out-of-fold Pearson r / RMSE double as the learnability probe and surface
 * in the Generator UI, so "is my taste learnable yet?" is answered live.
 */

/** Below this many scored records `trainTasteModel` returns null — a ridge
 * fit on a handful of rows is noise dressed up as guidance. */
export const MIN_TRAINING_SAMPLES = 30

export const LAMBDA_GRID: readonly number[] = [0.01, 0.1, 1, 10, 100]

const CV_FOLDS = 5

/** Fixed shuffle seed: the CV fold assignment (and thus the reported metrics
 * and picked λ) is deterministic for a given dataset. */
const CV_SHUFFLE_SEED = 0x5eed

export interface TasteModel {
  /** Snapshot of `FEATURE_NAMES` at train time. Prediction re-indexes the
   * live feature vector by these names (features.ts contract), so a model
   * survives tilings being added to the app. */
  featureNames: readonly string[]
  /** Fit on the full training matrix, aligned with `featureNames`. */
  standardizer: Standardizer
  /** Ridge weights over standardized features, aligned with `featureNames`. */
  weights: number[]
  intercept: number
  lambda: number
  nSamples: number
  /** Pooled out-of-fold metrics at the chosen λ — the learnability probe. */
  cv: { pearsonR: number; rmse: number }
}

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length
}

/** Solve Ax = b in place via Gaussian elimination with partial pivoting.
 * A is square and, for ridge normal equations (XᵀX + λI), always
 * well-conditioned enough for this at λ ≥ 0.01. */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r
    }
    if (pivot !== col) {
      ;[A[col], A[pivot]] = [A[pivot], A[col]]
      ;[b[col], b[pivot]] = [b[pivot], b[col]]
    }
    const diag = A[col][col]
    if (diag === 0) continue // λI keeps this unreachable in practice
    for (let r = col + 1; r < n; r++) {
      const factor = A[r][col] / diag
      if (factor === 0) continue
      for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c]
      b[r] -= factor * b[col]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]
    x[r] = A[r][r] === 0 ? 0 : s / A[r][r]
  }
  return x
}

/** Ridge weights for standardized X and centred y: (XᵀX + λI)w = Xᵀy. */
function ridgeWeights(Xs: number[][], yCentred: number[], lambda: number): number[] {
  const cols = Xs[0]?.length ?? 0
  const A: number[][] = Array.from({ length: cols }, () => new Array<number>(cols).fill(0))
  const b = new Array<number>(cols).fill(0)
  for (let r = 0; r < Xs.length; r++) {
    const row = Xs[r]
    for (let i = 0; i < cols; i++) {
      b[i] += row[i] * yCentred[r]
      for (let j = i; j < cols; j++) A[i][j] += row[i] * row[j]
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < i; j++) A[i][j] = A[j][i]
    A[i][i] += lambda
  }
  return solveLinearSystem(A, b)
}

interface FittedRidge {
  standardizer: Standardizer
  weights: number[]
  intercept: number
}

function fitRidge(X: number[][], y: number[], lambda: number): FittedRidge {
  const standardizer = fitStandardizer(X)
  const Xs = applyStandardizer(X, standardizer)
  const intercept = mean(y)
  const weights = ridgeWeights(Xs, y.map(v => v - intercept), lambda)
  return { standardizer, weights, intercept }
}

function predictRidge(fit: FittedRidge, x: number[]): number {
  const xs = x.map((v, c) => (v - fit.standardizer.mean[c]) / fit.standardizer.std[c])
  return fit.intercept + dot(xs, fit.weights)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledIndices(n: number): number[] {
  const rng = mulberry32(CV_SHUFFLE_SEED)
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}

function pearson(a: number[], b: number[]): number {
  const ma = mean(a)
  const mb = mean(b)
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb)
    va += (a[i] - ma) ** 2
    vb += (b[i] - mb) ** 2
  }
  const denom = Math.sqrt(va * vb)
  return denom === 0 ? 0 : cov / denom
}

function rmse(pred: number[], actual: number[]): number {
  let s = 0
  for (let i = 0; i < pred.length; i++) s += (pred[i] - actual[i]) ** 2
  return Math.sqrt(s / pred.length)
}

/** Pooled out-of-fold predictions for one λ, over a fixed fold assignment. */
function crossValidate(
  X: number[][],
  y: number[],
  lambda: number,
  folds: number[][],
): { pred: number[]; actual: number[] } {
  const pred: number[] = []
  const actual: number[] = []
  for (const holdout of folds) {
    const holdoutSet = new Set(holdout)
    const trainX: number[][] = []
    const trainY: number[] = []
    for (let i = 0; i < X.length; i++) {
      if (!holdoutSet.has(i)) {
        trainX.push(X[i])
        trainY.push(y[i])
      }
    }
    const fit = fitRidge(trainX, trainY, lambda)
    for (const i of holdout) {
      pred.push(predictRidge(fit, X[i]))
      actual.push(y[i])
    }
  }
  return { pred, actual }
}

/**
 * Train the taste model from raw dataset records. Returns null when fewer
 * than `MIN_TRAINING_SAMPLES` records carry a usable score (skips and
 * flagged-only records drop out in preprocessing).
 */
export function trainTasteModel(records: DatasetRecord[]): TasteModel | null {
  const { featureNames, X, y } = preprocessRecords(records)
  if (X.length < MIN_TRAINING_SAMPLES) return null

  const order = shuffledIndices(X.length)
  const folds: number[][] = Array.from({ length: CV_FOLDS }, () => [])
  order.forEach((idx, pos) => folds[pos % CV_FOLDS].push(idx))

  let bestLambda = LAMBDA_GRID[0]
  let bestRmse = Infinity
  let bestCv = { pearsonR: 0, rmse: Infinity }
  for (const lambda of LAMBDA_GRID) {
    const { pred, actual } = crossValidate(X, y, lambda, folds)
    const err = rmse(pred, actual)
    if (err < bestRmse) {
      bestRmse = err
      bestLambda = lambda
      bestCv = { pearsonR: pearson(pred, actual), rmse: err }
    }
  }

  const fit = fitRidge(X, y, bestLambda)
  return {
    featureNames,
    standardizer: fit.standardizer,
    weights: fit.weights,
    intercept: fit.intercept,
    lambda: bestLambda,
    nSamples: X.length,
    cv: bestCv,
  }
}

/**
 * Predict a 0–10 taste score for one config. The live feature vector is
 * re-indexed by the model's own featureNames — features added to the app
 * after training are ignored, features the model knows that have since
 * vanished fall back to their training mean (standardizes to 0, so the
 * weight contributes nothing rather than a spurious offset).
 */
export function predictScore(model: TasteModel, config: PatternConfig): number {
  const live = extractFeatures(config)
  const byName = new Map<string, number>()
  FEATURE_NAMES.forEach((name, i) => byName.set(name, live[i]))
  const x = model.featureNames.map(
    (name, c) => byName.get(name) ?? model.standardizer.mean[c],
  )
  return predictRidge(
    { standardizer: model.standardizer, weights: model.weights, intercept: model.intercept },
    x,
  )
}
