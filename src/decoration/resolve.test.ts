import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import type { DecorationConfig } from '../types/editor'
import { resolveDecoration } from './resolve'
import { extractVoids, voidSignature } from './voids'

const seg = (x1: number, y1: number, x2: number, y2: number) => ({
  from: { x: x1, y: y1 }, to: { x: x2, y: y2 },
})
const boundBox = (W: number): Vec2[] => [
  { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: W }, { x: 0, y: W },
]

const deco = (over: Partial<DecorationConfig> = {}): DecorationConfig => ({
  version: 1, strandColours: [], voidFills: [], ...over,
})

describe('Step 19.2 — resolveDecoration', () => {
  it('absent decoration → empty', () => {
    const r = resolveDecoration([], boundBox(100), undefined)
    expect(r).toEqual({ fills: [], strandColor: null })
  })

  it('resolves the Congruent strand colour (key *)', () => {
    const r = resolveDecoration([], boundBox(100), deco({
      strandColours: [{ scope: 'congruent', key: '*', colour: '#b8860b' }],
    }))
    expect(r.strandColor).toBe('#b8860b')
  })

  it('skips extraction when there are no Fill records', () => {
    // No voidFills ⇒ no extraction ⇒ no fills, even with a rich arrangement.
    const r = resolveDecoration(
      [seg(50, 0, 50, 100), seg(0, 50, 100, 50)],
      boundBox(100),
      deco({ strandColours: [{ scope: 'congruent', key: '*', colour: '#111' }] }),
    )
    expect(r.fills).toEqual([])
    expect(r.strandColor).toBe('#111')
  })

  it('fills every Void congruent to a painted signature', () => {
    // Cross partition → 4 congruent square Voids, all sharing one signature.
    const segs = [seg(50, 0, 50, 100), seg(0, 50, 100, 50)]
    const sig = extractVoids(segs, boundBox(100))[0].signature
    const r = resolveDecoration(segs, boundBox(100), deco({
      voidFills: [{ scope: 'congruent', key: sig, colour: '#1e6b52' }],
    }))
    expect(r.fills.length).toBe(4)
    for (const f of r.fills) {
      expect(f.colour).toBe('#1e6b52')
      expect(f.polygon.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('only paints the matching congruent class, leaves others unfilled', () => {
    // Off-centre line → 2 differently-sized Voids (2 signatures); paint one.
    const segs = [seg(30, 0, 30, 100)]
    const voids = extractVoids(segs, boundBox(100))
    const small = voids.reduce((a, b) => (a.area < b.area ? a : b))
    const r = resolveDecoration(segs, boundBox(100), deco({
      voidFills: [{ scope: 'congruent', key: small.signature, colour: '#7d3c98' }],
    }))
    expect(r.fills.length).toBe(1)
    expect(r.fills[0].colour).toBe('#7d3c98')
    // the painted one is the smaller (≈3000) Void
    const filledArea = polyArea(r.fills[0].polygon)
    expect(filledArea).toBeCloseTo(3000, 0)
  })

  it('ignores non-Congruent (later-stage) records in Stage 1', () => {
    const sig = voidSignature(boundBox(40), 0.5, (0.5 * Math.PI) / 180)
    const r = resolveDecoration([], boundBox(100), deco({
      strandColours: [{ scope: 'patch', key: 'orbit-1', colour: '#abc' }],
      voidFills: [{ scope: 'instance', key: sig, colour: '#def' }],
    }))
    expect(r.strandColor).toBeNull()
    expect(r.fills).toEqual([])
  })
})

function polyArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y
  }
  return Math.abs(a) / 2
}
