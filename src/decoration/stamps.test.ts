import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { canonicalPose, poseBBox, fitImageRect, resolveVoidStamps, userTransformMatrix, composeTransforms, isIdentityUserTransform, IDENTITY_USER_TRANSFORM, type StampTransform } from './stamps'
import { voidSignature } from './voids'

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
