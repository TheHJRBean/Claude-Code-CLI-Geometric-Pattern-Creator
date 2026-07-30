import { describe, it, expect } from 'vitest'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { runPIC } from '../pic/index'
import { runRosettePIC } from '../pic/rosettePatch'
import { DEFAULT_CONFIG } from '../state/defaults'
import { extractVoids } from './voids'
import { colourVoids, keyVoids } from './resolve'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * Decoration on a **legacy substrate** — a pattern with no Builder Patch (a
 * Gallery preset, a Generator sample, any BFS / Taprats tiling).
 *
 * The claim these pin is the one the whole feature rests on: the decoration
 * core (`extractVoids` → `keyVoids` → `colourVoids`) is substrate-agnostic —
 * it takes segments, a bound and world points, and never asks whether a Patch
 * produced them. `usePattern`'s legacy branch feeds it exactly this chain.
 *
 * Also pinned: the two rungs that *degrade* here. Without lattice stamps the
 * `patch` key collapses onto the world centroid (a duplicate of `instance`)
 * and without Cell frames the `cell` key is a constant. `DecorationPanel`
 * withholds both on this substrate; these tests are why.
 */

/** A representative spread: an Archimedean BFS tiling, a Laves tiling, and two
 *  Taprats rosette patches (none of which convert to a Builder Patch). */
const SUBSTRATES = ['4.8.8', 'cairo-pentagonal', 'pentagonal-rosette', 'archimedes-star']

const SCALE = DEFAULT_CONFIG.tiling.scale
const VIEWPORT = { x: -400, y: -400, width: 800, height: 800 }
const BOUND: Vec2[] = [
  { x: -300, y: -300 }, { x: 300, y: -300 },
  { x: 300, y: 300 }, { x: -300, y: 300 },
]

/** The pure half of `usePattern`'s legacy branch: generate → PIC → extract →
 *  key, with the empty stamp/Cell-frame sets that substrate supplies. */
function keyedVoidsFor(type: string) {
  const def = TILINGS[type]
  if (!def) throw new Error(`unknown tiling ${type}`)
  // Same seeding the reducer's SET_TILING_TYPE does — a tiling's Figure
  // recipes come from its own definition, and with the wrong keys PIC emits
  // nothing at all (which reads as "no Voids" rather than as an error).
  const config: PatternConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    tiling: { type, scale: SCALE },
    figures: structuredClone(def.defaultConfig.figures ?? {}),
  }
  const polygons = def.category === 'rosette-patch'
    ? generateRosettePatch(def, VIEWPORT, SCALE)
    : generateTiling(def, VIEWPORT, SCALE)
  const segments = def.category === 'rosette-patch'
    ? runRosettePIC(polygons, config)
    : runPIC(polygons, config)
  return keyVoids(extractVoids(segments, BOUND), [], [])
}

describe('Decoration core over a legacy substrate', () => {
  for (const type of SUBSTRATES) {
    describe(type, () => {
      const keyed = keyedVoidsFor(type)

      it('extracts Voids from a Patch-less PIC field', () => {
        expect(keyed.length).toBeGreaterThan(0)
        for (const v of keyed) expect(v.polygon.length).toBeGreaterThanOrEqual(3)
      })

      it('congruent signatures group repeats, so one record paints a class', () => {
        // A periodic field must repeat: the largest congruent class has more
        // than one member, or `congruent` scope would be a per-shape synonym
        // for `instance` and painting would be a chore.
        const classes = new Map<string, number>()
        for (const v of keyed) classes.set(v.signature, (classes.get(v.signature) ?? 0) + 1)
        const biggest = [...classes.entries()].sort((a, b) => b[1] - a[1])[0]
        expect(biggest[1]).toBeGreaterThan(1)

        const fills = colourVoids(keyed, {
          version: 1,
          strandColours: [],
          voidFills: [{ scope: 'congruent', key: biggest[0], colour: '#c0392b' }],
        })
        expect(fills).toHaveLength(biggest[1])
        for (const f of fills) expect(f.colour).toBe('#c0392b')
      })

      it('an instance record paints exactly the Void clicked', () => {
        const target = keyed[0]
        const fills = colourVoids(keyed, {
          version: 1,
          strandColours: [],
          voidFills: [{ scope: 'instance', key: target.instanceKey, colour: '#1f6f4a' }],
        })
        // Only one Void carries that world centroid — unless a sibling shares
        // it to within KEY_TOL, which would mean two Voids at one point.
        expect(fills).toHaveLength(1)
        expect(fills[0].colour).toBe('#1f6f4a')
      })

      it('the patch rung degenerates to instance and the cell rung to a constant', () => {
        // Why `DecorationPanel` offers neither here: with no lattice and no
        // Cells there is nothing for either to mean. If this ever fails, the
        // substrate grew an orbit and the panel should offer the rung.
        for (const v of keyed) {
          expect(v.patchKey).toBe(v.instanceKey)
          expect(v.cellKey).toBe(`${v.signature}#c?`)
        }
      })
    })
  }
})
