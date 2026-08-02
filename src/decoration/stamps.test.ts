import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { canonicalPose, canonicalSelfMirror, stampGeometry, poseBBox, fitImageRect, resolveVoidStamps, userTransformMatrix, composeTransforms, isIdentityUserTransform, isReflectedPose, IDENTITY_USER_TRANSFORM, type StampTransform } from './stamps'
import { voidSignature, simplifyCollinear } from './voids'
import { curvedVoids } from './curvedFieldFixture'

const apply = (m: StampTransform, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
})

const rot = (p: Vec2, ang: number, t: Vec2 = { x: 0, y: 0 }): Vec2 => ({
  x: Math.cos(ang) * p.x - Math.sin(ang) * p.y + t.x,
  y: Math.sin(ang) * p.x + Math.cos(ang) * p.y + t.y,
})

const mirrorX = (p: Vec2): Vec2 => ({ x: -p.x, y: p.y })

/** Compare two point sets as unordered sets within tolerance. */
function samePointSet(a: Vec2[], b: Vec2[], tol = 1e-6): boolean {
  if (a.length !== b.length) return false
  const used = new Array(b.length).fill(false)
  for (const p of a) {
    let found = false
    for (let i = 0; i < b.length; i++) {
      if (!used[i] && Math.hypot(p.x - b[i].x, p.y - b[i].y) < tol) {
        used[i] = true
        found = true
        break
      }
    }
    if (!found) return false
  }
  return true
}

// An asymmetric convex quad (no self-symmetries → unique canonical pose).
const QUAD: Vec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 13, y: 6 },
  { x: 2, y: 9 },
]

// Isoceles trapezoid — one mirror axis, so a reflected instance can be posed
// without reflecting anything (see `canonicalSelfMirror`).
const TRAPEZOID: Vec2[] = [
  { x: 0, y: 0 },
  { x: 12, y: 0 },
  { x: 9, y: 7 },
  { x: 3, y: 7 },
]

describe('canonicalPose', () => {
  it('congruent instances share canonical points (rotation + translation)', () => {
    const base = canonicalPose(QUAD)!
    const moved = QUAD.map(p => rot(p, 0.83, { x: 41.5, y: -17.2 }))
    const posed = canonicalPose(moved)!
    expect(samePointSet(base.points, posed.points, 1e-6)).toBe(true)
  })

  it('reflected instances share canonical points too', () => {
    const base = canonicalPose(QUAD)!
    // Mirror reverses winding; canonicalPose must fold it back.
    const mirrored = QUAD.map(mirrorX)
    const posed = canonicalPose(mirrored)!
    expect(samePointSet(base.points, posed.points, 1e-6)).toBe(true)
  })

  it('toInstance maps canonical points back onto the instance outline', () => {
    const moved = QUAD.map(p => rot(p, -1.2, { x: 5, y: 99 }))
    const pose = canonicalPose(moved)!
    const back = pose.points.map(p => apply(pose.toInstance, p))
    expect(samePointSet(back, moved, 1e-6)).toBe(true)
  })

  it('toInstance of a reflected instance maps back onto it, with opposite handedness', () => {
    const mirrored = QUAD.map(mirrorX)
    const pose = canonicalPose(mirrored)!
    const back = pose.points.map(p => apply(pose.toInstance, p))
    expect(samePointSet(back, mirrored, 1e-6)).toBe(true)
    // Original and mirrored instances share canonical points, so exactly one
    // of the two toInstance maps must reflect: the determinants multiply to -1.
    const det = (m: StampTransform) => m.a * m.d - m.b * m.c
    expect(det(pose.toInstance) * det(canonicalPose(QUAD)!.toInstance)).toBeCloseTo(-1, 9)
  })

  it('canonical points start at the origin with the first edge along +x, CCW', () => {
    const pose = canonicalPose(QUAD)!
    expect(pose.points[0].x).toBeCloseTo(0, 9)
    expect(pose.points[0].y).toBeCloseTo(0, 9)
    expect(pose.points[1].y).toBeCloseTo(0, 9)
    expect(pose.points[1].x).toBeGreaterThan(0)
    // Shoelace of canonical points is positive (CCW).
    let area = 0
    const pts = pose.points
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
    }
    expect(area).toBeGreaterThan(0)
  })

  it('is degenerate-safe', () => {
    expect(canonicalPose([])).toBeNull()
    expect(canonicalPose([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull()
  })

  // Symmetric-shape tie-break (#44 Matching gradient consistency): every
  // instance of a symmetric Void must pick the SAME symmetry image, not an
  // arbitrary tied traversal, or gradients land rotated differently per
  // congruent instance.
  describe('symmetric-shape tie-break', () => {
    const SQUARE: Vec2[] = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ]
    const sameTransform = (a: StampTransform, b: StampTransform, tol = 1e-9) =>
      Math.abs(a.a - b.a) < tol && Math.abs(a.b - b.b) < tol
      && Math.abs(a.c - b.c) < tol && Math.abs(a.d - b.d) < tol
      && Math.abs(a.e - b.e) < tol && Math.abs(a.f - b.f) < tol

    it('vertex-array rotation of the same world polygon gives the same pose', () => {
      const base = canonicalPose(SQUARE)!
      for (let k = 1; k < 4; k++) {
        const cycled = [...SQUARE.slice(k), ...SQUARE.slice(0, k)]
        const posed = canonicalPose(cycled)!
        expect(sameTransform(base.toInstance, posed.toInstance)).toBe(true)
      }
    })

    it('reversed winding of the same world polygon gives the same pose', () => {
      const base = canonicalPose(SQUARE)!
      const reversed = [...SQUARE].reverse()
      const posed = canonicalPose(reversed)!
      expect(sameTransform(base.toInstance, posed.toInstance)).toBe(true)
    })

    it('translated instances differ only in the translation part', () => {
      const base = canonicalPose(SQUARE)!
      const moved = SQUARE.map(p => ({ x: p.x + 137.25, y: p.y - 61.75 }))
      const posed = canonicalPose(moved)!
      expect(posed.toInstance.a).toBeCloseTo(base.toInstance.a, 9)
      expect(posed.toInstance.b).toBeCloseTo(base.toInstance.b, 9)
      expect(posed.toInstance.c).toBeCloseTo(base.toInstance.c, 9)
      expect(posed.toInstance.d).toBeCloseTo(base.toInstance.d, 9)
      expect(posed.toInstance.e - base.toInstance.e).toBeCloseTo(137.25, 6)
      expect(posed.toInstance.f - base.toInstance.f).toBeCloseTo(-61.75, 6)
    })

    it('a 90°-rotated square (same world footprint) reuses the same pose', () => {
      // Rotating the square about its centre by its own symmetry angle
      // yields the identical world polygon (different vertex labels) — the
      // chosen pose must be identical, so a gradient painted on one lands
      // pixel-identically on the other.
      const centre = { x: 5, y: 5 }
      const rotated = SQUARE.map(p => rot({ x: p.x - centre.x, y: p.y - centre.y }, Math.PI / 2, centre))
      const base = canonicalPose(SQUARE)!
      const posed = canonicalPose(rotated)!
      expect(sameTransform(base.toInstance, posed.toInstance, 1e-6)).toBe(true)
    })

    it('regular hexagon: cycled vertex arrays agree on the pose', () => {
      const HEX: Vec2[] = Array.from({ length: 6 }, (_, i) => ({
        x: 20 * Math.cos((Math.PI / 3) * i),
        y: 20 * Math.sin((Math.PI / 3) * i),
      }))
      const base = canonicalPose(HEX)!
      for (let k = 1; k < 6; k++) {
        const cycled = [...HEX.slice(k), ...HEX.slice(0, k)]
        const posed = canonicalPose(cycled)!
        expect(sameTransform(base.toInstance, posed.toInstance, 1e-6)).toBe(true)
      }
    })
  })
})

describe('fitImageRect', () => {
  const box = { x: 2, y: 3, width: 20, height: 10 }
  it('cover fills the box and centres the overflow', () => {
    const r = fitImageRect(box, 100, 100, 'cover') // square image, wide box
    expect(r.width).toBeCloseTo(20)
    expect(r.height).toBeCloseTo(20)
    expect(r.x).toBeCloseTo(2)
    expect(r.y).toBeCloseTo(3 + (10 - 20) / 2)
  })
  it('contain letterboxes inside the box', () => {
    const r = fitImageRect(box, 100, 100, 'contain')
    expect(r.width).toBeCloseTo(10)
    expect(r.height).toBeCloseTo(10)
    expect(r.x).toBeCloseTo(2 + (20 - 10) / 2)
    expect(r.y).toBeCloseTo(3)
  })
  it('same-aspect cover maps exactly onto the box (round-trip alignment)', () => {
    const r = fitImageRect(box, 400, 200, 'cover')
    expect(r).toEqual(box)
  })
})

describe('resolveVoidStamps', () => {
  const sig = voidSignature(QUAD, 0.5, (0.5 * Math.PI) / 180)
  const record = { scope: 'congruent' as const, key: sig, image: 'data:image/png;base64,x', width: 100, height: 50, fit: 'cover' as const }

  it('stamps every matching Void and skips the rest', () => {
    const other = QUAD.map(p => ({ x: p.x * 2, y: p.y * 2 }))
    const voids = [
      { polygon: QUAD, signature: sig },
      { polygon: QUAD.map(p => rot(p, 1.1, { x: 30, y: 0 })), signature: sig },
      { polygon: other, signature: voidSignature(other, 0.5, (0.5 * Math.PI) / 180) },
    ]
    const placements = resolveVoidStamps(voids, [record])
    expect(placements).toHaveLength(2)
    expect(placements[0].image).toBe(record.image)
    // Placements of congruent instances share the canonical image rect
    // (up to float noise from the differing world poses).
    expect(placements[0].rect.x).toBeCloseTo(placements[1].rect.x, 9)
    expect(placements[0].rect.y).toBeCloseTo(placements[1].rect.y, 9)
    expect(placements[0].rect.width).toBeCloseTo(placements[1].rect.width, 9)
    expect(placements[0].rect.height).toBeCloseTo(placements[1].rect.height, 9)
    // But carry different instance transforms.
    expect(placements[0].transform).not.toEqual(placements[1].transform)
  })

  it('keys the pose off keyPolygon when present, clips to polygon', () => {
    const curved = QUAD.map(p => ({ x: p.x + 0.3, y: p.y - 0.2 }))
    const placements = resolveVoidStamps(
      [{ polygon: curved, keyPolygon: QUAD, signature: sig }],
      [record],
    )
    expect(placements).toHaveLength(1)
    expect(placements[0].clip).toBe(curved)
  })

  it('emits record-major so the record array is the stacking order', () => {
    const other = QUAD.map(p => ({ x: p.x * 2, y: p.y * 2 }))
    const otherSig = voidSignature(other, 0.5, (0.5 * Math.PI) / 180)
    const voids = [
      // Interleaved on purpose: void order must not leak into paint order.
      { polygon: QUAD, signature: sig },
      { polygon: other, signature: otherSig },
      { polygon: QUAD.map(p => rot(p, 1.1, { x: 30, y: 0 })), signature: sig },
    ]
    const back = { ...record, image: 'data:image/png;base64,back' }
    const front = { ...record, key: otherSig, image: 'data:image/png;base64,front' }
    const placements = resolveVoidStamps(voids, [back, front])
    expect(placements.map(p => p.image)).toEqual([back.image, back.image, front.image])
    // Reordering the records reorders the paint — that's the whole mechanism.
    expect(resolveVoidStamps(voids, [front, back]).map(p => p.image))
      .toEqual([front.image, back.image, back.image])
  })

  it('carries the Overlap flag through to the placement, omitted when off', () => {
    const voids = [{ polygon: QUAD, signature: sig }]
    expect(resolveVoidStamps(voids, [record])[0].overlap).toBeUndefined()
    expect(resolveVoidStamps(voids, [{ ...record, overlap: true }])[0].overlap).toBe(true)
    // Still posed + clipped to the same shape — Overlap only drops the clip at
    // render time, it never changes the fit.
    expect(resolveVoidStamps(voids, [{ ...record, overlap: true }])[0].clip).toBe(QUAD)
  })

  it('mirror: "never" cancels the reflection on the opposite-handed half', () => {
    // A mirrored instance of the same shape — same signature (voidSignature
    // minimises over the ring AND its reversal), opposite handedness.
    const mirrored = QUAD.map(mirrorX)
    const voids = [{ polygon: QUAD, signature: sig }, { polygon: mirrored, signature: sig }]
    const det = (p: { transform: StampTransform }) =>
      p.transform.a * p.transform.d - p.transform.b * p.transform.c

    // Default: one instance poses reflected — that is the reported "stamps are
    // flipped", and it is by construction, not a glitch.
    const plain = resolveVoidStamps(voids, [record])
    expect(plain.filter(p => det(p) < 0)).toHaveLength(1)

    // Upright: every composite comes out unreflected, so the motif reads the
    // same way on both halves.
    const upright = resolveVoidStamps(voids, [{ ...record, mirror: 'never' }])
    expect(upright.every(p => det(p) > 0)).toBe(true)
    // The unreflected instance is untouched — the correction only fires where
    // the pose actually carries a reflection. (Which of the two poses reflects
    // is the tie-break's business, so the test asks rather than assumes.)
    const flipped = plain.findIndex(p => det(p) < 0)
    expect(upright[1 - flipped].transform).toEqual(plain[1 - flipped].transform)
    expect(upright[flipped].transform).not.toEqual(plain[flipped].transform)
  })

  it('mirror: "never" composes with a Focus-mode transform without moving the fit', () => {
    const mirrored = QUAD.map(mirrorX)
    const transform = { offsetX: 0.1, offsetY: -0.2, scale: 1.4, rotation: 20 }
    const [p] = resolveVoidStamps(
      [{ polygon: mirrored, signature: sig }],
      [{ ...record, mirror: 'never', transform }],
    )
    expect(p.transform.a * p.transform.d - p.transform.b * p.transform.c).toBeGreaterThan(0)
    // Scale survives the correction: |det| = the user zoom squared.
    expect(Math.sqrt(p.transform.a * p.transform.d - p.transform.b * p.transform.c))
      .toBeCloseTo(transform.scale, 9)
  })

  // The complaint that produced `canonicalSelfMirror`: cancelling the
  // reflection by mirroring the IMAGE leaves the motif upright but sitting
  // where the Focus-mode layout was not put — "the mirror opposite to the one
  // shown in focus mode". A shape with a mirror axis of its own can do better.
  it("mirror: 'never' on a symmetric shape keeps the Focus layout intact", () => {
    const sig2 = voidSignature(TRAPEZOID, 0.5, (0.5 * Math.PI) / 180)
    const mirrored = TRAPEZOID.map(mirrorX)
    const rec2 = { ...record, key: sig2, transform: { offsetX: 0.25, offsetY: 0, scale: 1, rotation: 0 } }
    const voids = [{ polygon: TRAPEZOID, signature: sig2 }, { polygon: mirrored, signature: sig2 }]

    const upright = resolveVoidStamps(voids, [{ ...rec2, mirror: 'never' }])
    expect(upright).toHaveLength(2)
    for (const p of upright) {
      // Upright everywhere...
      expect(p.transform.a * p.transform.d - p.transform.b * p.transform.c).toBeGreaterThan(0)
    }
    // ...and still POSED on the outline: the canonical points carried through
    // `transform` (minus the user layout) land back on the instance outline, so
    // the layout chosen in Focus arrives rigidly moved rather than reflected
    // about a box centreline that is no axis of the shape.
    const geo = stampGeometry(mirrored)!
    const M = canonicalSelfMirror(geo.points)
    expect(M).not.toBeNull()
    const carried = geo.points.map(q => apply(composeTransforms(geo.pose.toInstance, M!), q))
    expect(samePointSet(carried, simplifyCollinear(mirrored.slice().reverse()), 1e-6)).toBe(true)
  })

  it("mirror: 'never' still fixes handedness on a shape with no axis", () => {
    // QUAD is asymmetric — no self-mirror exists, so the fallback runs and the
    // motif is upright at the cost of its placement. Documented, not hidden.
    expect(canonicalSelfMirror(canonicalPose(QUAD)!.points)).toBeNull()
    const [p] = resolveVoidStamps(
      [{ polygon: QUAD.map(mirrorX), signature: sig }],
      [{ ...record, mirror: 'never' }],
    )
    expect(p.transform.a * p.transform.d - p.transform.b * p.transform.c).toBeGreaterThan(0)
  })

  it('returns nothing for no records / non-congruent scopes', () => {
    expect(resolveVoidStamps([{ polygon: QUAD, signature: sig }], undefined)).toEqual([])
    expect(resolveVoidStamps(
      [{ polygon: QUAD, signature: sig }],
      [{ ...record, scope: 'instance' }],
    )).toEqual([])
  })
})

describe('userTransformMatrix', () => {
  const box = { x: 0, y: 0, width: 20, height: 10 }
  const apply = (m: StampTransform, p: { x: number; y: number }) =>
    ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })

  it('identity transform is the identity matrix', () => {
    const m = userTransformMatrix(box, IDENTITY_USER_TRANSFORM)
    expect(m.a).toBeCloseTo(1); expect(m.b).toBeCloseTo(0)
    expect(m.c).toBeCloseTo(0); expect(m.d).toBeCloseTo(1)
    expect(m.e).toBeCloseTo(0); expect(m.f).toBeCloseTo(0)
  })

  it('pans by box fractions', () => {
    const m = userTransformMatrix(box, { offsetX: 0.5, offsetY: -0.2, scale: 1, rotation: 0 })
    expect(apply(m, { x: 3, y: 4 })).toEqual({ x: 3 + 10, y: 4 - 2 })
  })

  it('zooms and rotates about the box centre', () => {
    const centre = { x: 10, y: 5 }
    const mz = userTransformMatrix(box, { offsetX: 0, offsetY: 0, scale: 2, rotation: 0 })
    expect(apply(mz, centre).x).toBeCloseTo(centre.x)
    expect(apply(mz, centre).y).toBeCloseTo(centre.y)
    expect(apply(mz, { x: 12, y: 5 }).x).toBeCloseTo(14) // 2 right of centre → 4
    const mr = userTransformMatrix(box, { offsetX: 0, offsetY: 0, scale: 1, rotation: 90 })
    const p = apply(mr, { x: 12, y: 5 }) // 2 right of centre → 2 below (y-down 90° CW)
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(7)
  })

  it('isIdentityUserTransform detects the no-op', () => {
    expect(isIdentityUserTransform(IDENTITY_USER_TRANSFORM)).toBe(true)
    expect(isIdentityUserTransform({ offsetX: 0, offsetY: 0, scale: 1.2, rotation: 0 })).toBe(false)
  })

  it('composeTransforms applies B first', () => {
    const shift: StampTransform = { a: 1, b: 0, c: 0, d: 1, e: 5, f: 0 }
    const scale2: StampTransform = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }
    // scale ∘ shift: (1,0) → (6,0) → (12,0)
    expect(apply(composeTransforms(scale2, shift), { x: 1, y: 0 })).toEqual({ x: 12, y: 0 })
  })
})

describe('resolveVoidStamps with a user transform', () => {
  const sig = voidSignature(QUAD, 0.5, (0.5 * Math.PI) / 180)
  const record = { scope: 'congruent' as const, key: sig, image: 'data:image/png;base64,x', width: 100, height: 50, fit: 'cover' as const }

  it('composes the adjustment into the placement transform', () => {
    const base = resolveVoidStamps([{ polygon: QUAD, signature: sig }], [record])[0]
    const adjusted = resolveVoidStamps(
      [{ polygon: QUAD, signature: sig }],
      [{ ...record, transform: { offsetX: 0.25, offsetY: 0, scale: 1, rotation: 0 } }],
    )[0]
    // Base rect unchanged; the pan rides in the matrix.
    expect(adjusted.rect).toEqual(base.rect)
    const box = poseBBox(canonicalPose(QUAD)!.points)!
    const p = { x: 1, y: 1 }
    const applyM = (m: StampTransform) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })
    const b = applyM(base.transform)
    const a = applyM(adjusted.transform)
    // Instance-space displacement is the isometry image of the canonical pan
    // — its length is exactly offsetX·boxWidth.
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(0.25 * box.width, 9)
  })
})

describe('poseBBox', () => {
  it('bounds the points', () => {
    expect(poseBBox([{ x: 1, y: 2 }, { x: -3, y: 5 }])).toEqual({ x: -3, y: 2, width: 4, height: 3 })
    expect(poseBBox([])).toBeNull()
  })
})

/**
 * Why `VoidStampRecord.mirror` exists at all. A Void's signature is
 * direction-agnostic (`minRotation` minimises over the token ring AND its
 * reversal), so a shape and its mirror image are ONE congruent class — and on
 * a real field that class splits close to evenly, with the canonical pose
 * reflecting on the opposite-handed half. A directional motif therefore reads
 * backwards on about half the pattern unless the record opts out.
 *
 * Pinned as measured behaviour, not asserted away: it is correct for abstract
 * artwork (the stamps inherit the tiling's own reflection symmetry), so the
 * fix is a per-record toggle, not a change here.
 */
describe('congruent classes mix handedness on real fields', () => {
  it('splits a decagonal-rosette class near-evenly between the two poses', () => {
    const per = new Map<string, { pos: number; neg: number }>()
    for (const v of curvedVoids('decagonal-rosette', 0)) {
      const pose = canonicalPose(v.keyPolygon ?? v.polygon)
      if (!pose) continue
      const e = per.get(v.signature) ?? { pos: 0, neg: 0 }
      if (isReflectedPose(pose.toInstance)) e.neg++
      else e.pos++
      per.set(v.signature, e)
    }
    const big = [...per.values()].filter(e => e.pos + e.neg >= 8)
    expect(big.length).toBeGreaterThan(0)
    // Every populous class carries BOTH handednesses — the mirroring is not a
    // stray instance, it is half the field.
    expect(big.every(e => e.pos > 0 && e.neg > 0)).toBe(true)
    expect(big.every(e => e.pos === e.neg)).toBe(true)
  })
})
