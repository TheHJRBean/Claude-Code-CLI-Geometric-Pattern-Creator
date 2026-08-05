import { describe, it, expect } from 'vitest'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { runPIC } from '../pic/index'
import { runRosettePIC } from '../pic/rosettePatch'
import { DEFAULT_CONFIG } from '../state/defaults'
import { buildStrands } from './buildStrands'
import { strandJunctions } from './junctions'
import type { PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'

/**
 * A junction's **arms** are the directions the drawn line work actually leaves
 * it in — the property anything drawn ON the crossing has to be built from.
 *
 * The regression: `StrandVisit.dir` is the *chord* through a crossing, and the
 * twinkle reconstructed its arms as `±dir`. That is exact only where a thread
 * runs straight through, which is a property of **symmetric** fields, not of
 * fields in general. On Cairo pentagonal a thread kinks 15° at its contact
 * points, so every fillet was built against arms ~8° off the strands it
 * claimed to be rounding — visibly crossing over the line work and spiking
 * into open space.
 *
 * These run over real PIC fields, one straight and one bent, because that is
 * the distinction the bug turned on: a unit fixture is symmetric unless you
 * deliberately make it otherwise, and the shipped code passed every one of
 * those while being wrong on half the tilings in the app.
 */

const SCALE = DEFAULT_CONFIG.tiling.scale
const VIEWPORT = { x: -300, y: -300, width: 600, height: 600 }

function fieldFor(type: string) {
  const def = TILINGS[type]
  const config: PatternConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    tiling: { type, scale: SCALE },
    figures: structuredClone(def.defaultConfig.figures ?? {}),
  }
  const rosette = def.category === 'rosette-patch'
  const polygons = rosette
    ? generateRosettePatch(def, VIEWPORT, SCALE)
    : generateTiling(def, VIEWPORT, SCALE)
  const segments = rosette ? runRosettePIC(polygons, config) : runPIC(polygons, config)
  return buildStrands(segments)
}

const ang = (v: Vec2) => Math.atan2(v.y, v.x)
const deg = (r: number) => (r * 180) / Math.PI
function angleBetween(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI)
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

/** Every direction the drawn chains actually leave `point` in. */
function drawnArms(strands: ReturnType<typeof buildStrands>, point: Vec2): Vec2[] {
  const arms: Vec2[] = []
  for (const sd of strands) {
    const pts = sd.points
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(pts[i].x - point.x, pts[i].y - point.y) > 1e-6) continue
      if (i > 0) arms.push({ x: pts[i - 1].x - point.x, y: pts[i - 1].y - point.y })
      if (i + 1 < pts.length) arms.push({ x: pts[i + 1].x - point.x, y: pts[i + 1].y - point.y })
    }
  }
  return arms
}

describe('a junction carries the arms its line work really takes', () => {
  for (const type of ['4.8.8', 'cairo-pentagonal']) {
    it(`${type}: every drawn arm is one of the junction's own`, () => {
      const strands = fieldFor(type)
      const junctions = strandJunctions(strands)
      expect(junctions.length).toBeGreaterThan(20)

      let worst = 0
      for (const j of junctions) {
        const drawn = drawnArms(strands, j.point)
        if (drawn.length < 2) continue
        const carried = j.arms.map(ang)
        for (const arm of drawn) {
          worst = Math.max(worst, Math.min(...carried.map(c => angleBetween(ang(arm), c))))
        }
      }
      // Anything above float noise is a fillet detached from its Strand.
      expect(deg(worst)).toBeLessThan(0.5)
    })
  }

  it('cairo-pentagonal really does bend — the fixture would be vacuous otherwise', () => {
    // If Cairo ever stopped kinking, the test above would pass for the wrong
    // reason and the regression would be unguarded. Pin the premise.
    const strands = fieldFor('cairo-pentagonal')
    const junctions = strandJunctions(strands)
    const bent = junctions.filter(j =>
      j.arms.some((a, i) => j.arms.some((b, k) =>
        k > i && Math.abs(angleBetween(ang(a), ang(b)) - Math.PI) > 0.01)))
    expect(bent.length).toBeGreaterThan(50)
  })

  it('4.8.8 runs straight through, so its arms come in antiparallel pairs', () => {
    const junctions = strandJunctions(fieldFor('4.8.8'))
    for (const j of junctions.slice(0, 40)) {
      expect(j.arms).toHaveLength(j.degree * 2)
      // Each arm has an exact opposite among the others.
      for (const a of j.arms) {
        const opposite = j.arms.some(b => Math.abs(angleBetween(ang(a), ang(b)) - Math.PI) < 1e-6)
        expect(opposite).toBe(true)
      }
    }
  })
})
