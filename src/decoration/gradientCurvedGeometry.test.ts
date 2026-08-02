import { describe, it, expect } from 'vitest'
import { curvedVoids } from './curvedFieldFixture'
import { canonicalPose, stampGeometry, toCanonicalPoint, poseBBox } from './stamps'
import { defaultGradientStops, gradientCanonicalBox, seedGradientSpec } from './gradients'
import type { VoidRegion } from './voids'
import type { Vec2 } from '../utils/math'

/**
 * Gradient geometry on a CURVED field — the sibling of
 * `stampCurvedGeometry.test.ts`.
 *
 * A per-shape Void gradient is stored in the canonical pose of the STRAIGHT
 * outline (so it replicates onto every congruent instance) but is painted into
 * the CURVED one (`makeVoidFill` fills `polygon`, poses by `keyPolygon`). Its
 * *extent* was seeded from the straight box, so the wash was sized to a shape
 * that is not the one it lands in: outward curves pushed the drawn shape past
 * the axis (bands of flat end-colour at the bulges), inward curves left the
 * axis over-spanning (the end stops never reached).
 *
 * The pose must stay on the straight outline — a flattened Bézier's chord
 * lengths and shallow joint angles cannot rank reliably through
 * `canonicalPose`'s quantisation, so posing off the curve would let sibling
 * instances pick different traversals.
 */

const STOPS = defaultGradientStops('#c0392b')

/** A Void with both outlines, away from the extraction bound. */
function curvedSample(type: string, offset: number): VoidRegion {
  const v = curvedVoids(type, offset).find(x => x.keyPolygon && !x.clipped)
  if (!v) throw new Error(`no un-cut curved Void for ${type} @ ${offset}`)
  return v
}

/** The rendered outline carried into the identity outline's canonical frame —
 *  the coordinates the stored gradient geometry is expressed in. */
function renderedInCanonicalFrame(v: VoidRegion): Vec2[] {
  const pose = canonicalPose(v.keyPolygon!)!
  return v.polygon.map(p => toCanonicalPoint(pose.toInstance, p))
}

/** Where `p` falls along the axis: 0 at `start`, 1 at `end`. Outside [0,1] is
 *  the clamped flat end-colour. */
function axisParam(start: Vec2, end: Vec2, p: Vec2): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return ((p.x - start.x) * dx + (p.y - start.y) * dy) / (dx * dx + dy * dy)
}

/** Un-cut curved Voids grouped by congruent signature, classes of 2+ only. */
function congruentGroups(voids: VoidRegion[]): Map<string, VoidRegion[]> {
  const bySig = new Map<string, VoidRegion[]>()
  for (const v of voids) {
    if (!v.keyPolygon || v.clipped) continue
    const list = bySig.get(v.signature) ?? []
    list.push(v)
    bySig.set(v.signature, list)
  }
  for (const [k, g] of bySig) if (g.length < 2) bySig.delete(k)
  return bySig
}

/**
 * Worst fraction of the axis that the class's drawn shapes fall outside, over
 * every choice of which instance seeded the single stored spec. 0 = every
 * instance fully spanned whichever one was clicked.
 */
function worstClassOverrun(group: VoidRegion[], angleDeg: number, useRendered: boolean): number {
  let worst = 0
  for (const rep of group) {
    const spec = seedGradientSpec(
      'linear', STOPS, rep.keyPolygon!, angleDeg, useRendered ? rep.polygon : undefined,
    )!
    if (spec.type !== 'linear') continue
    for (const v of group) {
      for (const p of renderedInCanonicalFrame(v)) {
        const t = axisParam(spec.start, spec.end, p)
        worst = Math.max(worst, -t, t - 1)
      }
    }
  }
  return worst
}

describe('per-shape gradient seeding on a curved field', () => {
  it('spans the shape it is painted into, not the straight outline', () => {
    // 4.8.8 at offset 0.3 bows OUTWARD: the drawn shape used to reach past
    // both ends of the seeded axis, so the outermost curve of every instance
    // rendered as flat first/last-stop colour.
    // Every un-cut curved Void in three fields, not a sample.
    //
    // Axis-aligned angles only: `bboxAxisAtAngle` deliberately stops the axis
    // where it EXITS the box (pinned in `gradients.test.ts`), so at oblique
    // angles a corner of a non-square box projects past the axis by design —
    // see the oblique test below.
    let checked = 0
    for (const [type, offset] of [['4.8.8', 0.3], ['3.6.3.6', 0.3], ['4.8.8', 0.15]] as const) {
      for (const v of curvedVoids(type, offset)) {
        if (!v.keyPolygon || v.clipped) continue
        for (const angle of [90, 0]) {
          const spec = seedGradientSpec('linear', STOPS, v.keyPolygon, angle, v.polygon)!
          expect(spec.type).toBe('linear')
          if (spec.type !== 'linear') continue
          for (const p of renderedInCanonicalFrame(v)) {
            const t = axisParam(spec.start, spec.end, p)
            expect(t).toBeGreaterThanOrEqual(-1e-6)
            expect(t).toBeLessThanOrEqual(1 + 1e-6)
          }
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('at an OBLIQUE angle the shape still overruns the axis — by design, not by curve', () => {
    // Not a curved-field defect and not fixed here: `bboxAxisAtAngle` spans the
    // box's chord at the requested angle and stops where it exits, so on a
    // non-square box an off-axis corner projects past the end and renders flat
    // end-stop colour. Independent of curves — a straight rectangle does it
    // too, which is what this pins. Widening it to the box's projection span
    // would change every Fit and the frame/strand washes, so it needs a
    // deliberate call rather than riding along with the curve fix.
    const wide = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 60 }, { x: 0, y: 60 }]
    const spec = seedGradientSpec('linear', STOPS, wide, 37.5)!
    if (spec.type !== 'linear') throw new Error('expected linear')
    const pose = canonicalPose(wide)!
    const ts = wide.map(p => axisParam(spec.start, spec.end, toCanonicalPoint(pose.toInstance, p)))
    expect(Math.max(...ts)).toBeGreaterThan(1)
  })

  it('reaches both ends of the shape — the axis is not left over-spanning', () => {
    // The other half of "spans": an inward curve made the straight-box axis
    // too long, so the end stops sat outside the shape and never rendered.
    // Derived from the rendered outline itself, independently of the spec.
    for (const [type, offset] of [['4.8.8', 0.3], ['3.6.3.6', 0.3]] as const) {
      const v = curvedSample(type, offset)
      const spec = seedGradientSpec('linear', STOPS, v.keyPolygon!, 90, v.polygon)!
      if (spec.type !== 'linear') continue
      const ts = renderedInCanonicalFrame(v).map(p => axisParam(spec.start, spec.end, p))
      expect(Math.min(...ts)).toBeLessThan(0.02)
      expect(Math.max(...ts)).toBeGreaterThan(0.98)
    }
  })

  it('the radial radius is sized to the rendered shape', () => {
    const v = curvedSample('4.8.8', 0.3)
    const spec = seedGradientSpec('radial', STOPS, v.keyPolygon!, 90, v.polygon)!
    expect(spec.type).toBe('radial')
    if (spec.type === 'radial') {
      // Independent derivation: the rendered outline's own box in the frame the
      // gradient is stored in.
      const box = poseBBox(renderedInCanonicalFrame(v))!
      expect(spec.centre.x).toBeCloseTo(box.x + box.width / 2, 6)
      expect(spec.centre.y).toBeCloseTo(box.y + box.height / 2, 6)
      expect(spec.radius).toBeCloseTo(Math.max(box.width, box.height) / 2, 6)
    }
  })

  it('responds to the curve — the same identity shape at two offsets seeds differently', () => {
    // The bug in one assertion: the extent came from `keyPolygon`, which both
    // of these share, so a flatter curve produced a byte-identical gradient.
    const a = curvedSample('4.8.8', 0.3)
    const b = curvedSample('4.8.8', 0.05)
    expect(a.signature).toBe(b.signature)
    const sa = seedGradientSpec('linear', STOPS, a.keyPolygon!, 90, a.polygon)!
    const sb = seedGradientSpec('linear', STOPS, b.keyPolygon!, 90, b.polygon)!
    if (sa.type !== 'linear' || sb.type !== 'linear') throw new Error('expected linear')
    const spanA = Math.hypot(sa.end.x - sa.start.x, sa.end.y - sa.start.y)
    const spanB = Math.hypot(sb.end.x - sb.start.x, sb.end.y - sb.start.y)
    // Size-relative: a 0.3 curve bows visibly further than a 0.05 one.
    expect(Math.abs(spanA - spanB) / spanA).toBeGreaterThan(0.01)
  })

  it('still poses off the straight outline', () => {
    // The guard on the fix: only the EXTENT moved to the rendered outline. A
    // flattened Bézier cannot rank reliably through `canonicalPose`'s
    // quantisation, so posing off it would let sibling instances render the
    // wash at different rotations.
    const v = curvedSample('4.8.8', 0.3)
    expect(stampGeometry(v.keyPolygon!, v.polygon)!.pose.toInstance)
      .toEqual(canonicalPose(v.keyPolygon!)!.toInstance)
  })

  it('is never worse class-wide than sizing off the straight outline', () => {
    // The feature stores ONE spec per congruent class, seeded from whichever
    // instance was clicked, and renders it on all of them. So the metric that
    // matters is the worst overrun across the class over every possible
    // representative — not the accuracy on the clicked shape alone.
    //
    // Measured 2026-08-02: 4.8.8 @0.3 hexagons 16.82% → 9.99%, @0.15 8.41% →
    // 5.14%, everything else a tie at 0%. Never worse anywhere.
    for (const [type, offset] of [['4.8.8', 0.3], ['3.6.3.6', 0.3], ['4.8.8', 0.15]] as const) {
      for (const [sig, group] of congruentGroups(curvedVoids(type, offset))) {
        for (const angle of [90, 0]) {
          const straight = worstClassOverrun(group, angle, false)
          const rendered = worstClassOverrun(group, angle, true)
          expect(rendered, `${type}@${offset} ${sig.slice(0, 8)} @${angle}°`)
            .toBeLessThanOrEqual(straight + 1e-9)
        }
      }
    }
  })

  it('the class-wide residual is the canonical POSE, not the extent', () => {
    // What the fix cannot reach. Congruent instances of one curved Void can
    // pose through canonical frames whose rendered boxes differ ~9% (4.8.8
    // hexagons: 121.3×98.1 vs 111.5×102.2 — same area, same perimeter, same
    // shape), so no choice of extent spans every instance exactly.
    //
    // Pinned, not asserted away: it sits in `canonicalPose`'s tie-break, which
    // also underpins Void identity and stamp placement — `resolveVoidStamps`
    // fits ONE image to both of those boxes, so the same class renders it at
    // two scales. Fixing it there is a separate change with a much wider blast
    // radius. If this test starts failing because the numbers dropped, that
    // was fixed and this test should go.
    const groups = congruentGroups(curvedVoids('4.8.8', 0.3))
    const hexes = [...groups.values()].find(g => g[0].keyPolygon!.length === 6)!
    const boxes = new Set(
      hexes.map(v => {
        const b = stampGeometry(v.keyPolygon!, v.polygon)!.box
        return `${b.width.toFixed(1)}x${b.height.toFixed(1)}`
      }),
    )
    expect(boxes.size).toBe(2)
    expect(worstClassOverrun(hexes, 90, true)).toBeGreaterThan(0.05)
  })

  it('gradientCanonicalBox encloses the rendered outline', () => {
    const v = curvedSample('4.8.8', 0.3)
    const box = gradientCanonicalBox(v.keyPolygon!, v.polygon)!
    for (const p of renderedInCanonicalFrame(v)) {
      expect(p.x).toBeGreaterThanOrEqual(box.x - 1e-6)
      expect(p.x).toBeLessThanOrEqual(box.x + box.width + 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(box.y - 1e-6)
      expect(p.y).toBeLessThanOrEqual(box.y + box.height + 1e-6)
    }
  })

  it('losing keyPolygon downstream silently re-poses the shape', () => {
    // What the periodic fast path did: it rebuilt each `PaintVoid` for the
    // Paint overlay from a rep and omitted `keyPolygon`, so every consumer saw
    // identity === rendered, posed off the flattened curve, and laid the shape
    // out in a frame rotated away from the renderer's. Not a straightening —
    // the silhouette stays curved — which is why it read as "Focus mode looks
    // wrong" rather than as an obvious break. `usePattern` now carries the pair
    // through; this pins what its absence costs.
    const v = curvedSample('4.8.8', 0.3)
    const withPair = stampGeometry(v.keyPolygon!, v.polygon)!
    const dropped = stampGeometry(v.polygon, v.polygon)!
    expect(dropped.points.length).toBe(withPair.points.length)
    const aspect = (b: { width: number; height: number }) => b.width / b.height
    expect(Math.abs(aspect(dropped.box) - aspect(withPair.box))).toBeGreaterThan(0.1)
  })

  it('a straight field is unchanged — one outline still seeds as before', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(seedGradientSpec('linear', STOPS, square, 90, square))
      .toEqual(seedGradientSpec('linear', STOPS, square, 90))
    expect(gradientCanonicalBox(square, square)).toEqual(gradientCanonicalBox(square))
  })
})
