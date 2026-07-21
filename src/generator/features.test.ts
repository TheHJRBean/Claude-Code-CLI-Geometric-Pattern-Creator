import { describe, it, expect } from 'vitest'
import { extractFeatures, FEATURE_NAMES, LINE_STYLES } from './features'
import { sampleRandomPattern } from './randomPattern'
import { TILING_NAMES } from '../tilings/index'
import type { PatternConfig } from '../types/pattern'

function featureMap(config: PatternConfig): Record<string, number> {
  const vec = extractFeatures(config)
  return Object.fromEntries(FEATURE_NAMES.map((name, i) => [name, vec[i]]))
}

const baseConfig: PatternConfig = {
  tiling: { type: 'square', scale: 120 },
  figures: {
    '4': {
      type: 'star',
      contactAngle: 60,
      lineLength: 1.0,
      autoLineLength: true,
      edgeLinesEnabled: true,
      vertexLinesEnabled: false,
    },
  },
  strand: { width: 3, color: '#111', background: '#eee', lineStyle: 'solid', weave: false },
}

describe('extractFeatures', () => {
  it('returns one value per FEATURE_NAME, all finite, for sampled configs', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { config } = sampleRandomPattern(seed)
      const vec = extractFeatures(config)
      expect(vec).toHaveLength(FEATURE_NAMES.length)
      for (const v of vec) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('is deterministic for the same config', () => {
    const { config } = sampleRandomPattern(7)
    expect(extractFeatures(config)).toEqual(extractFeatures(config))
  })

  it('one-hot encodes the tiling type', () => {
    const f = featureMap(baseConfig)
    expect(f['tiling:square']).toBe(1)
    const onCount = TILING_NAMES.filter(t => f[`tiling:${t}`] === 1).length
    expect(onCount).toBe(1)
  })

  it('zeroes all tiling slots for an unknown tiling type', () => {
    const f = featureMap({ ...baseConfig, tiling: { type: 'editor', scale: 100 } })
    for (const t of TILING_NAMES) expect(f[`tiling:${t}`]).toBe(0)
  })

  it('one-hot encodes lineStyle and defaults absent lineStyle to solid', () => {
    const f = featureMap({
      ...baseConfig,
      strand: { ...baseConfig.strand, lineStyle: undefined },
    })
    expect(f['lineStyle:solid']).toBe(1)
    const onCount = LINE_STYLES.filter(s => f[`lineStyle:${s}`] === 1).length
    expect(onCount).toBe(1)
  })

  it('aggregates figure recipes across tile types', () => {
    const f = featureMap({
      ...baseConfig,
      figures: {
        a: {
          type: 'star',
          contactAngle: 40,
          lineLength: 0.5,
          autoLineLength: false,
          edgeLinesEnabled: true,
          vertexLinesEnabled: false,
        },
        b: {
          type: 'star',
          contactAngle: 80,
          lineLength: 1.0,
          autoLineLength: true,
          edgeLinesEnabled: false,
          vertexLinesEnabled: true,
          curve: {
            enabled: true,
            points: [
              { position: 0.3, offset: 0.4 },
              { position: 0.7, offset: -0.2 },
            ],
            alternating: true,
          },
        },
      },
    })
    expect(f.contactAngleMean).toBeCloseTo(60)
    expect(f.contactAngleSpread).toBeCloseTo(40)
    expect(f.autoLineLengthFrac).toBeCloseTo(0.5)
    expect(f.lineLengthMean).toBeCloseTo(0.75)
    expect(f.edgeLinesFrac).toBeCloseTo(0.5)
    expect(f.vertexLinesFrac).toBeCloseTo(0.5)
    expect(f.curveFrac).toBeCloseTo(0.5)
    expect(f.curvePointsMean).toBeCloseTo(2)
    expect(f.curveOffsetAbsMean).toBeCloseTo(0.3)
    expect(f.curveAlternatingFrac).toBeCloseTo(1)
  })

  it('represents extra line sets (#42) across tile types', () => {
    const f = featureMap({
      ...baseConfig,
      figures: {
        a: {
          type: 'star',
          contactAngle: 60,
          lineLength: 1.0,
          autoLineLength: true,
          extraSets: [
            { id: 'set-1', kind: 'edge', contactAngle: 45, lineLength: 1.0, autoLineLength: true },
            { id: 'set-2', kind: 'boundary', contactAngle: 50, lineLength: 1.0, autoLineLength: true },
          ],
        },
        b: {
          type: 'star',
          contactAngle: 70,
          lineLength: 1.0,
          autoLineLength: true,
        },
      },
    })
    expect(f.extraSetFrac).toBeCloseTo(0.5) // 1 of 2 figures carries sets
    expect(f.extraSetCountMean).toBeCloseTo(1) // (2 + 0) / 2
    expect(f.extraSetEdgeFrac).toBeCloseTo(0.5)
    expect(f.extraSetBoundaryFrac).toBeCloseTo(0.5)
    expect(f.extraSetVertexFrac).toBeCloseTo(0)
  })

  it('zeroes extra-set features for setless configs', () => {
    const f = featureMap(baseConfig)
    expect(f.extraSetFrac).toBe(0)
    expect(f.extraSetCountMean).toBe(0)
    expect(f.extraSetEdgeFrac).toBe(0)
    expect(f.extraSetVertexFrac).toBe(0)
    expect(f.extraSetBoundaryFrac).toBe(0)
  })

  it('treats absent edgeLinesEnabled as enabled', () => {
    const f = featureMap({
      ...baseConfig,
      figures: {
        '4': { type: 'star', contactAngle: 60, lineLength: 1.0, autoLineLength: true },
      },
    })
    expect(f.edgeLinesFrac).toBe(1)
    expect(f.vertexLinesFrac).toBe(0)
  })

  it('yields zeros (not NaN) for an empty figures map', () => {
    const vec = extractFeatures({ ...baseConfig, figures: {} })
    for (const v of vec) expect(Number.isFinite(v)).toBe(true)
  })
})
