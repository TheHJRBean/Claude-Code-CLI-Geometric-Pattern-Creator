import { describe, it, expect } from 'vitest'
import { curvedVoids } from './curvedFieldFixture'
import { stampGeometry, canonicalPose, poseBBox, resolveVoidStamps, toCanonicalPoint } from './stamps'
import { nameVoidShapes, voidStampCanvas } from '../export/stampAssets'
import type { Vec2 } from '../utils/math'

/**
 * Stamp geometry on a CURVED field.
 *
 * A Void carries two outlines: `keyPolygon` (straight — the identity the
 * signature and canonical pose derive from) and `polygon` (the flattened
 * Bézier outline actually drawn, and what the stamp is clipped to). The stamp
 * canvas used to be built entirely from the straight one, so the user designed
 * against a straight-edged guide for a shape clipped to a curve — enclosing as
 * little as 66% of it on 3.6.3.6 triangles — and `cover` fitted the image to a
 * box the rendered shape bulged outside of.
 */

describe('stampGeometry', () => {
  it('poses from the identity outline but shapes and boxes from the rendered one', () => {
    const voids = curvedVoids('4.8.8', 0.3)
    const v = voids.find(x => x.keyPolygon && !x.clipped)!
    const geo = stampGeometry(v.keyPolygon!, v.polygon)!

    // Pose is the straight outline's — unchanged, so congruent instances still
    // agree on which symmetry image they pose through.
    expect(geo.pose.toInstance).toEqual(canonicalPose(v.keyPolygon!)!.toInstance)
    // ...but the canvas carries the flattened curve, not the straight polygon.
    expect(geo.points.length).toBe(v.polygon.length)
    expect(geo.points.length).toBeGreaterThan(v.keyPolygon!.length)
  })

  it('the canonical shape is the rendered outline mapped rigidly (side lengths preserved)', () => {
    const voids = curvedVoids('4.8.8', 0.3)
    const v = voids.find(x => x.keyPolygon && !x.clipped)!
    const geo = stampGeometry(v.keyPolygon!, v.polygon)!
    const edge = (poly: Vec2[], i: number) =>
      Math.hypot(poly[(i + 1) % poly.length].x - poly[i].x, poly[(i + 1) % poly.length].y - poly[i].y)
    for (let i = 0; i < v.polygon.length; i++) {
      expect(edge(geo.points, i)).toBeCloseTo(edge(v.polygon, i), 6)
    }
  })

  it('falls back to the pose points when there is no distinct rendered outline', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const geo = stampGeometry(square)!
    expect(geo.points).toEqual(canonicalPose(square)!.points)
    expect(geo.box).toEqual(poseBBox(canonicalPose(square)!.points))
  })
})

describe('curved stamp canvas', () => {
  it('the exported canvas encloses the whole rendered shape', () => {
    // The straight-outline box did not: 4.8.8 6-gons bulged ~9% of the box
    // outside it, leaving bands of the Void that a `cover` image never reached.
    // Checked against the rendered outline carried into the canvas's own frame
    // — comparing the canvas points to their own bbox would be a tautology.
    let checked = 0
    for (const [type, offset] of [['4.8.8', 0.3], ['3.6.3.6', 0.3], ['4.8.8', 0.15]] as const) {
      const voids = curvedVoids(type, offset)
      for (const s of nameVoidShapes(voids)) {
        if (!s.renderedOutline) continue
        const canvas = voidStampCanvas(s.outline, s.renderedOutline)!
        const pose = canonicalPose(s.outline)!
        for (const w of s.renderedOutline) {
          const p = toCanonicalPoint(pose.toInstance, w)
          expect(p.x).toBeGreaterThanOrEqual(canvas.box.x - 1e-6)
          expect(p.x).toBeLessThanOrEqual(canvas.box.x + canvas.box.width + 1e-6)
          expect(p.y).toBeGreaterThanOrEqual(canvas.box.y - 1e-6)
          expect(p.y).toBeLessThanOrEqual(canvas.box.y + canvas.box.height + 1e-6)
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('the exported canvas and the rendered placement agree on the box', () => {
    // The round-trip promise: a design made on the exported canvas lands
    // exactly where the renderer fits the image.
    const voids = curvedVoids('4.8.8', 0.3)
    const named = nameVoidShapes(voids).find(s => s.renderedOutline)!
    const canvas = voidStampCanvas(named.outline, named.renderedOutline)!
    const placements = resolveVoidStamps(voids, [{
      scope: 'congruent', key: named.signature, image: 'data:,', width: 100, height: 100, fit: 'contain',
    }])
    expect(placements.length).toBeGreaterThan(0)
    // `contain` centres a square image on the box, so the fitted rect's long
    // side is the box's short side — enough to pin which box was used.
    const short = Math.min(canvas.box.width, canvas.box.height)
    expect(placements[0].rect.width).toBeCloseTo(short, 6)
  })

  it('still names shapes from the identity outline, not the flattened curve', () => {
    // A flattened Bézier hexagon has 48 chords — naming off the drawn outline
    // would label every curved shape "48-gon".
    const named = nameVoidShapes(curvedVoids('3.6.3.6', 0.3))
    expect(named.map(s => s.name).sort()).toEqual(['12-gon', 'hexagon', 'triangle'])
    for (const s of named) expect(s.renderedOutline!.length).toBeGreaterThan(s.outline.length)
  })
})
