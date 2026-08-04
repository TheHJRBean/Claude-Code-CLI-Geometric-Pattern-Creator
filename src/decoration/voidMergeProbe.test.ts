import { describe, expect, it } from 'vitest'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { runPIC } from '../pic/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import { extractVoids, signedArea } from './voids'
import { keyVoids, colourVoids, type KeyedVoid } from './resolve'
import { resolveVoidStamps } from './stamps'
import { applyVoidMerges, buildVoidMergeRecord, canCombine } from './voidMerge'

/**
 * **Combine** against real generate → PIC → extract fields, rather than the
 * hand-built squares of `voidMerge.test.ts`.
 *
 * Two properties are worth this much setup, because both are what the whole
 * design is FOR and neither shows up on synthetic input:
 *
 * 1. **Durability.** A combine is a record that re-finds its members after
 *    every re-extraction. The test that matters is therefore the same one
 *    `voidsBoundStability` applies to paint: pan the extraction bound and check
 *    the combine still lands, on a field whose Voids are all rebuilt.
 * 2. **Reach.** At the `congruent` rung a single combine is supposed to repeat
 *    everywhere the same pair of shapes meets the same way — including on the
 *    rotated and mirrored copies a real tiling is full of, which is exactly
 *    what a synthetic grid of translated squares cannot exercise.
 */

const SCALE = DEFAULT_CONFIG.tiling.scale
const GEN = { x: -2200, y: -1800, width: 4400, height: 3600 }
const BX = 700, BY = 500

function fieldFor(type: string) {
  const def = TILINGS[type]
  if (!def) throw new Error(`unknown tiling ${type}`)
  const config: PatternConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    tiling: { type, scale: SCALE },
    figures: structuredClone(def.defaultConfig.figures ?? {}),
  }
  return runPIC(generateTiling(def, GEN, SCALE), config)
}

const boundAt = (ox: number, oy: number): Vec2[] => [
  { x: ox - BX, y: oy - BY }, { x: ox + BX, y: oy - BY },
  { x: ox + BX, y: oy + BY }, { x: ox - BX, y: oy + BY },
]

const keyedAt = (segments: ReturnType<typeof fieldFor>, ox: number, oy: number): KeyedVoid[] =>
  keyVoids(extractVoids(segments, boundAt(ox, oy)), [], [])

/** An adjacent pair of interior (un-cut) Voids: two whose outlines union to
 * one connected shape. Returns the pair, preferring one whose members are
 * differently-shaped — an asymmetric anchor makes the combine unambiguous. */
function adjacentPair(voids: KeyedVoid[]): [KeyedVoid, KeyedVoid] | null {
  const interior = voids.filter(v => !v.clipped)
  let fallback: [KeyedVoid, KeyedVoid] | null = null
  for (let i = 0; i < interior.length; i++) {
    for (let j = i + 1; j < interior.length; j++) {
      if (!canCombine([interior[i], interior[j]])) continue
      if (interior[i].signature !== interior[j].signature) return [interior[i], interior[j]]
      fallback ??= [interior[i], interior[j]]
    }
  }
  return fallback
}

const TILINGS_UNDER_TEST = ['4.8.8', '3.6.3.6', '3.4.6.4'] as const

describe('Combine on real PIC fields', () => {
  for (const type of TILINGS_UNDER_TEST) {
    describe(type, () => {
      const segments = fieldFor(type)
      const voids = keyedAt(segments, 0, 0)
      const pair = adjacentPair(voids)

      it('finds an adjacent interior pair to combine', () => {
        expect(pair).not.toBeNull()
      })

      it('fuses the pair into one Void whose area is the sum of its members', () => {
        const rec = buildVoidMergeRecord(pair!, 'instance')!
        const merged = applyVoidMerges(voids, [rec], [])
        const composite = merged.filter(v => v.mergedCount)
        expect(composite).toHaveLength(1)
        expect(composite[0].area).toBeCloseTo(pair![0].area + pair![1].area, 6)
        // The union outline encloses that area too — a stitched-in seam spike
        // would leave the drawn shape smaller than the members' total.
        expect(Math.abs(signedArea(composite[0].polygon)))
          .toBeCloseTo(pair![0].area + pair![1].area, 4)
        // Two members share exactly the edges the union erased.
        expect(composite[0].seams!.length).toBeGreaterThan(0)
        // And the field loses exactly the two Voids it gained one for.
        expect(merged).toHaveLength(voids.length - 1)
      })

      it('repeats a congruent combine across the field', () => {
        const rec = buildVoidMergeRecord(pair!, 'congruent')!
        const merged = applyVoidMerges(voids, [rec], [])
        const composites = merged.filter(v => v.mergedCount === 2)
        // A periodic field of this size holds many copies of any interior
        // pair; one is what an instance-rung combine would have given.
        expect(composites.length).toBeGreaterThan(1)
        // Every composite is congruent to every other — that is what makes a
        // downstream `congruent` paint reach the whole set.
        expect(new Set(composites.map(v => v.signature)).size).toBe(1)
      })

      it('survives a pan of the extraction bound', () => {
        // The durability property: re-extract at a different origin (every
        // Void object is new, and the bound cuts a different set of faces)
        // and the same record must still find its group.
        const rec = buildVoidMergeRecord(pair!, 'congruent')!
        const before = applyVoidMerges(voids, [rec], []).filter(v => v.mergedCount).length
        expect(before).toBeGreaterThan(0)
        const panned = keyedAt(segments, 37, 23)
        const after = applyVoidMerges(panned, [rec], []).filter(v => v.mergedCount).length
        expect(after).toBeGreaterThan(0)
      })

      it('paints, gradients and stamps as one shape', () => {
        const rec = buildVoidMergeRecord(pair!, 'instance')!
        const merged = applyVoidMerges(voids, [rec], [])
        const composite = merged.find(v => v.mergedCount)!
        const image = 'data:image/png;base64,iVBORw0KGgo='
        const decoration = {
          version: 1 as const,
          strandColours: [],
          voidFills: [{ scope: 'congruent' as const, key: composite.signature, colour: '#123456' }],
          voidStamps: [{
            scope: 'congruent' as const,
            key: composite.signature,
            image,
            width: 10,
            height: 10,
            fit: 'cover' as const,
          }],
        }
        // One fill covering the union.
        const fills = colourVoids(merged, decoration)
        expect(fills).toHaveLength(1)
        expect(Math.abs(signedArea(fills[0].polygon)))
          .toBeCloseTo(pair![0].area + pair![1].area, 4)
        // The seams ride on the Void, not on the fill: they erase the Rays
        // dividing the group, which has to hold whether or not it is painted.
        expect(composite.seams!.length).toBeGreaterThan(0)
        // One stamp, clipped to the union rather than to either member.
        const stamps = resolveVoidStamps(merged, decoration.voidStamps)
        expect(stamps).toHaveLength(1)
        expect(Math.abs(signedArea(stamps[0].clip)))
          .toBeCloseTo(pair![0].area + pair![1].area, 4)
        // Neither member's own signature paints any more — they are gone.
        for (const m of pair!) {
          expect(merged.some(v => v.instanceKey === m.instanceKey)).toBe(false)
        }
      })
    })
  }
})
