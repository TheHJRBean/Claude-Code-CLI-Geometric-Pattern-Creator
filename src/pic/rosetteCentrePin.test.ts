import { describe, it, expect } from 'vitest'
import { runRosettePIC } from './rosettePatch'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { TILINGS } from '../tilings/index'
import type { PatternConfig, FigureConfig } from '../types/pattern'

/**
 * The reported symptom was "the strand comes from the edge to the centre":
 * arms pinned exactly ON the tile centre, identically for every contact angle,
 * so the θ slider did nothing to them.
 *
 * Cause was the old centre-projection cap. On a rhombus every vertex bisector
 * IS a diagonal, so it aims straight at the centre; at the obtuse vertices —
 * which sit close to the centre — the natural tip overshoots for most of the θ
 * range and was clamped exactly onto it. `bisectorTrimDist` now trims against
 * other edges' rays instead wherever such a crossing exists.
 *
 * The invariant worth pinning is RESPONSIVENESS, not "never touches the
 * centre": once two opposite arms overshoot each other there is genuinely
 * nowhere to meet but the middle, and the construction still lands there at
 * high θ. What must not happen is a tip frozen across a wide θ span.
 */

const fig = (contactAngle: number): FigureConfig =>
  ({ type: 'star', contactAngle, lineLength: 1, autoLineLength: true })
const VP = { x: -260, y: -260, width: 520, height: 520 }

describe('rosette figures respond to the contact angle', () => {
  it('pentagonal-rosette rhombi: obtuse-vertex tips move with θ (were frozen on the centre)', () => {
    const def = TILINGS['pentagonal-rosette']
    const polys = generateRosettePatch(def, VP, 100)
    const tile = polys.find(p => p.tileTypeId === '4.2' && Math.hypot(p.center.x, p.center.y) < 150)
    expect(tile).toBeTruthy()

    const tipsAt = (theta: number): number[] => {
      const figures: Record<string, FigureConfig> = {}
      for (const p of polys) figures[p.tileTypeId] = fig(theta)
      return runRosettePIC(polys, { figures } as unknown as PatternConfig)
        .filter(s => s.polygonId === tile!.id)
        .map(s => Math.hypot(s.to.x - tile!.center.x, s.to.y - tile!.center.y))
    }

    const inradius = Math.min(...tile!.vertices.map((v, i) => {
      const w = tile!.vertices[(i + 1) % tile!.vertices.length]
      return Math.hypot((v.x + w.x) / 2 - tile!.center.x, (v.y + w.y) / 2 - tile!.center.y)
    }))

    // Across the band where the old cap saturated, the near tip must sit a real
    // distance off the centre AND move with θ.
    //
    // The threshold is deliberately size-relative rather than `> 0`: the old cap
    // reached the centre through floating-point arithmetic, so it read as
    // 2.0e-14 rather than exactly 0 and sailed straight through a
    // `toBeGreaterThan(0)` check. Anything under ~1% of the inradius is a pin,
    // not a figure.
    const near = [30, 40, 45, 50].map(t => Math.min(...tipsAt(t)))
    for (const v of near) expect(v).toBeGreaterThan(inradius * 0.01)
    expect(new Set(near.map(v => Math.round(v * 100))).size).toBeGreaterThan(1)
  })

  it("archimedes-star's 12-gon no longer collapses half its arms onto the tile centre", () => {
    const def = TILINGS['archimedes-star']
    const polys = generateRosettePatch(def, VP, 100)
    for (const theta of [67.5, 71, 75, 80]) {
      const figures: Record<string, FigureConfig> = {}
      for (const p of polys) figures[p.tileTypeId] = fig(theta)
      const segs = runRosettePIC(polys, { figures } as unknown as PatternConfig)
      for (const p of polys) {
        if (p.sides !== 12 || Math.hypot(p.center.x, p.center.y) > 150) continue
        const own = segs.filter(s => s.polygonId === p.id)
        if (!own.length) continue
        const inradius = Math.min(...p.vertices.map((v, i) => {
          const w = p.vertices[(i + 1) % p.vertices.length]
          return Math.hypot((v.x + w.x) / 2 - p.center.x, (v.y + w.y) / 2 - p.center.y)
        }))
        const atCentre = own.filter(s =>
          Math.hypot(s.to.x - p.center.x, s.to.y - p.center.y) < inradius * 0.06).length
        expect(atCentre, `θ=${theta}: ${atCentre}/${own.length} arms on the centre`).toBe(0)
      }
    }
  })
})
