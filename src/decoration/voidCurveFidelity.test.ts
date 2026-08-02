import { describe, it, expect } from 'vitest'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { runPIC } from '../pic/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { extractVoids, pairCurvedOutlines, RENDER_SIMPLIFY_ANGLE_TOL } from './voids'
import { flattenStrandsToSegments } from './flatten'
import { curvedVoids, CURVED_FIELD_BOUND } from './curvedFieldFixture'
import type { PatternConfig } from '../types/pattern'

/**
 * A **gentle** curve must survive into the Void outline that gets DRAWN.
 *
 * `extractVoids` simplifies collinear vertices at 1.5° so a T-junction vertex
 * on a straight edge can't split a congruent class. Right for the identity
 * outline; wrong for the rendered one — a curve of control offset `d` turns
 * ~1.5°·d/0.0525 per flattening chord, so every offset below ~0.05 was
 * simplified straight back to its chords. Measured before the fix, on 4.8.8:
 * offset ≤ 0.05 ⇒ 0/59 un-clipped Voids kept a curved outline, ≥ 0.055 ⇒ 59/59.
 * A sharp cliff, and the strands kept rendering bowed on both sides of it.
 *
 * `pairCurvedOutlines` takes `keyPolygon` AND `signature` from the straight
 * pass, so relaxing the curved pass cannot move a Void's identity — asserted
 * directly below rather than argued.
 */

const OFFSETS = [0.01, 0.02, 0.03, 0.05, 0.055, 0.1, 0.3]

/** Un-clipped Voids whose drawn outline carries more vertices than their
 *  identity outline — i.e. the curve survived extraction. */
function curveKeepers(type: string, offset: number) {
  const all = curvedVoids(type, offset).filter(v => !v.clipped)
  const kept = all.filter(v => v.keyPolygon && v.polygon.length > v.keyPolygon.length)
  return { all, kept }
}

describe('gentle curves survive Void extraction', () => {
  it('keeps a curved outline at an offset well below the old 1.5° cliff', () => {
    const { all, kept } = curveKeepers('4.8.8', 0.03)
    expect(all.length).toBeGreaterThan(10)
    expect(kept.length).toBe(all.length)
  })

  it('has no cliff: every offset from 0.01 up keeps every Void curved', () => {
    for (const offset of OFFSETS) {
      const { all, kept } = curveKeepers('4.8.8', offset)
      expect(all.length).toBeGreaterThan(10)
      expect(kept.length, `4.8.8 @ offset ${offset}`).toBe(all.length)
    }
  })

  it('fixes the mixed case too — one field no longer renders some Voids curved and some flat', () => {
    // 3.6.3.6's shorter triangle edges turn less per chord than its hexagon
    // edges, so at offset 0.01 the fixed tolerance kept 90 of 103 curved and
    // flattened the other 13 — inconsistency inside a single field.
    const { all, kept } = curveKeepers('3.6.3.6', 0.01)
    expect(all.length).toBeGreaterThan(10)
    expect(kept.length).toBe(all.length)
  })

  it('a gentler curve is a smaller deviation, not an absent one', () => {
    // The whole point: the drawn outline must respond to the offset instead of
    // snapping to the chord. Bulge = max distance from a drawn vertex to the
    // identity outline's nearest edge, measured on the same Void class.
    const bulge = (offset: number) => {
      const { kept } = curveKeepers('4.8.8', offset)
      expect(kept.length, `nothing kept a curve at offset ${offset}`).toBeGreaterThan(0)
      const v = kept[0]
      const kp = v.keyPolygon!
      let max = 0
      for (const p of v.polygon) {
        let best = Infinity
        for (let i = 0; i < kp.length; i++) {
          const a = kp[i]
          const b = kp[(i + 1) % kp.length]
          const dx = b.x - a.x, dy = b.y - a.y
          const len2 = dx * dx + dy * dy
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
          best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
        }
        max = Math.max(max, best)
      }
      return max
    }
    const small = bulge(0.02)
    const large = bulge(0.1)
    expect(small).toBeGreaterThan(0.5)
    expect(large).toBeGreaterThan(small * 2)
  })
})

describe('the relaxed tolerance cannot move Void identity', () => {
  it('signature and keyPolygon are byte-identical to the identity-tolerance extraction', () => {
    const type = '4.8.8'
    const offset = 0.03
    const def = TILINGS[type]
    const figures: PatternConfig['figures'] = structuredClone(def.defaultConfig.figures ?? {})
    for (const k of Object.keys(figures)) {
      figures[k] = { ...figures[k], curve: { enabled: true, points: [{ position: 0.5, offset }] } }
    }
    const config: PatternConfig = {
      ...structuredClone(DEFAULT_CONFIG),
      tiling: { type, scale: DEFAULT_CONFIG.tiling.scale },
      figures,
    }
    const segments = runPIC(
      generateTiling(def, { x: -900, y: -700, width: 1800, height: 1400 }, DEFAULT_CONFIG.tiling.scale),
      config,
    )
    const straight = extractVoids(segments, CURVED_FIELD_BOUND)
    const flat = flattenStrandsToSegments(segments, config)

    const relaxed = pairCurvedOutlines(
      straight,
      extractVoids(flat, CURVED_FIELD_BOUND, { simplifyAngleTol: RENDER_SIMPLIFY_ANGLE_TOL }),
    )
    const strict = pairCurvedOutlines(straight, extractVoids(flat, CURVED_FIELD_BOUND))

    expect(relaxed.length).toBe(strict.length)
    expect(relaxed.map(v => v.signature)).toEqual(strict.map(v => v.signature))
    expect(relaxed.map(v => v.keyPolygon)).toEqual(strict.map(v => v.keyPolygon))
    expect(relaxed.map(v => v.area)).toEqual(strict.map(v => v.area))
    // ...while the drawn outlines genuinely differ — otherwise the equality
    // above would be vacuous.
    expect(relaxed.map(v => v.polygon.length)).not.toEqual(strict.map(v => v.polygon.length))
  })
})
