import { describe, expect, it } from 'vitest'
import { extractVoids } from './voids'
import type { Vec2 } from '../utils/math'

/**
 * Regression for "voids lose colour at the frame" (2026-06-10).
 *
 * `extractVoids` injects its `bound` polygon's edges as segments so faces close
 * at the boundary. So if the bound clips through a Void, that Void's outline
 * gains the bound edge and its congruent `signature` changes — it stops
 * matching the unclipped (interior) Void of the same shape. That is exactly why
 * the Decoration frame path must NOT pass the frame outline as the extraction
 * bound: a Void straddling the frame would get a frame-edge signature and a
 * user painting the interior class would skip it. This test pins the principle
 * so the bug can't quietly return.
 */
describe('extractVoids: a clipping bound changes a Void signature', () => {
  // A unit-grid of crossing strands enclosing square Voids around the origin.
  function gridSegments(): { from: Vec2; to: Vec2 }[] {
    const segs: { from: Vec2; to: Vec2 }[] = []
    const lo = -30, hi = 30
    for (let k = -30; k <= 30; k += 10) {
      segs.push({ from: { x: k, y: lo }, to: { x: k, y: hi } }) // verticals
      segs.push({ from: { x: lo, y: k }, to: { x: hi, y: k } }) // horizontals
    }
    return segs
  }

  it('an interior square Void and a Void clipped by the bound differ in signature', () => {
    const segs = gridSegments()

    // Loose bound: contains the central Voids whole → they keep their natural
    // square signature.
    const loose: Vec2[] = [{ x: -25, y: -25 }, { x: 25, y: -25 }, { x: 25, y: 25 }, { x: -25, y: 25 }]
    const whole = extractVoids(segs, loose)
    const interiorSig = whole.find(v => {
      const c = centroid(v.polygon)
      return Math.abs(c.x - 5) < 1 && Math.abs(c.y - 5) < 1 // a unit cell centre
    })?.signature
    expect(interiorSig).toBeDefined()

    // Tight bound whose right edge slices through that same cell (x = 7 cuts the
    // [0,10] cell) → the clipped Void gains the bound edge and a new signature.
    const tight: Vec2[] = [{ x: -25, y: -25 }, { x: 7, y: -25 }, { x: 7, y: 25 }, { x: -25, y: 25 }]
    const clipped = extractVoids(segs, tight)
    const clippedSig = clipped.find(v => {
      const c = centroid(v.polygon)
      return c.x > 0 && c.x < 7 && Math.abs(c.y - 5) < 1
    })?.signature
    expect(clippedSig).toBeDefined()
    expect(clippedSig).not.toBe(interiorSig)
  })
})

function centroid(poly: Vec2[]): Vec2 {
  let x = 0, y = 0
  for (const p of poly) { x += p.x; y += p.y }
  return { x: x / poly.length, y: y / poly.length }
}
