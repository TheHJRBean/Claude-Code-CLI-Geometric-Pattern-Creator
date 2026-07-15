import type { Vec2 } from '../utils/math'
import { dist, sub, cross, dot } from '../utils/math'
import type { StampUserTransform, VoidStampRecord } from '../types/editor'
import { signedArea, simplifyCollinear } from './voids'

/**
 * Void **Stamps** (Decoration Phase) — place an uploaded image inside every
 * Void a `VoidStampRecord` reaches, clipped to the Void outline.
 *
 * The crux is the **canonical pose**: a deterministic rigid(-or-reflected)
 * placement of a Void outline that every congruent instance agrees on. The
 * image is laid out once in canonical coordinates (fit to the canonical
 * bounding box), and each instance renders it through its own
 * canonical→instance isometry — so the same record lands consistently
 * rotated/mirrored everywhere, and a canvas exported for a signature
 * round-trips at exactly the right scale and orientation.
 *
 * The canonical choice reuses the congruent-signature idea (`voids.ts`):
 * quantised interior-angle + edge-length tokens over every start vertex and
 * both traversal directions; the lexicographically-smallest token string
 * wins. Congruent instances produce the same token ring, so they pick
 * geometrically-corresponding poses. For a shape with its own symmetries the
 * winning pose is ambiguous up to that symmetry group (several traversals
 * tie); any winner is a correct fit — the stamp may sit in a different
 * symmetric orientation per instance, which is inherent, not a bug.
 */

/** SVG `matrix(a b c d e f)` affine: (x,y) → (a·x + c·y + e, b·x + d·y + f). */
export interface StampTransform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface CanonicalPose {
  /** The outline in canonical coordinates: traversal-start vertex at the
   * origin, first edge along +x, CCW winding. */
  points: Vec2[]
  /** Isometry mapping canonical coordinates → this instance's coordinates
   * (rotation + translation, plus a reflection when the canonical traversal
   * runs against the instance's CCW order). */
  toInstance: StampTransform
}

/** Axis-aligned bounding box of the canonical pose — the stamp canvas. */
export interface StampBBox {
  x: number
  y: number
  width: number
  height: number
}

// Same quantisation the congruent signature uses (`extractVoids` defaults),
// so canonical-pose agreement holds exactly where signature equality does.
const LENGTH_SNAP = 0.5
const ANGLE_SNAP = (0.5 * Math.PI) / 180

/**
 * Deterministic canonical pose of a polygon outline. Congruent polygons
 * (same signature) return the same `points` (up to quantisation-scale float
 * noise); each carries its own `toInstance`. Null for degenerate input.
 */
export function canonicalPose(polygon: Vec2[]): CanonicalPose | null {
  if (polygon.length < 3) return null
  const ccw = signedArea(polygon) < 0 ? polygon.slice().reverse() : polygon
  const kp = simplifyCollinear(ccw)
  const n = kp.length
  if (n < 3) return null

  // Interior angle token per vertex (direction-independent) + edge lengths.
  const angleTok: string[] = []
  for (let i = 0; i < n; i++) {
    const prev = kp[(i - 1 + n) % n]
    const cur = kp[i]
    const next = kp[(i + 1) % n]
    const inDir = sub(cur, prev)
    const outDir = sub(next, cur)
    const turn = Math.atan2(cross(inDir, outDir), dot(inDir, outDir))
    angleTok.push(`a${Math.round((Math.PI - turn) / ANGLE_SNAP)}`)
  }

  // Candidate traversals: every start vertex, both directions. The token
  // string of a traversal is a<angle at T[i]>;e<edge T[i]→T[i+1]>;… — built
  // from intrinsic quantities, so congruent instances (including reflected
  // ones) enumerate the same candidate set and agree on the minimum.
  let bestSer: string | null = null
  let bestStart = 0
  let bestDir: 1 | -1 = 1
  for (const dir of [1, -1] as const) {
    for (let s = 0; s < n; s++) {
      const parts: string[] = []
      for (let i = 0; i < n; i++) {
        const vi = ((s + dir * i) % n + n) % n
        const vj = ((s + dir * (i + 1)) % n + n) % n
        parts.push(angleTok[vi], `e${Math.round(dist(kp[vi], kp[vj]) / LENGTH_SNAP)}`)
      }
      const ser = parts.join(';')
      if (bestSer === null || ser < bestSer) {
        bestSer = ser
        bestStart = s
        bestDir = dir
      }
    }
  }

  const traversal: Vec2[] = []
  for (let i = 0; i < n; i++) {
    traversal.push(kp[((bestStart + bestDir * i) % n + n) % n])
  }
  const t0 = traversal[0]
  const theta = Math.atan2(traversal[1].y - t0.y, traversal[1].x - t0.x)
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  // Reversed traversal is CW in instance coords — flip y after rotating so
  // the canonical points come out CCW with the first edge still along +x.
  const flip = bestDir === -1 ? -1 : 1
  const points = traversal.map(p => {
    const dx = p.x - t0.x
    const dy = p.y - t0.y
    return { x: cosT * dx + sinT * dy, y: flip * (-sinT * dx + cosT * dy) }
  })
  // Inverse: p → t0 + R(theta)·F(p), F = diag(1, flip).
  return {
    points,
    toInstance: {
      a: cosT,
      b: sinT,
      c: -flip * sinT,
      d: flip * cosT,
      e: t0.x,
      f: t0.y,
    },
  }
}

/** Bounding box of a point set. Null for empty input. */
export function poseBBox(points: Vec2[]): StampBBox | null {
  if (points.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Image rect (canonical coords) fitting `iw`×`ih` pixels onto `box`:
 * `cover` fills the box cropping overflow, `contain` letterboxes. */
export function fitImageRect(
  box: StampBBox,
  iw: number,
  ih: number,
  fit: 'cover' | 'contain',
): StampBBox {
  const s = fit === 'cover'
    ? Math.max(box.width / iw, box.height / ih)
    : Math.min(box.width / iw, box.height / ih)
  const w = iw * s
  const h = ih * s
  return {
    x: box.x + (box.width - w) / 2,
    y: box.y + (box.height - h) / 2,
    width: w,
    height: h,
  }
}

export const IDENTITY_USER_TRANSFORM: StampUserTransform = {
  offsetX: 0, offsetY: 0, scale: 1, rotation: 0,
}

/** True when `t` is (numerically) the identity — used to omit the field from
 * saved records instead of storing a no-op. */
export function isIdentityUserTransform(t: StampUserTransform): boolean {
  return Math.abs(t.offsetX) < 1e-9 && Math.abs(t.offsetY) < 1e-9
    && Math.abs(t.scale - 1) < 1e-9 && Math.abs(t.rotation) < 1e-9
}

/**
 * Canonical→canonical affine for a Focus-mode adjustment: rotate by
 * `rotation`° and zoom by `scale` about the canonical box centre, then pan by
 * the box-fraction offsets. Applied between the base cover/contain fit and
 * the canonical→instance isometry, so one adjustment lands on every
 * congruent instance (mirrored on reflected ones, like the image itself).
 */
export function userTransformMatrix(box: StampBBox, t: StampUserTransform): StampTransform {
  const rad = (t.rotation * Math.PI) / 180
  const cos = Math.cos(rad) * t.scale
  const sin = Math.sin(rad) * t.scale
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dx = t.offsetX * box.width
  const dy = t.offsetY * box.height
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: cx + dx - (cos * cx - sin * cy),
    f: cy + dy - (sin * cx + cos * cy),
  }
}

/** Affine composition `A ∘ B` (apply B first, then A). */
export function composeTransforms(A: StampTransform, B: StampTransform): StampTransform {
  return {
    a: A.a * B.a + A.c * B.b,
    b: A.b * B.a + A.d * B.b,
    c: A.a * B.c + A.c * B.d,
    d: A.b * B.c + A.d * B.d,
    e: A.a * B.e + A.c * B.f + A.e,
    f: A.b * B.e + A.d * B.f + A.f,
  }
}

/** One render-ready stamped Void: clip to `clip` (instance coords), draw
 * `image` at the canonical-coords rect under `transform`. */
export interface StampPlacement {
  /** Void outline to clip to, in the field's coordinates (the rendered —
   * possibly curved — outline). */
  clip: Vec2[]
  /** Canonical→instance isometry for the `<image>`'s group. */
  transform: StampTransform
  /** Data-URL image. */
  image: string
  /** Image rect in canonical coordinates (cover/contain fit already applied). */
  rect: StampBBox
}

/** The subset of a Void the resolver needs (both `VoidRegion` and the
 * fast-path reps satisfy it structurally). */
export interface StampableVoid {
  polygon: Vec2[]
  keyPolygon?: Vec2[]
  signature: string
}

/**
 * Resolve stamp records over a field of Voids. v1 matches `congruent`-scope
 * records by signature; other scopes are ignored (reserved). The canonical
 * pose derives from the STRAIGHT outline (`keyPolygon` when present) so a
 * stamp survives curve-recipe changes; the clip stays the rendered outline.
 */
export function resolveVoidStamps(
  voids: StampableVoid[],
  records: VoidStampRecord[] | undefined,
): StampPlacement[] {
  if (!records || records.length === 0) return []
  const bySignature = new Map<string, VoidStampRecord>()
  for (const r of records) {
    if (r.scope === 'congruent') bySignature.set(r.key, r)
  }
  if (bySignature.size === 0) return []
  const out: StampPlacement[] = []
  for (const v of voids) {
    const rec = bySignature.get(v.signature)
    if (!rec) continue
    const pose = canonicalPose(v.keyPolygon ?? v.polygon)
    if (!pose) continue
    const box = poseBBox(pose.points)
    if (!box || box.width <= 0 || box.height <= 0) continue
    out.push({
      clip: v.polygon,
      // Focus-mode adjustment slots between the base fit and the isometry.
      transform: rec.transform
        ? composeTransforms(pose.toInstance, userTransformMatrix(box, rec.transform))
        : pose.toInstance,
      image: rec.image,
      rect: fitImageRect(box, rec.width, rec.height, rec.fit),
    })
  }
  return out
}
