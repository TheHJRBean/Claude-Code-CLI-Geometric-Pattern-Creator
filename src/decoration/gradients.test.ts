import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import type { ColourRecord } from '../types/editor'
import { defaultGradientStops, gradientPreviewCss, seedGradientSpec } from './gradients'
import { makeVoidFill } from './resolve'
import { buildColourIndex, resolveFill } from './scopes'
import { canonicalPose } from './stamps'

/** Axis-aligned unit-ish rectangle (wider than tall so the canonical pose is
 * symmetry-free and deterministic across congruent copies). */
const rect = (): Vec2[] => [
  { x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 30 }, { x: 0, y: 30 },
]

const rot = (poly: Vec2[], theta: number, t: Vec2): Vec2[] =>
  poly.map(p => ({
    x: Math.cos(theta) * p.x - Math.sin(theta) * p.y + t.x,
    y: Math.sin(theta) * p.x + Math.cos(theta) * p.y + t.y,
  }))

const stops = defaultGradientStops('#123456')

describe('seedGradientSpec', () => {
  it('seeds a linear gradient spanning the canonical box vertically', () => {
    const spec = seedGradientSpec('linear', stops, rect())
    expect(spec).not.toBeNull()
    if (spec?.type !== 'linear') throw new Error('expected linear')
    expect(spec.stops).toEqual(stops)
    // Vertical: same x, spanning the box height (80×30 canonical box).
    expect(spec.start.x).toBeCloseTo(spec.end.x, 6)
    expect(Math.abs(spec.end.y - spec.start.y)).toBeCloseTo(30, 4)
  })

  it('seeds a radial gradient at the canonical box centre', () => {
    const spec = seedGradientSpec('radial', stops, rect())
    if (spec?.type !== 'radial') throw new Error('expected radial')
    expect(spec.radius).toBeCloseTo(40, 4) // max(80, 30) / 2
  })

  it('returns null for a degenerate outline', () => {
    expect(seedGradientSpec('linear', stops, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull()
  })

  it('congruent instances agree on the seeded canonical geometry', () => {
    const a = seedGradientSpec('linear', stops, rect())
    const b = seedGradientSpec('linear', stops, rot(rect(), Math.PI / 3, { x: 40, y: -12 }))
    if (a?.type !== 'linear' || b?.type !== 'linear') throw new Error('expected linear')
    expect(b.start.x).toBeCloseTo(a.start.x, 3)
    expect(b.start.y).toBeCloseTo(a.start.y, 3)
    expect(b.end.x).toBeCloseTo(a.end.x, 3)
    expect(b.end.y).toBeCloseTo(a.end.y, 3)
  })
})

describe('makeVoidFill', () => {
  const spec = seedGradientSpec('linear', stops, rect())!

  it('flat fill carries no pose', () => {
    const f = makeVoidFill(rect(), undefined, { colour: '#abc' })
    expect(f).toEqual({ polygon: rect(), colour: '#abc' })
  })

  it('gradient fill carries the canonical→instance pose', () => {
    const poly = rot(rect(), 0.7, { x: 5, y: 9 })
    const f = makeVoidFill(poly, undefined, { colour: '#abc', gradient: spec })
    expect(f.gradient).toEqual(spec)
    expect(f.pose).toBeDefined()
    // The pose must map the canonical outline back onto this instance.
    const pose = canonicalPose(poly)!
    expect(f.pose).toEqual(pose.toInstance)
    const m = f.pose!
    for (let i = 0; i < pose.points.length; i++) {
      const c = pose.points[i]
      const mapped = { x: m.a * c.x + m.c * c.y + m.e, y: m.b * c.x + m.d * c.y + m.f }
      // The canonical traversal may start at a different vertex — mapped
      // points must land on SOME instance vertex.
      const hit = poly.some(p => Math.hypot(p.x - mapped.x, p.y - mapped.y) < 1e-6)
      expect(hit).toBe(true)
    }
  })

  it('prefers the straight keyPolygon for the pose (curved fields)', () => {
    const straight = rect()
    const curvedish = rect().map(p => ({ ...p })) // stand-in rendered outline
    const f = makeVoidFill(curvedish, straight, { colour: '#abc', gradient: spec })
    expect(f.polygon).toBe(curvedish)
    expect(f.pose).toEqual(canonicalPose(straight)!.toInstance)
  })

  it('degenerate outline falls back to the flat colour', () => {
    const f = makeVoidFill([{ x: 0, y: 0 }, { x: 1, y: 0 }], undefined, { colour: '#abc', gradient: spec })
    expect(f.gradient).toBeUndefined()
    expect(f.colour).toBe('#abc')
  })
})

describe('resolveFill — gradients through the record ladder', () => {
  const spec = seedGradientSpec('radial', stops, rect())!
  const records: ColourRecord[] = [
    { scope: 'congruent', key: 'sigA', colour: '#111', gradient: spec },
    { scope: 'congruent', key: 'sigB', colour: '#222' },
  ]
  const idx = buildColourIndex(records)

  it('returns the gradient alongside the representative colour', () => {
    expect(resolveFill(idx, 'sigA', { x: 0, y: 0 }, null)).toEqual({ colour: '#111', gradient: spec })
    expect(resolveFill(idx, 'sigB', { x: 0, y: 0 }, null)).toEqual({ colour: '#222' })
  })

  it('a finer flat record wins over a coarser gradient record whole', () => {
    const layered = buildColourIndex([
      ...records,
      { scope: 'instance', key: 'sigA@10.00,20.00', colour: '#333' },
    ])
    expect(resolveFill(layered, 'sigA', { x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ colour: '#333' })
  })
})

describe('gradientPreviewCss', () => {
  it('sorts stops and emits percentages', () => {
    const css = gradientPreviewCss([
      { offset: 1, colour: '#eee' },
      { offset: 0, colour: '#111' },
    ])
    expect(css).toBe('linear-gradient(90deg, #111 0.0%, #eee 100.0%)')
  })
})
