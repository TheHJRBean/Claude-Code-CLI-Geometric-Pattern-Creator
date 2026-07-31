import { describe, it, expect } from 'vitest'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { runPIC } from '../pic/index'
import { runRosettePIC } from '../pic/rosettePatch'
import { DEFAULT_CONFIG } from '../state/defaults'
import { extractVoids } from './voids'
import { nameVoidShapes } from '../export/stampAssets'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * Why bound-cut Voids may not carry decoration identity.
 *
 * `extractVoids` closes the arrangement against a convex bound — the visible
 * viewport rect on the legacy / non-fast paths. Faces straddling it come out
 * CUT, so their outline (hence congruent signature, hence every scope key) is
 * a function of where the bound fell rather than of the pattern.
 *
 * These pin both halves of the consequence on real generate → PIC → extract
 * fields: the cut classes are numerous enough to swamp a shape enumeration,
 * and they do not survive a pan — so any record keyed on one is already dead.
 */

const SCALE = DEFAULT_CONFIG.tiling.scale
const GEN = { x: -2200, y: -1800, width: 4400, height: 3600 }
const BX = 1000, BY = 700

function fieldFor(type: string) {
  const def = TILINGS[type]
  if (!def) throw new Error(`unknown tiling ${type}`)
  // A tiling's Figure recipes come from its own definition — with the wrong
  // keys PIC emits nothing and the whole field reads as "one Void".
  const config: PatternConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    tiling: { type, scale: SCALE },
    figures: structuredClone(def.defaultConfig.figures ?? {}),
  }
  const polygons = def.category === 'rosette-patch'
    ? generateRosettePatch(def, GEN, SCALE)
    : generateTiling(def, GEN, SCALE)
  return def.category === 'rosette-patch'
    ? runRosettePIC(polygons, config)
    : runPIC(polygons, config)
}

const boundAt = (ox: number, oy: number): Vec2[] => [
  { x: ox - BX, y: oy - BY }, { x: ox + BX, y: oy - BY },
  { x: ox + BX, y: oy + BY }, { x: ox - BX, y: oy + BY },
]

/** Signatures of the field at a viewport origin, split by whether the class
 *  has any un-cut member. */
function classesAt(segments: ReturnType<typeof fieldFor>, ox: number, oy: number) {
  const voids = extractVoids(segments, boundAt(ox, oy))
  const interior = new Set(voids.filter(v => !v.clipped).map(v => v.signature))
  const cutOnly = new Set(
    voids.filter(v => v.clipped && !interior.has(v.signature)).map(v => v.signature))
  return { voids, interior, cutOnly }
}

// One Archimedean tiling and one rosette patch — the two generator paths.
const SUBSTRATES = ['4.8.8', 'decagonal-rosette']

describe('Void identity is bound-dependent exactly for cut faces', () => {
  for (const type of SUBSTRATES) {
    it(`${type}: interior classes survive a pan, cut-only classes do not`, () => {
      const segments = fieldFor(type)
      const a = classesAt(segments, 0, 0)
      // A small pan that is not a lattice multiple, so the field slides
      // under the bound rather than re-registering with it.
      const b = classesAt(segments, 37, 23)

      expect(a.interior.size).toBeGreaterThan(0)
      expect(a.cutOnly.size).toBeGreaterThan(0)

      // Every interior class is still there after the pan.
      for (const s of a.interior) expect(b.interior.has(s)).toBe(true)

      // No cut-only class is — this is what makes a record keyed on one dead.
      const survivors = [...a.cutOnly].filter(s => b.cutOnly.has(s) || b.interior.has(s))
      expect(survivors).toEqual([])
    })

    it(`${type}: shape enumeration reports the interior classes only`, () => {
      const { voids, interior, cutOnly } = classesAt(fieldFor(type), 0, 0)
      // The cut classes outnumber the real ones — this is the reported bug
      // ("a ridiculous number of shapes" for a pattern showing a handful).
      expect(cutOnly.size).toBeGreaterThan(interior.size)
      expect(nameVoidShapes(voids)).toHaveLength(interior.size)
    })
  }
})
