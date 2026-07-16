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
 * Taste model (ADR-0007 ML arc, tickets #35 + #36) — in-browser ridge
 * regression over `extractFeatures`. Pure module: records in, model artifact
 * out; no IO.
 *
 * The problem is tiny (≈30 features, hundreds of samples) so the closed-form
 * normal-equations solve is instant — the model retrains from IndexedDB every
 * time the Generator opens rather than persisting weights.
 *
 * Score drift (#36): the user's grading hardens as overall quality rises, so
 * a 7 in era 0 ≠ a 7 in era 2. Scores are centred PER ERA (era mean shrunk
 * toward the global mean) and the ridge fits the residuals — old eras keep
 * teaching relative taste while the era term absorbs harshness drift.
 * Prediction adds the CURRENT era's intercept back.
 *
 * Evaluation honesty (#36): guided-sourced rows are best-of-K by an earlier
 * model, so out-of-fold metrics over them flatter it. The headline
 * `cv.randomPearsonR` pools only random-sourced rows; `cv.pearsonR` (all
 * rows) is kept for reference. λ is likewise chosen on random-only RMSE.
 *
 * Exploration (#36): the artifact carries (XᵀX+λI)⁻¹ so guided sampling can
 * price how little the model has seen of a candidate's feature region
 * (leverage) and deliberately explore — see guidedPattern.ts.
 */

/** Below this many scored records `trainTasteModel` returns null — a ridge
 * fit on a handful of rows is noise dressed up as guidance. */
export const MIN_TRAINING_SAMPLES = 30

export const LAMBDA_GRID: readonly number[] = [0.01, 0.1, 1, 10, 100]

const CV_FOLDS = 5

/** Fixed shuffle seed: the CV fold assignment (and thus the reported metrics
 * and picked λ) is deterministic for a given dataset. */
const CV_SHUFFLE_SEED = 0x5eed

/** Era-mean shrinkage: a fresh era's intercept starts at the global mean and
 * earns independence as its sample count grows past this pseudo-count. */
const ERA_SHRINKAGE = 10

export interface TasteModel {
  /** Snapshot of `FEATURE_NAMES` at train time. Prediction re-indexes the
   * live feature vector by these names (features.ts contract), so a model
   * survives tilings being added to the app. */
  featureNames: readonly string[]
  /** Fit on the full training matrix, aligned with `featureNames`. */
  standardizer: Standardizer
  /** Ridge weights over standardized features, aligned with `featureNames`. */
  weights: number[]
  /** The CURRENT era's (shrunk) mean score — what predictions are anchored
   * to. Older eras' harsher/softer anchors are absorbed at train time. */
  intercept: number
  /** Era the intercept was resolved for. */
  currentEra: number
  lambda: number
  nSamples: number
  cv: {
    /** Pooled out-of-fold Pearson r over ALL rows (reference). */
    pearsonR: number
    rmse: number
    /** Same, over random-sourced rows only — the honest learnability probe
     * (guided rows are picked by a model and flatter the metric). */
    randomPearsonR: number
    /** How many out-of-fold rows were random-sourced. */
    randomCount: number
  }
  /** (XsᵀXs + λI)⁻¹ over standardized features — leverage for the guided
   * explore bonus (`predictWithUncertainty`). */
  covInverse: number[][]
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

/** Normal matrix XᵀX + λI (and Xᵀy) over standardized rows. */
function normalEquations(
  Xs: number[][],
  yCentred: number[],
  lambda: number,
): { A: number[][]; b: number[] } {
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
  return { A, b }
}

function invertMatrix(A: number[][]): number[][] {
  const n = A.length
  const columns: number[][] = []
  for (let c = 0; c < n; c++) {
    const copy = A.map(row => [...row])
    const e = new Array<number>(n).fill(0)
    e[c] = 1
    columns.push(solveLinearSystem(copy, e))
  }
  // columns[c][r] is entry (r, c) of the inverse; transpose into row-major.
  return Array.from({ length: n }, (_, r) => columns.map(col => col[r]))
}

/** Per-era mean scores with shrinkage toward the global mean, so a young era
 * doesn't get a wild intercept off a handful of ratings. */
interface EraStats {
  global: number
  byEra: Map<number, { mean: number; n: number }>
}

function fitEraStats(y: number[], eras: number[]): EraStats {
  const byEra = new Map<number, { mean: number; n: number }>()
  for (let i = 0; i < y.length; i++) {
    const s = byEra.get(eras[i]) ?? { mean: 0, n: 0 }
    s.mean = (s.mean * s.n + y[i]) / (s.n + 1)
    s.n += 1
    byEra.set(eras[i], s)
  }
  return { global: mean(y), byEra }
}

/** Shrunk intercept for one era; an era with no training rows (e.g. just
 * bumped by the user) anchors at the global mean. */
function eraIntercept(stats: EraStats, era: number): number {
  const s = stats.byEra.get(era)
  if (!s) return stats.global
  return (s.n * s.mean + ERA_SHRINKAGE * stats.global) / (s.n + ERA_SHRINKAGE)
}

interface FittedRidge {
  standardizer: Standardizer
  weights: number[]
  eraStats: EraStats
}

function fitRidge(X: number[][], y: number[], eras: number[], lambda: number): FittedRidge {
  const standardizer = fitStandardizer(X)
  const Xs = applyStandardizer(X, standardizer)
  const eraStats = fitEraStats(y, eras)
  const residuals = y.map((v, i) => v - eraIntercept(eraStats, eras[i]))
  const { A, b } = normalEquations(Xs, residuals, lambda)
  const weights = solveLinearSystem(A, b)
  return { standardizer, weights, eraStats }
}

function predictRidge(fit: FittedRidge, x: number[], era: number): number {
  const xs = x.map((v, c) => (v - fit.standardizer.mean[c]) / fit.standardizer.std[c])
  return eraIntercept(fit.eraStats, era) + dot(xs, fit.weights)
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
  if (pred.length === 0) return 0
  let s = 0
  for (let i = 0; i < pred.length; i++) s += (pred[i] - actual[i]) ** 2
  return Math.sqrt(s / pred.length)
}

interface CvPool {
  pred: number[]
  actual: number[]
  /** Aligned flag: was this row random-sourced? */
  random: boolean[]
}

/** Pooled out-of-fold predictions for one λ over a fixed fold assignment.
 * Era means are fit on fold-train rows only — no leakage; a val row whose
 * era is absent from the train side anchors at the train global mean. */
function crossValidate(
  X: number[][],
  y: number[],
  eras: number[],
  sources: ('random' | 'guided')[],
  lambda: number,
  folds: number[][],
): CvPool {
  const pool: CvPool = { pred: [], actual: [], random: [] }
  for (const holdout of folds) {
    const holdoutSet = new Set(holdout)
    const trainX: number[][] = []
    const trainY: number[] = []
    const trainEras: number[] = []
    for (let i = 0; i < X.length; i++) {
      if (!holdoutSet.has(i)) {
        trainX.push(X[i])
        trainY.push(y[i])
        trainEras.push(eras[i])
      }
    }
    const fit = fitRidge(trainX, trainY, trainEras, lambda)
    for (const i of holdout) {
      pool.pred.push(predictRidge(fit, X[i], eras[i]))
      pool.actual.push(y[i])
      pool.random.push(sources[i] === 'random')
    }
  }
  return pool
}

function subset(pool: CvPool, keepRandom: boolean): { pred: number[]; actual: number[] } {
  const pred: number[] = []
  const actual: number[] = []
  for (let i = 0; i < pool.pred.length; i++) {
    if (pool.random[i] === keepRandom) {
      pred.push(pool.pred[i])
      actual.push(pool.actual[i])
    }
  }
  return { pred, actual }
}

/**
 * Train the taste model from raw dataset records. Returns null when fewer
 * than `MIN_TRAINING_SAMPLES` records carry a usable score (skips and
 * flagged-only records drop out in preprocessing).
 *
 * `currentEra` anchors the prediction intercept (pass the user's live era —
 * it may be newer than anything in the records); defaults to the newest era
 * seen in the data.
 */
export function trainTasteModel(
  records: DatasetRecord[],
  currentEra?: number,
): TasteModel | null {
  const { featureNames, X, y, eras, sources } = preprocessRecords(records)
  if (X.length < MIN_TRAINING_SAMPLES) return null
  const era = currentEra ?? Math.max(0, ...eras)

  const order = shuffledIndices(X.length)
  const folds: number[][] = Array.from({ length: CV_FOLDS }, () => [])
  order.forEach((idx, pos) => folds[pos % CV_FOLDS].push(idx))

  let bestLambda = LAMBDA_GRID[0]
  let bestErr = Infinity
  let bestCv: TasteModel['cv'] = { pearsonR: 0, rmse: Infinity, randomPearsonR: 0, randomCount: 0 }
  for (const lambda of LAMBDA_GRID) {
    const pool = crossValidate(X, y, eras, sources, lambda, folds)
    const randomOnly = subset(pool, true)
    // λ is picked on the honest subset; when everything is guided-sourced
    // (shouldn't happen, but fail sane) fall back to the full pool.
    const err = randomOnly.pred.length > 0
      ? rmse(randomOnly.pred, randomOnly.actual)
      : rmse(pool.pred, pool.actual)
    if (err < bestErr) {
      bestErr = err
      bestLambda = lambda
      bestCv = {
        pearsonR: pearson(pool.pred, pool.actual),
        rmse: rmse(pool.pred, pool.actual),
        randomPearsonR: pearson(randomOnly.pred, randomOnly.actual),
        randomCount: randomOnly.pred.length,
      }
    }
  }

  const fit = fitRidge(X, y, eras, bestLambda)
  const Xs = applyStandardizer(X, fit.standardizer)
  const residuals = y.map((v, i) => v - eraIntercept(fit.eraStats, eras[i]))
  const { A } = normalEquations(Xs, residuals, bestLambda)
  return {
    featureNames,
    standardizer: fit.standardizer,
    weights: fit.weights,
    intercept: eraIntercept(fit.eraStats, era),
    currentEra: era,
    lambda: bestLambda,
    nSamples: X.length,
    cv: bestCv,
    covInverse: invertMatrix(A),
  }
}

/** Standardized, model-aligned feature vector for one config: re-indexed by
 * the model's own featureNames — features added to the app after training
 * are ignored, features the model knows that have since vanished fall back
 * to their training mean (standardize to 0, contributing nothing). */
function modelVector(model: TasteModel, config: PatternConfig): number[] {
  const live = extractFeatures(config)
  const byName = new Map<string, number>()
  FEATURE_NAMES.forEach((name, i) => byName.set(name, live[i]))
  return model.featureNames.map((name, c) => {
    const v = byName.get(name) ?? model.standardizer.mean[c]
    return (v - model.standardizer.mean[c]) / model.standardizer.std[c]
  })
}

/** Predict a 0–10 taste score for one config, anchored to the current era. */
export function predictScore(model: TasteModel, config: PatternConfig): number {
  return model.intercept + dot(modelVector(model, config), model.weights)
}

/**
 * Predicted score plus an uncertainty (≈ predictive std): cv-RMSE scaled by
 * the config's leverage √(xsᵀ(XᵀX+λI)⁻¹xs) — large in feature regions the
 * training data barely covers. Guided exploration bids
 * `score + explore × uncertainty` (see guidedPattern.ts).
 */
export function predictWithUncertainty(
  model: TasteModel,
  config: PatternConfig,
): { score: number; uncertainty: number } {
  const xs = modelVector(model, config)
  const score = model.intercept + dot(xs, model.weights)
  let leverage = 0
  for (let r = 0; r < xs.length; r++) leverage += xs[r] * dot(model.covInverse[r], xs)
  const sigma = Number.isFinite(model.cv.rmse) ? model.cv.rmse : 1
  return { score, uncertainty: sigma * Math.sqrt(Math.max(0, leverage)) }
}
