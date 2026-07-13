import { describe, expect, it } from 'vitest'
import { toJSONL } from './datasetExport'
import type { DatasetRecord } from './datasetStore'
import { sampleRandomPattern } from './randomPattern'

function record(id: number, overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  const { seed, generatorVersion, config } = sampleRandomPattern(id)
  return {
    id,
    seed,
    generatorVersion,
    scoreSchemaVersion: 1,
    config,
    score: 4,
    flagged: false,
    timestamp: 1000 + id,
    ...overrides,
  }
}

describe('toJSONL', () => {
  it('produces one JSON object per line, in order', () => {
    const records = [record(1), record(2, { score: null, flagged: true })]
    const lines = toJSONL(records).split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toEqual(records[0])
    expect(JSON.parse(lines[1])).toEqual(records[1])
  })

  it('returns an empty string for an empty dataset', () => {
    expect(toJSONL([])).toBe('')
  })
})
