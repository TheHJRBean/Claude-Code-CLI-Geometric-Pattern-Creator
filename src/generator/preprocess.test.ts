import { describe, it, expect } from 'vitest'
import {
  applyStandardizer,
  fitStandardizer,
  normalizeScore,
  preprocessRecords,
  recordsFromJSONL,
} from './preprocess'
import { FEATURE_NAMES } from './features'
import { toJSONL } from './datasetExport'
import { sampleRandomPattern } from './randomPattern'
import type { DatasetRecord } from './datasetStore'

function makeRecord(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 1,
    seed: 42,
    generatorVersion: 1,
    scoreSchemaVersion: 2,
    config: sampleRandomPattern(42).config,
    score: 7,
    flagged: false,
    timestamp: 1700000000000,
    ...overrides,
  }
}

describe('normalizeScore', () => {
  it('passes v2 scores through unchanged', () => {
    expect(normalizeScore(makeRecord({ score: 0 }))).toBe(0)
    expect(normalizeScore(makeRecord({ score: 10 }))).toBe(10)
  })

  it('rescales v1 (1–5) scores onto 0–10', () => {
    expect(normalizeScore(makeRecord({ scoreSchemaVersion: 1, score: 1 }))).toBe(0)
    expect(normalizeScore(makeRecord({ scoreSchemaVersion: 1, score: 3 }))).toBe(5)
    expect(normalizeScore(makeRecord({ scoreSchemaVersion: 1, score: 5 }))).toBe(10)
  })

  it('returns null for unscored records and unknown schema versions', () => {
    expect(normalizeScore(makeRecord({ score: null }))).toBeNull()
    expect(normalizeScore(makeRecord({ scoreSchemaVersion: 99 }))).toBeNull()
  })
})

describe('preprocessRecords', () => {
  it('builds aligned X/y/ids and drops unusable records', () => {
    const records = [
      makeRecord({ id: 1, score: 8 }),
      makeRecord({ id: 2, score: null, flagged: true }),
      makeRecord({ id: 3, scoreSchemaVersion: 1, score: 5 }),
      makeRecord({ id: 4, scoreSchemaVersion: 99, score: 6 }),
    ]
    const ds = preprocessRecords(records)
    expect(ds.ids).toEqual([1, 3])
    expect(ds.y).toEqual([8, 10])
    expect(ds.X).toHaveLength(2)
    expect(ds.X[0]).toHaveLength(FEATURE_NAMES.length)
    expect(ds.featureNames).toEqual([...FEATURE_NAMES])
  })

  it('keeps flagged records that carry a score', () => {
    const ds = preprocessRecords([makeRecord({ flagged: true, score: 4 })])
    expect(ds.y).toEqual([4])
  })
})

describe('recordsFromJSONL', () => {
  it('round-trips the datasetExport format', () => {
    const records = [makeRecord({ id: 1 }), makeRecord({ id: 2, score: 3 })]
    const parsed = recordsFromJSONL(toJSONL(records))
    expect(parsed).toEqual(records)
  })

  it('skips blank and malformed lines', () => {
    const good = JSON.stringify(makeRecord())
    const text = `\n${good}\nnot json\n{"config": missing}\n\n`
    expect(recordsFromJSONL(text)).toHaveLength(1)
  })

  it('skips rows missing record fields', () => {
    expect(recordsFromJSONL('{"foo": 1}')).toHaveLength(0)
  })
})

describe('standardizer', () => {
  it('z-scores columns and leaves constant columns at 0', () => {
    const X = [
      [1, 5],
      [3, 5],
    ]
    const s = fitStandardizer(X)
    const Z = applyStandardizer(X, s)
    expect(Z[0][0]).toBeCloseTo(-1)
    expect(Z[1][0]).toBeCloseTo(1)
    expect(Z[0][1]).toBe(0)
    expect(Z[1][1]).toBe(0)
  })

  it('handles an empty matrix', () => {
    const s = fitStandardizer([])
    expect(s.mean).toEqual([])
    expect(applyStandardizer([], s)).toEqual([])
  })
})
