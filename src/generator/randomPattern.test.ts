import { describe, expect, it } from 'vitest'
import {
  GENERATOR_BACKGROUND,
  GENERATOR_STRAND_COLOR,
  GENERATOR_VERSION,
  SAMPLER_TUNING,
  sampleRandomPattern,
  tileTypeIdsForTiling,
} from './randomPattern'
import { TILINGS, TILING_NAMES } from '../tilings/index'
import { generateTiling, type Viewport } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { runPIC } from '../pic/index'

const BATCH_SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1)

describe('sampleRandomPattern determinism', () => {
  it('same seed produces identical configs', () => {
    for (const seed of [0, 1, 42, 123456, 0xffffffff]) {
      expect(sampleRandomPattern(seed)).toEqual(sampleRandomPattern(seed))
    }
  })

  it('stamps the seed and generator version on the result', () => {
    const r = sampleRandomPattern(42)
    expect(r.seed).toBe(42)
    expect(r.generatorVersion).toBe(GENERATOR_VERSION)
  })

  it('different seeds produce different configs (overwhelmingly)', () => {
    const seen = new Set(BATCH_SEEDS.map(s => JSON.stringify(sampleRandomPattern(s).config)))
    // A handful of collisions would be a red flag for a broken stream.
    expect(seen.size).toBeGreaterThan(BATCH_SEEDS.length * 0.95)
  })
})

describe('sampleRandomPattern invariants', () => {
  it('every sample respects the tuned ranges and frozen dimensions', () => {
    const t = SAMPLER_TUNING
    for (const seed of BATCH_SEEDS) {
      const { config } = sampleRandomPattern(seed)

      // Substrate: a shipped Gallery tiling, never the Builder.
      expect(TILING_NAMES).toContain(config.tiling.type)
      expect(config.editor).toBeUndefined()

      expect(config.tiling.scale).toBeGreaterThanOrEqual(t.scale.min)
      expect(config.tiling.scale).toBeLessThanOrEqual(t.scale.max)

      // Frozen: neutral colour pair, no Frame.
      expect(config.strand.color).toBe(GENERATOR_STRAND_COLOR)
      expect(config.strand.background).toBe(GENERATOR_BACKGROUND)
      expect(config.frame).toBeUndefined()

      expect(config.strand.width).toBeGreaterThanOrEqual(t.strandWidth.min)
      expect(config.strand.width).toBeLessThanOrEqual(t.strandWidth.max)
      expect(Object.keys(t.lineStyleWeights)).toContain(config.strand.lineStyle)
      expect(typeof config.strand.weave).toBe('boolean')

      // Figure map covers exactly the tiling's tile types.
      const ids = tileTypeIdsForTiling(config.tiling.type)
      expect(Object.keys(config.figures).sort()).toEqual([...ids].sort())

      let anyCurve = false
      for (const fig of Object.values(config.figures)) {
        expect(fig.type).toBe('star')
        expect(fig.contactAngle).toBeGreaterThanOrEqual(t.contactAngle.min)
        expect(fig.contactAngle).toBeLessThanOrEqual(t.contactAngle.max)

        if (!fig.autoLineLength) {
          expect(fig.lineLength).toBeGreaterThanOrEqual(t.lineLength.min)
          expect(fig.lineLength).toBeLessThanOrEqual(t.lineLength.max)
        }

        // Constraint: at least one line kind on.
        expect(fig.edgeLinesEnabled || fig.vertexLinesEnabled).toBe(true)

        // Decoupling only rides on enabled vertex lines.
        if (fig.vertexLinesDecoupled) {
          expect(fig.vertexLinesEnabled).toBe(true)
          expect(fig.vertexContactAngle).toBeGreaterThanOrEqual(t.contactAngle.min)
          expect(fig.vertexContactAngle).toBeLessThanOrEqual(t.contactAngle.max)
        }

        if (fig.curve) {
          anyCurve = true
          expect(fig.curve.enabled).toBe(true)
          expect(fig.curve.points.length).toBeGreaterThanOrEqual(t.curvePoints.min)
          expect(fig.curve.points.length).toBeLessThanOrEqual(t.curvePoints.max)
          for (const p of fig.curve.points) {
            expect(p.position).toBeGreaterThanOrEqual(t.curvePosition.min)
            expect(p.position).toBeLessThanOrEqual(t.curvePosition.max)
            expect(p.offset).toBeGreaterThanOrEqual(t.curveOffset.min)
            expect(p.offset).toBeLessThanOrEqual(t.curveOffset.max)
          }
          expect(['left', 'right']).toContain(fig.curve.direction)
        }
      }

      // smoothTransitions only sampled when a curve exists.
      if (!anyCurve) expect(config.smoothTransitions).toBeUndefined()
      else expect(typeof config.smoothTransitions).toBe('boolean')
    }
  })

  it('samples eventually cover every shipped tiling', () => {
    const seen = new Set(BATCH_SEEDS.map(s => sampleRandomPattern(s).config.tiling.type))
    expect([...seen].sort()).toEqual([...TILING_NAMES].sort())
  })
})

describe('sampleRandomPattern pipeline smoke test', () => {
  it('a batch of samples renders through tiling + PIC without throwing', () => {
    const viewport: Viewport = { x: -250, y: -250, width: 500, height: 500 }
    for (let seed = 1; seed <= 30; seed++) {
      const { config } = sampleRandomPattern(seed)
      const def = TILINGS[config.tiling.type]
      const polygons = def.category === 'rosette-patch'
        ? generateRosettePatch(def, viewport, config.tiling.scale)
        : generateTiling(def, viewport, config.tiling.scale)
      expect(polygons.length).toBeGreaterThan(0)
      const segments = runPIC(polygons, config)
      expect(segments.length).toBeGreaterThan(0)
    }
  })
})
