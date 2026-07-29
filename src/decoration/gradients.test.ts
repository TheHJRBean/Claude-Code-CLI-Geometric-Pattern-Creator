import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import type { ColourRecord } from '../types/editor'
import { angleDeltaDeg, axisAngleDeg, bboxAxisAtAngle, defaultGradientStops, evenlySpacedStops, gradientPreviewCss, pointsBBox, reversedStops, rotateAxisTo, seedFrameGradientSpec, seedGradientSpec, snapAngleDeg, snapPointToAngle, sortedStops } from './gradients'
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

describe('pointsBBox / seedFrameGradientSpec (#45)', () => {
  const box = { minX: -50, minY: 20, maxX: 150, maxY: 120 }

  it('pointsBBox spans the world points; null for degenerate/empty', () => {
    expect(pointsBBox([{ x: -50, y: 20 }, { x: 150, y: 120 }, { x: 0, y: 0 }])).toEqual({ minX: -50, minY: 0, maxX: 150, maxY: 120 })
    expect(pointsBBox([])).toBeNull()
    expect(pointsBBox([{ x: 5, y: 5 }, { x: 5, y: 5 }])).toBeNull()
  })

  it('seeds a vertical linear gradient across the box in WORLD coords, colour→background stops', () => {
    const spec = seedFrameGradientSpec('linear', box, '#c0392b', '#101018')
    if (spec.type !== 'linear') throw new Error('expected linear')
    expect(spec.start).toEqual({ x: 50, y: 20 })  // top-centre
    expect(spec.end).toEqual({ x: 50, y: 120 })   // bottom-centre
    expect(spec.stops).toEqual([{ offset: 0, colour: '#c0392b' }, { offset: 1, colour: '#101018' }])
  })

  it('seeds a radial gradient centred with a half-diagonal radius', () => {
    const spec = seedFrameGradientSpec('radial', box, '#111', '#000')
    if (spec.type !== 'radial') throw new Error('expected radial')
    expect(spec.centre).toEqual({ x: 50, y: 70 })
    expect(spec.radius).toBeCloseTo(Math.hypot(200, 100) / 2, 6)
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

describe('sortedStops', () => {
  it('orders stops by ascending offset without mutating the input', () => {
    // Dragging the "red" stop right of the "white" stop leaves storage in
    // creation order; SVG defs must sort so red actually becomes the end stop
    // (SVG clamps an out-of-order stop rather than reordering it).
    const stored = [
      { offset: 0.5, colour: 'red' },
      { offset: 0, colour: 'white' },
    ]
    const out = sortedStops(stored)
    expect(out.map(s => s.colour)).toEqual(['white', 'red'])
    expect(out.map(s => s.offset)).toEqual([0, 0.5])
    // Input untouched — selection index in the stop bar stays stable.
    expect(stored[0].colour).toBe('red')
  })
})

describe('gradient axis angle (#45/#46 precise-angle control)', () => {
  const box = { minX: 0, minY: 0, maxX: 200, maxY: 100 } // 200×100, centre (100,50)

  it('axisAngleDeg: screen convention 0°→right, 90°→down; normalised 0–359', () => {
    expect(axisAngleDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0)
    expect(axisAngleDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90)
    expect(axisAngleDeg({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(180)
    expect(axisAngleDeg({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(270) // up → 315 for ↗ preset uses -45
  })

  it('bboxAxisAtAngle 0° spans the width (left→right through centre)', () => {
    const { start, end } = bboxAxisAtAngle(box, 0)
    expect(start).toEqual({ x: 0, y: 50 })
    expect(end).toEqual({ x: 200, y: 50 })
    expect(axisAngleDeg(start, end)).toBe(0)
  })

  it('bboxAxisAtAngle 90° spans the height (top→bottom through centre)', () => {
    const { start, end } = bboxAxisAtAngle(box, 90)
    expect(start.x).toBeCloseTo(100, 6)
    expect(start.y).toBeCloseTo(0, 6)
    expect(end.x).toBeCloseTo(100, 6)
    expect(end.y).toBeCloseTo(100, 6)
    expect(axisAngleDeg(start, end)).toBe(90)
  })

  it('bboxAxisAtAngle stays within the bbox and centres on it at an oblique angle', () => {
    const { start, end } = bboxAxisAtAngle(box, 45)
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    expect(mid.x).toBeCloseTo(100, 6)
    expect(mid.y).toBeCloseTo(50, 6)
    // Exits the nearer (top/bottom) sides of the 200×100 box first.
    for (const p of [start, end]) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6)
      expect(p.x).toBeLessThanOrEqual(200 + 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(-1e-6)
      expect(p.y).toBeLessThanOrEqual(100 + 1e-6)
    }
  })

  it('round-trips a typed angle through the axis it produces', () => {
    // `axisAngleDeg` is exact, not rounded, so an axis built at 45° reads back
    // as 44.99999999999999 — compare with a tolerance, never `===`.
    for (const deg of [0, 30, 45, 90, 120, 200, 315, 37.5]) {
      expect(axisAngleDeg(...Object.values(bboxAxisAtAngle(box, deg)) as [Vec2, Vec2])).toBeCloseTo(deg, 9)
    }
  })

  it('keeps fractional degrees instead of quantising them', () => {
    const { start, end } = bboxAxisAtAngle(box, 12.25)
    expect(axisAngleDeg(start, end)).toBeCloseTo(12.25, 9)
  })
})

describe('angleDeltaDeg', () => {
  it('is wrap-aware, so 359° and 1° are 2° apart', () => {
    expect(angleDeltaDeg(359, 1)).toBeCloseTo(2, 9)
    expect(angleDeltaDeg(1, 359)).toBeCloseTo(2, 9)
  })
  it('never exceeds 180°', () => {
    expect(angleDeltaDeg(0, 190)).toBeCloseTo(170, 9)
    expect(angleDeltaDeg(0, 180)).toBeCloseTo(180, 9)
  })
  it('absorbs the float error `===` would trip on', () => {
    // Which angles come back bit-exact from atan2 is platform maths; the
    // contract is that a near-miss still reads as the same angle, so preset
    // highlighting can't flicker off by an ULP.
    expect(angleDeltaDeg(44.99999999999999, 45)).toBeLessThan(1e-6)
    for (const deg of [0, 30, 45, 90, 120, 200, 315]) {
      const { start, end } = bboxAxisAtAngle({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, deg)
      expect(angleDeltaDeg(axisAngleDeg(start, end), deg)).toBeLessThan(1e-6)
    }
  })
})

describe('snapAngleDeg', () => {
  it('snaps to the nearest multiple of the step', () => {
    expect(snapAngleDeg(43, 15)).toBe(45)
    expect(snapAngleDeg(37, 15)).toBe(30)
    expect(snapAngleDeg(-10, 15)).toBe(345) // normalised, not negative
  })
  it('wraps 360 back to 0 rather than reporting an out-of-range angle', () => {
    expect(snapAngleDeg(358, 15)).toBe(0)
  })
  it('is a plain normalise when the step is non-positive', () => {
    expect(snapAngleDeg(400, 0)).toBe(40)
  })
})

describe('rotateAxisTo — the rotate-in-place contract', () => {
  const start = { x: 10, y: 50 }
  const end = { x: 90, y: 50 } // length 80, midpoint (50,50), currently 0°

  it('re-aims the axis to the requested angle', () => {
    const r = rotateAxisTo(start, end, 90)
    expect(axisAngleDeg(r.start, r.end)).toBeCloseTo(90, 9)
  })

  it('preserves length and midpoint — a hand-placed extent survives a typed angle', () => {
    const r = rotateAxisTo(start, end, 217.5)
    expect(Math.hypot(r.end.x - r.start.x, r.end.y - r.start.y)).toBeCloseTo(80, 9)
    expect((r.start.x + r.end.x) / 2).toBeCloseTo(50, 9)
    expect((r.start.y + r.end.y) / 2).toBeCloseTo(50, 9)
  })

  it('is what distinguishes it from bboxAxisAtAngle, which re-spans the box', () => {
    const box = { minX: 0, minY: 0, maxX: 200, maxY: 100 }
    const spanned = bboxAxisAtAngle(box, 0)
    // Same angle from both, but the box version stretches to the full width.
    expect(Math.hypot(spanned.end.x - spanned.start.x, spanned.end.y - spanned.start.y)).toBeCloseTo(200, 9)
    const rotated = rotateAxisTo(start, end, 0)
    expect(Math.hypot(rotated.end.x - rotated.start.x, rotated.end.y - rotated.start.y)).toBeCloseTo(80, 9)
  })

  it('leaves a zero-length axis alone rather than inventing an extent', () => {
    const p = { x: 5, y: 5 }
    expect(rotateAxisTo(p, p, 90)).toEqual({ start: p, end: p })
  })
})

describe('snapPointToAngle — Shift-drag on an axis handle', () => {
  const anchor = { x: 0, y: 0 }

  it('snaps the direction while keeping the drag distance', () => {
    const p = snapPointToAngle(anchor, { x: 100, y: 8 }, 15) // ~4.6° → 0°
    expect(axisAngleDeg(anchor, p)).toBeCloseTo(0, 9)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(100, 8), 9)
  })

  it('reaches the next detent once the drag passes half a step', () => {
    const p = snapPointToAngle(anchor, { x: 100, y: 100 }, 15) // 45° is a detent
    expect(axisAngleDeg(anchor, p)).toBeCloseTo(45, 9)
  })

  it('passes a drag landing on the anchor through untouched (no direction)', () => {
    expect(snapPointToAngle(anchor, anchor, 15)).toEqual(anchor)
  })
})

describe('evenlySpacedStops', () => {
  const atOffsets = (...offsets: number[]) =>
    offsets.map((offset, i) => ({ offset, colour: `#00000${i}` }))

  it('spreads stops at equal intervals spanning the full range', () => {
    const out = evenlySpacedStops(atOffsets(0.1, 0.15, 0.2, 0.9))
    expect(out.map(s => s.offset)).toEqual([0, 1 / 3, 2 / 3, 1])
  })

  it('snaps a 2-stop gradient out to the ends', () => {
    expect(evenlySpacedStops(atOffsets(0.4, 0.5)).map(s => s.offset)).toEqual([0, 1])
  })

  it('keeps left-to-right order when storage order differs', () => {
    // Stored out of offset order (a stop dragged past its neighbour): the
    // right-most stop must still end up at 1, in its own array slot.
    const out = evenlySpacedStops(atOffsets(0.8, 0.1, 0.5))
    expect(out.map(s => s.offset)).toEqual([1, 0, 0.5])
  })

  it('preserves each stop index and colour so the selection stays put', () => {
    const input = atOffsets(0.9, 0.2, 0.4)
    const out = evenlySpacedStops(input)
    expect(out.map(s => s.colour)).toEqual(input.map(s => s.colour))
    expect(input.map(s => s.offset)).toEqual([0.9, 0.2, 0.4]) // input untouched
  })

  it('keeps insertion order for stops sharing an offset', () => {
    const out = evenlySpacedStops(atOffsets(0.5, 0.5, 0.5))
    expect(out.map(s => s.offset)).toEqual([0, 0.5, 1])
  })

  it('is idempotent — spacing an already-even set changes nothing', () => {
    const once = evenlySpacedStops(atOffsets(0.1, 0.7, 0.75, 0.8))
    expect(evenlySpacedStops(once)).toEqual(once)
  })

  it('returns fewer than 2 stops unchanged', () => {
    expect(evenlySpacedStops([])).toEqual([])
    expect(evenlySpacedStops(atOffsets(0.3))).toEqual(atOffsets(0.3))
  })

  it('produces stops already in ascending order for render', () => {
    const out = evenlySpacedStops(atOffsets(0.8, 0.1, 0.5))
    expect(sortedStops(out).map(s => s.colour)).toEqual(['#000001', '#000002', '#000000'])
  })
})

describe('reversedStops', () => {
  const atOffsets = (...offsets: number[]) =>
    offsets.map((offset, i) => ({ offset, colour: `#00000${i}` }))

  it('mirrors every stop end-for-end', () => {
    expect(reversedStops(atOffsets(0, 0.25, 1)).map(s => s.offset)).toEqual([1, 0.75, 0])
  })

  it('swaps which colour is at each end', () => {
    const out = sortedStops(reversedStops(atOffsets(0, 0.3, 1)))
    // The stop that was last (#000002) now leads the gradient.
    expect(out.map(s => s.colour)).toEqual(['#000002', '#000001', '#000000'])
  })

  it('keeps each stop index and colour so the selection stays put', () => {
    const input = atOffsets(0, 0.4, 1)
    const out = reversedStops(input)
    expect(out.map(s => s.colour)).toEqual(input.map(s => s.colour))
    expect(input.map(s => s.offset)).toEqual([0, 0.4, 1]) // input untouched
  })

  it('is an involution — reversing twice restores the original', () => {
    // Exact to within float round-trip noise: 1 - (1 - 0.15) = 0.15000000000000002.
    const input = atOffsets(0, 0.15, 0.62, 1)
    const back = reversedStops(reversedStops(input))
    expect(back.map(s => s.colour)).toEqual(input.map(s => s.colour))
    back.forEach((s, i) => expect(s.offset).toBeCloseTo(input[i].offset, 12))
  })

  it('stays within 0..1 and preserves even spacing', () => {
    const out = reversedStops(evenlySpacedStops(atOffsets(0.2, 0.9, 0.95, 0.99)))
    const offsets = sortedStops(out).map(s => s.offset)
    offsets.forEach((v, i) => expect(v).toBeCloseTo(i / 3, 12))
    expect(offsets.every(v => v >= 0 && v <= 1)).toBe(true)
  })

  it('handles an empty set', () => {
    expect(reversedStops([])).toEqual([])
  })
})
