import { describe, expect, it } from 'vitest'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { runPIC } from '../pic/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import { extractVoids } from './voids'
import { keyVoids, type KeyedVoid } from './resolve'
import { canonicalPose, canonicalSelfMirror, isReflectedPose, type StampTransform } from './stamps'
import { seedGradientSpec } from './gradients'

/**
 * **A gradient painted at the congruent rung must rotate WITH its Voids.**
 *
 * The pose a Void is painted through is `canonicalPose`, and for a symmetric
 * outline several traversals tie for canonical — one per symmetry image. The
 * tie-break decides which, and it used to sort by world angle first. On a
 * **self-mirror-symmetric** shape both handednesses tie, so that sort picked
 * the mirrored traversal wherever it happened to point closer to +x: measured
 * on 3.6.3.6, 104 congruent Voids all posed at the same angle with 52 of them
 * mirrored. The outline is identical under that flip, so the field looked
 * right and the gradient ran backwards on half of it.
 *
 * These run over real generate → PIC → extract fields for the reason
 * `voidMergeProbe` does: a hand-built fixture is symmetric in whatever way
 * you built it, and it is the *mixture* of orientations in a real tiling that
 * exposes a tie-break. The synthetic case below pins the direction of the
 * rule, not its existence.
 */

const SCALE = DEFAULT_CONFIG.tiling.scale
const GEN = { x: -2200, y: -1800, width: 4400, height: 3600 }
const B = 700
const TILINGS_UNDER_TEST = ['4.8.8', '3.12.12', '3.6.3.6', '4.6.12', '3.4.6.4']

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

const bound: Vec2[] = [{ x: -B, y: -B }, { x: B, y: -B }, { x: B, y: B }, { x: -B, y: B }]

/** Interior Voids of a tiling, grouped by congruent signature — the exact set
 *  a `congruent`-rung ("Matching") paint record lands on. */
function congruentGroups(type: string): Map<string, KeyedVoid[]> {
  const vs = keyVoids(extractVoids(fieldFor(type), bound), [], []).filter(v => !v.clipped)
  const groups = new Map<string, KeyedVoid[]>()
  for (const v of vs) {
    const g = groups.get(v.signature) ?? []
    g.push(v)
    groups.set(v.signature, g)
  }
  return new Map([...groups].filter(([, g]) => g.length > 1))
}

const outlineOf = (v: KeyedVoid) => v.keyPolygon ?? v.polygon
const poseOf = (v: KeyedVoid) => canonicalPose(outlineOf(v))!

/** World direction (radians) of a canonical-space unit +x, carried through a
 *  pose — i.e. which way a gradient seeded at 0° actually runs on screen. */
const worldAngle = (t: StampTransform) => Math.atan2(t.b, t.a)

describe('gradient pose consistency across congruent Voids', () => {
  for (const type of TILINGS_UNDER_TEST) {
    it(`${type}: a self-mirror-symmetric Void never poses mirrored`, () => {
      const groups = congruentGroups(type)
      expect(groups.size).toBeGreaterThan(0)
      for (const [sig, g] of groups) {
        const pose0 = poseOf(g[0])
        // Only meaningful where the flip is NOT a real property of the
        // placement: a chiral outline's mirrored instances must stay mirrored.
        if (!canonicalSelfMirror(pose0.points)) continue
        const mirrored = g.filter(v => isReflectedPose(poseOf(v).toInstance)).length
        expect(`${sig} ${mirrored}/${g.length}`).toBe(`${sig} 0/${g.length}`)
      }
    })

    it(`${type}: congruent Voids at the same pose angle get the same gradient direction`, () => {
      for (const g of congruentGroups(type).values()) {
        // Bucket by pose angle AND handedness: instances that pose the same
        // way must paint the same way. Handedness has to be part of the key
        // because a **chiral** Void's mirrored placements are real — they
        // share a pose angle and reverse the axis, correctly. What the
        // 3.6.3.6 regression did was reverse the axis on instances that were
        // not mirrored at all.
        const byPose = new Map<string, number[]>()
        for (const v of g) {
          const pose = poseOf(v)
          // Seeded OFF-AXIS deliberately. A reflected pose flips y, so a
          // gradient seeded along canonical +x survives it unchanged and the
          // bug hides; 45° is the cheapest angle that cannot.
          const spec = seedGradientSpec('linear', [], pose.points, 45)
          if (!spec || spec.type !== 'linear') continue
          const dx = spec.end.x - spec.start.x
          const dy = spec.end.y - spec.start.y
          // Axis in canonical space, carried out through the pose.
          const t = pose.toInstance
          const world = Math.atan2(t.c * dx + t.d * dy, t.a * dx + t.b * dy)
          const key = `${Math.round(worldAngle(t) * 180 / Math.PI)}|${isReflectedPose(t) ? 'm' : '.'}`
          const seen = byPose.get(key) ?? []
          seen.push(world)
          byPose.set(key, seen)
        }
        for (const [key, dirs] of byPose) {
          // Circular spread — a bucket straddling ±180° is 2° wide, not 358.
          const ref = dirs[0]
          const spread = Math.max(...dirs.map(d => Math.abs(Math.atan2(Math.sin(d - ref), Math.cos(d - ref)))))
          // 2° of slack for the float noise in an extracted outline; a
          // mirrored pose would show up here as a reversal, not a wobble.
          expect({ key, tight: spread * 180 / Math.PI <= 2 }).toEqual({ key, tight: true })
        }
      }
    })
  }

  it('a chiral outline still poses mirrored where the placement really is', () => {
    // 4.6.12 carries a congruent group of 96 chiral Voids, half of them
    // genuine mirror images. The fix must not flatten those onto one
    // handedness — the reflection is the shape's own, not the tie-break's.
    const groups = congruentGroups('4.6.12')
    const chiral = [...groups.values()].filter(g => !canonicalSelfMirror(poseOf(g[0]).points))
    expect(chiral.length).toBeGreaterThan(0)
    for (const g of chiral) {
      const mirrored = g.filter(v => isReflectedPose(poseOf(v).toInstance)).length
      expect(mirrored).toBeGreaterThan(0)
      expect(mirrored).toBeLessThan(g.length)
    }
  })

  it('a mirror-symmetric shape rotates its gradient with the placement', () => {
    // Isoceles triangle: one mirror axis, no rotational symmetry, so its
    // unreflected pose is unique and the gradient must track the placement
    // degree for degree. Placed at angles that are NOT multiples of any
    // symmetry of the shape, so a handedness slip would show as a reversal.
    const base: Vec2[] = [{ x: -50, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 120 }]
    const rot = (pts: Vec2[], deg: number): Vec2[] => {
      const a = (deg * Math.PI) / 180
      return pts.map(p => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }))
    }
    const angles = [0, 17, 53, 111, 198, 271, 344]
    const poses = angles.map(d => canonicalPose(rot(base, d))!)
    expect(poses.every(p => !isReflectedPose(p.toInstance))).toBe(true)
    // Every placement is the same shape turned by a known amount, so the
    // pose's world angle must advance by exactly that amount.
    const norm = (d: number) => ((d % 360) + 360) % 360
    const delta = norm((worldAngle(poses[0].toInstance) * 180) / Math.PI)
    for (let i = 0; i < angles.length; i++) {
      const got = norm((worldAngle(poses[i].toInstance) * 180) / Math.PI)
      expect(Math.abs(got - norm(delta + angles[i]))).toBeLessThan(1e-6)
    }
  })
})
