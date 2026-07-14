import type { DatasetRecord } from './datasetStore'
import { extractFeatures, FEATURE_NAMES } from './features'

/**
 * Dataset preprocessing for the taste model (ADR-0007 ML arc).
 *
 * Turns raw `DatasetRecord`s (from IndexedDB via `allRecords()`, or from a
 * JSONL export via `recordsFromJSONL`) into an aligned training matrix.
 * Pure module — no IO, no model.
 */

export interface TrainingDataset {
  /** Column names for `X`, snapshot of `FEATURE_NAMES` at build time.
   * Persist alongside any trained weights (see features.ts). */
  featureNames: readonly string[]
  /** One row per usable record, columns per `featureNames`. */
  X: number[][]
  /** Target scores on the 0–10 scale (schema v1 scores are rescaled). */
  y: number[]
  /** Source record ids, aligned with `X`/`y` rows, for tracing outliers. */
  ids: number[]
}

/**
 * Normalise a record's score to the current 0–10 scale, or null when the
 * record carries no usable score.
 *
 * - v1 records were rated on a 1–5 keypress → mapped linearly onto 0–10
 *   ((s − 1) / 4 × 10), so both eras train together.
 * - v2 records are already 0–10.
 * - Unknown future schema versions are dropped (null) rather than guessed at.
 *
 * `flagged` is orthogonal to the score (F marks "interesting", it doesn't
 * invalidate the rating); flagged-but-never-scored records have `score: null`
 * and drop out here anyway.
 */
export function normalizeScore(record: DatasetRecord): number | null {
  if (record.score === null) return null
  if (record.scoreSchemaVersion === 1) return ((record.score - 1) / 4) * 10
  if (record.scoreSchemaVersion === 2) return record.score
  return null
}

/** Build the training matrix from raw records, dropping unusable ones. */
export function preprocessRecords(records: DatasetRecord[]): TrainingDataset {
  const featureNames = [...FEATURE_NAMES]
  const X: number[][] = []
  const y: number[] = []
  const ids: number[] = []
  for (const record of records) {
    const score = normalizeScore(record)
    if (score === null) continue
    X.push(extractFeatures(record.config))
    y.push(score)
    ids.push(record.id)
  }
  return { featureNames, X, y, ids }
}

/**
 * Parse a JSONL export (`datasetExport.ts::toJSONL`) back into records.
 * Blank and malformed lines are skipped — an offline probe on a hand-edited
 * export shouldn't die on one bad row.
 */
export function recordsFromJSONL(text: string): DatasetRecord[] {
  const records: DatasetRecord[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'config' in parsed &&
        'score' in parsed &&
        'scoreSchemaVersion' in parsed
      ) {
        records.push(parsed as DatasetRecord)
      }
    } catch {
      // skip malformed line
    }
  }
  return records
}

/** Per-column mean/std for z-scoring. Constant columns get std 1 so they
 * standardise to 0 instead of dividing by zero. */
export interface Standardizer {
  mean: number[]
  std: number[]
}

export function fitStandardizer(X: number[][]): Standardizer {
  const cols = X[0]?.length ?? 0
  const n = X.length
  const meanVec = new Array<number>(cols).fill(0)
  for (const row of X) for (let c = 0; c < cols; c++) meanVec[c] += row[c] / n
  const stdVec = new Array<number>(cols).fill(0)
  for (const row of X) for (let c = 0; c < cols; c++) stdVec[c] += (row[c] - meanVec[c]) ** 2 / n
  for (let c = 0; c < cols; c++) {
    stdVec[c] = Math.sqrt(stdVec[c])
    if (stdVec[c] === 0) stdVec[c] = 1
  }
  return { mean: meanVec, std: stdVec }
}

export function applyStandardizer(X: number[][], s: Standardizer): number[][] {
  return X.map(row => row.map((v, c) => (v - s.mean[c]) / s.std[c]))
}
