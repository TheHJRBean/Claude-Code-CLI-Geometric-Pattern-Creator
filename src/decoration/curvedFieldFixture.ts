import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { runPIC } from '../pic/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { extractVoids, pairCurvedOutlines, type VoidRegion } from './voids'
import { flattenStrandsToSegments } from './flatten'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * A real CURVED field of Voids, for tests that need the two-outline case.
 *
 * A Void on a curved field carries `keyPolygon` (the straight outline its
 * signature and canonical pose derive from) alongside `polygon` (the flattened
 * Bézier outline actually drawn). Anything sized to a Void — a stamp canvas, a
 * gradient's extent — has to take its shape from the second while taking its
 * pose from the first, and only a real field exercises the difference. Shared
 * by `stampCurvedGeometry.test.ts` and `gradientCurvedGeometry.test.ts`, which
 * hardened the same seam a month apart.
 *
 * Test-only: nothing in the app imports this.
 */

const SCALE = DEFAULT_CONFIG.tiling.scale
const GEN = { x: -900, y: -700, width: 1800, height: 1400 }

export const CURVED_FIELD_BOUND: Vec2[] = [
  { x: -500, y: -400 }, { x: 500, y: -400 },
  { x: 500, y: 400 }, { x: -500, y: 400 },
]

/** PIC → extract straight + flattened-curve Voids → pair them. `offset` is the
 *  curve control offset applied to every Figure recipe (0.3 bows well clear of
 *  the straight chord). */
export function curvedVoids(type: string, offset: number): VoidRegion[] {
  const def = TILINGS[type]
  const figures: PatternConfig['figures'] = structuredClone(def.defaultConfig.figures ?? {})
  for (const k of Object.keys(figures)) {
    figures[k] = { ...figures[k], curve: { enabled: true, points: [{ position: 0.5, offset }] } }
  }
  const config: PatternConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    tiling: { type, scale: SCALE },
    figures,
  }
  const segments = runPIC(generateTiling(def, GEN, SCALE), config)
  return pairCurvedOutlines(
    extractVoids(segments, CURVED_FIELD_BOUND),
    extractVoids(flattenStrandsToSegments(segments, config), CURVED_FIELD_BOUND),
  )
}
