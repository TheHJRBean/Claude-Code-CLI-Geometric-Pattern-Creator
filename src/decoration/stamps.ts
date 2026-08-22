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
 * geometrically-corresponding poses. For a shape with its own symmetries
 * several traversals tie on the token string; ties are broken by **world
 * orientation** (smallest first-edge angle, unreflected preferred), so every
 * instance of a symmetric Void picks the same symmetry image — translated
 * instances render gradients/stamps identically, rotated ones as world-
 * aligned as the shape's own symmetry allows (#44 Matching consistency).
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
  return canonicalPoses(polygon)[0] ?? null
}

/**
 * Every pose tied for canonical — one per **self-symmetry** of the outline,
 * ordered by the same world-orientation tie-break `canonicalPose` applies, so
 * `[0]` is exactly what that function returns.
 *
 * Stamps and gradients only ever want `[0]`: one pose per instance, chosen the
 * same way everywhere. The **Combine** matcher (`voidMerge.ts`) wants the rest.
 * It locates a merge group's other members by mapping stored canonical-frame
 * offsets out through the anchor Void's pose — and for a *symmetric* anchor the
 * tie-break picks by world orientation, which is not the symmetry image that
 * carries the offsets onto the right neighbours. A square anchor with a
 * neighbour on one side poses identically whichever side that is; only one of
 * its four tied poses aims the offset at the neighbour. Trying them all makes
 * the match succeed on every instance instead of the quarter that happen to
 * agree with world orientation.
 */
export function canonicalPoses(polygon: Vec2[]): CanonicalPose[] {
  if (polygon.length < 3) return []
  const ccw = signedArea(polygon) < 0 ? polygon.slice().reverse() : polygon
  const kp = simplifyCollinear(ccw)
  const n = kp.length
  if (n < 3) return []

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
  const candidates: { ser: string; start: number; dir: 1 | -1 }[] = []
  for (const dir of [1, -1] as const) {
    for (let s = 0; s < n; s++) {
      const parts: string[] = []
      for (let i = 0; i < n; i++) {
        const vi = ((s + dir * i) % n + n) % n
        const vj = ((s + dir * (i + 1)) % n + n) % n
        parts.push(angleTok[vi], `e${Math.round(dist(kp[vi], kp[vj]) / LENGTH_SNAP)}`)
      }
      const ser = parts.join(';')
      candidates.push({ ser, start: s, dir })
      if (bestSer === null || ser < bestSer) bestSer = ser
    }
  }

  // Symmetric shapes tie on the token string (one candidate per symmetry
  // image). Break ties by **handedness first**, then world orientation — so
  // congruent instances agree on WHICH symmetry image they pose through:
  // translated instances get identical poses, rotated ones the most
  // world-aligned pose the shape's symmetry group offers.
  //
  // Handedness has to outrank the angle, and the reason is invisible on a
  // chiral shape. A **self-mirror-symmetric** outline ties on BOTH
  // handednesses, and its reflected traversals start at different vertices,
  // so they carry different world angles — an angle-first sort therefore
  // picks the reflected pose on exactly those instances where a mirrored
  // traversal happens to point closer to +x. The shape is identical either
  // way; anything posed THROUGH it is not. Measured on 3.6.3.6: 104
  // congruent Voids all posed at angle 0, 52 of them mirrored — so a linear
  // gradient painted once at the congruent rung ran one way on half the
  // field and the other way on the rest, and a stamp landed flipped on half
  // its instances with the Mirror control untouched.
  //
  // A **chiral** shape reaches its minimal token from one direction only, so
  // its mirrored instances have no unreflected candidate to prefer and still
  // pose reflected — which is right: there the reflection is a real property
  // of the placement, not an artifact of the tie-break.
  const ANGLE_EPS = 1e-7
  const TAU = 2 * Math.PI
  const tied = candidates.filter(c => c.ser === bestSer).map(c => {
    const p0 = kp[c.start]
    const p1 = kp[((c.start + c.dir) % n + n) % n]
    let ang = Math.atan2(p1.y - p0.y, p1.x - p0.x)
    if (ang < 0) ang += TAU
    if (ang > TAU - ANGLE_EPS) ang = 0
    return { ...c, ang }
  })
  tied.sort((a, b) => {
    if (a.dir !== b.dir) return b.dir - a.dir // unreflected (dir 1) first
    if (Math.abs(a.ang - b.ang) > ANGLE_EPS) return a.ang - b.ang
    return a.start - b.start
  })

  return tied.map(({ start, dir }) => {
    const traversal: Vec2[] = []
    for (let i = 0; i < n; i++) {
      traversal.push(kp[((start + dir * i) % n + n) % n])
    }
    const t0 = traversal[0]
    const theta = Math.atan2(traversal[1].y - t0.y, traversal[1].x - t0.x)
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    // Reversed traversal is CW in instance coords — flip y after rotating so
    // the canonical points come out CCW with the first edge still along +x.
    const flip = dir === -1 ? -1 : 1
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
  })
}

/** Instance coords → canonical coords: the inverse of `pose.toInstance`.
 * That matrix is a rotation with an optional y-flip, so its linear part is
 * orthogonal and the inverse reuses the very same four coefficients. */
export function toCanonicalPoint(t: StampTransform, p: Vec2): Vec2 {
  const dx = p.x - t.e
  const dy = p.y - t.f
  return { x: t.a * dx + t.b * dy, y: t.c * dx + t.d * dy }
}

/** A Void's stamp geometry: the outline to draw and the box an image is fitted
 * to, both in canonical coordinates, plus the pose that carries them to an
 * instance. */
export interface StampGeometry {
  /** Outline in canonical coordinates — the RENDERED shape where one differs
   * from the identity outline (curved fields). */
  points: Vec2[]
  /** Bounding box of `points` — the stamp canvas and the image-fit box. */
  box: StampBBox
  pose: CanonicalPose
}

/**
 * Resolve a Void's stamp geometry from its two outlines.
 *
 * **Pose** comes from `identityOutline` — the straight `keyPolygon` on a
 * curved field. That is what makes congruent instances agree on which
 * symmetry image they pose through: `canonicalPose` picks the traversal with
 * the smallest quantised token ring, and a flattened Bézier outline's chord
 * lengths and shallow joint angles sit far too close to those quantisation
 * steps to rank reliably (the same fragility `canonicaliseSignatures` exists
 * to paper over). Posing off the curved outline would let sibling instances
 * pick different traversals and render the same stamp at different rotations.
 *
 * **Shape and box** come from `renderedOutline` — what the stamp is actually
 * clipped to. Using the straight outline for these made the exported design
 * canvas a straight-edged polygon while the clip was a curve enclosing as
 * little as 66% of it (3.6.3.6 triangles at offset 0.3), and let the rendered
 * shape bulge up to ~9% of the box outside the image under `cover` (4.8.8
 * 6-gons), leaving uncovered bands. Export and placement read this same box,
 * so a design made on the exported canvas still round-trips exactly.
 *
 * Omit `renderedOutline` (or pass the identity outline itself) for a straight
 * field, where the two coincide.
 */
export function stampGeometry(
  identityOutline: Vec2[],
  renderedOutline?: Vec2[],
): StampGeometry | null {
  const pose = canonicalPose(identityOutline)
  if (!pose) return null
  // No distinct rendered outline ⇒ use the pose's own canonical points, which
  // are additionally CCW-normalised and collinear-simplified.
  const points = !renderedOutline || renderedOutline === identityOutline
    ? pose.points
    : renderedOutline.map(p => toCanonicalPoint(pose.toInstance, p))
  const box = poseBBox(points)
  if (!box || box.width <= 0 || box.height <= 0) return null
  return { points, box, pose }
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
  return !t.flip && Math.abs(t.offsetX) < 1e-9 && Math.abs(t.offsetY) < 1e-9
    && Math.abs(t.scale - 1) < 1e-9 && Math.abs(t.rotation) < 1e-9
}

/**
 * Canonical→canonical affine for a Focus-mode adjustment: `flip` the image
 * about the box's vertical centreline, then rotate by `rotation`° and zoom by
 * `scale` about the canonical box centre, then pan by the box-fraction
 * offsets. Applied between the base cover/contain fit and the
 * canonical→instance isometry, so one adjustment lands on every congruent
 * instance (mirrored on reflected ones, like the image itself).
 *
 * Flip goes innermost so the rotation reads the same before and after it —
 * the user rotates what they see, not a pre-mirrored frame.
 */
export function userTransformMatrix(box: StampBBox, t: StampUserTransform): StampTransform {
  const m = rotateZoomPan(box, t)
  return t.flip ? composeTransforms(m, mirrorXMatrix(box)) : m
}

function rotateZoomPan(box: StampBBox, t: StampUserTransform): StampTransform {
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

/** True when a canonical→instance pose carries a reflection — i.e. this Void
 * is the opposite-handed half of its congruent class, and anything laid out in
 * canonical coordinates renders mirrored on it. */
export function isReflectedPose(t: StampTransform): boolean {
  return t.a * t.d - t.b * t.c < 0
}

/** Reflection about the vertical centreline of `box`, in canonical
 * coordinates. The LAST-RESORT half of `mirror: 'never'`, used only when the
 * shape has no mirror symmetry of its own: it cancels the pose's reflection so
 * the motif is upright, but the box centreline is not an axis of the shape, so
 * the image lands at a position that is mirrored *relative to the outline* —
 * which is what the Focus-mode layout was chosen against. Unavoidable for a
 * genuinely asymmetric Void: no map takes an asymmetric figure onto a mirrored
 * copy of its shape without either mirroring the figure or breaking the
 * correspondence. Prefer `canonicalSelfMirror`, which has neither cost. */
export function mirrorXMatrix(box: StampBBox): StampTransform {
  return { a: -1, b: 0, c: 0, d: 1, e: 2 * (box.x + box.width / 2), f: 0 }
}

/**
 * A **reflective self-symmetry** of the canonical outline — an
 * orientation-reversing isometry mapping the shape onto itself — or null when
 * the shape has none.
 *
 * This is what makes `mirror: 'never'` honest. A reflected pose composed with
 * such an `M` is a pure rotation+translation (det > 0 twice over), so the
 * instance shows the Focus-mode layout **rigidly moved**: the motif is upright
 * AND still sits where it was placed relative to the outline, because `M`
 * preserves that outline. Mirroring about the bounding box (`mirrorXMatrix`)
 * gets the handedness right and the placement wrong — the box centreline is
 * almost never an axis of the shape.
 *
 * An orientation-reversing symmetry must reverse the vertex order, so the
 * candidates are the `n` maps sending `points[i] → points[(s − i) mod n]`; each
 * is built from the first edge's image and then verified pointwise. The scan is
 * in `s` order, so congruent instances (same canonical points) pick the same
 * `M`. O(n²) worst case with an edge-length early-out — call it once per
 * congruent class, not once per instance.
 */
export function canonicalSelfMirror(points: Vec2[]): StampTransform | null {
  const n = points.length
  if (n < 3) return null
  const box = poseBBox(points)
  if (!box) return null
  // Flattened curves carry sampling noise, so the match is metric, not exact.
  const tol = Math.max(box.width, box.height, 1) * 1e-4
  const p0 = points[0]
  const p1 = points[1]
  const d0 = dist(p0, p1)
  if (d0 <= 0) return null
  const thetaU = Math.atan2(p1.y - p0.y, p1.x - p0.x)
  for (let s = 0; s < n; s++) {
    const ps = points[s]
    const pm = points[(s - 1 + n) % n]
    if (Math.abs(dist(ps, pm) - d0) > tol) continue
    // Orientation-reversing isometry = flip in y, then rotate, then translate.
    // Pick the rotation that carries the flipped first edge onto its image.
    const phi = Math.atan2(pm.y - ps.y, pm.x - ps.x) + thetaU
    const cos = Math.cos(phi)
    const sin = Math.sin(phi)
    const M: StampTransform = {
      a: cos, b: sin, c: sin, d: -cos,
      e: ps.x - (cos * p0.x + sin * p0.y),
      f: ps.y - (sin * p0.x - cos * p0.y),
    }
    let ok = true
    for (let i = 0; i < n && ok; i++) {
      const q = points[i]
      const img = points[((s - i) % n + n) % n]
      const x = M.a * q.x + M.c * q.y + M.e
      const y = M.b * q.x + M.d * q.y + M.f
      if (Math.abs(x - img.x) > tol || Math.abs(y - img.y) > tol) ok = false
    }
    if (ok) return M
  }
  return null
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
  /** Inner loops of `clip` to leave uncovered — a **Combine** composite
   * ringing an unselected Void. */
  clipHoles?: Vec2[][]
  /** Canonical→instance isometry for the `<image>`'s group. */
  transform: StampTransform
  /** Data-URL image. */
  image: string
  /** Image rect in canonical coordinates (cover/contain fit already applied). */
  rect: StampBBox
  /** Overlap mode — render the image UNCLIPPED (it may spill past `clip` and
   * over its neighbours). `clip` is still carried: it is the shape the stamp
   * was posed and fitted to, and Focus mode draws it as the guide. */
  overlap?: boolean
}

/** The subset of a Void the resolver needs (both `VoidRegion` and the
 * fast-path reps satisfy it structurally). */
export interface StampableVoid {
  polygon: Vec2[]
  keyPolygon?: Vec2[]
  signature: string
  /** Combine composite only — inner loops the clip must punch out. */
  holes?: Vec2[][]
}

/**
 * Resolve stamp records over a field of Voids. v1 matches `congruent`-scope
 * records by signature; other scopes are ignored (reserved). The canonical
 * pose derives from the STRAIGHT outline (`keyPolygon` when present) so a
 * stamp survives curve-recipe changes; the clip stays the rendered outline.
 *
 * Emission is **record-major**: every Void of `records[0]` first, then
 * `records[1]`'s, and so on. The output is painted in order, so the record
 * array IS the stacking order (last = front) — which is what the panel's
 * bring-forward / send-back controls move. It only shows where a record sets
 * `overlap` (unclipped ⇒ images can spill onto each other), but the order is
 * deterministic either way.
 *
 * `mirror` makes a congruent class agree on handedness instead of coming out
 * half and half: `'never'` corrects the reflected instances (the class matches
 * the Focus editor), `'all'` corrects the others (it uniformly mirrors it).
 * Both correct through `canonicalSelfMirror` where the shape has a mirror axis
 * of its own, which keeps the Focus-mode layout intact — the instance shows it
 * rigidly moved. A genuinely chiral Void has no such axis and falls back to the
 * bounding-box mirror, right handedness at the cost of the placement.
 */
export function resolveVoidStamps(
  voids: StampableVoid[],
  records: VoidStampRecord[] | undefined,
): StampPlacement[] {
  if (!records || records.length === 0) return []
  const out: StampPlacement[] = []
  // Self-symmetry is a property of the congruent class, and the search is
  // O(n²) in the vertex count — memoise per signature, not per instance.
  const selfMirrors = new Map<string, StampTransform | null>()
  for (const rec of records) {
    if (rec.scope !== 'congruent') continue
    for (const v of voids) {
      if (v.signature !== rec.key) continue
      // Pose off the identity outline, but fit the image to the RENDERED
      // shape's box — the clip below is the rendered outline, so fitting to
      // the straight one left curved Voids with uncovered bands.
      const geo = stampGeometry(v.keyPolygon ?? v.polygon, v.polygon)
      if (!geo) continue
      const { pose, box } = geo
      // Focus-mode adjustment acts in canonical space, between the base fit
      // and the pose.
      let base = pose.toInstance
      let inner = rec.transform ? userTransformMatrix(box, rec.transform) : null
      // Which half needs correcting is the only difference between the two
      // uniform modes: 'never' fixes the reflected instances so the class
      // matches the Focus editor, 'all' fixes the others so it uniformly
      // mirrors it. Either way the class stops being half and half.
      const reflected = isReflectedPose(pose.toInstance)
      if (rec.mirror === 'never' ? reflected : rec.mirror === 'all' && !reflected) {
        let M = selfMirrors.get(v.signature)
        if (M === undefined) {
          M = canonicalSelfMirror(pose.points)
          selfMirrors.set(v.signature, M)
        }
        // With a self-mirror, `toInstance ∘ M` is a pure rotation+translation
        // OUTSIDE the user layout — the Focus placement arrives intact. Without
        // one, all that's left is pre-mirroring the image itself.
        if (M) base = composeTransforms(base, M)
        else inner = inner ? composeTransforms(inner, mirrorXMatrix(box)) : mirrorXMatrix(box)
      }
      const transform = inner ? composeTransforms(base, inner) : base
      out.push({
        clip: v.polygon,
        transform,
        image: rec.image,
        rect: fitImageRect(box, rec.width, rec.height, rec.fit),
        ...(v.holes?.length ? { clipHoles: v.holes } : null),
        ...(rec.overlap ? { overlap: true } : null),
      })
    }
  }
  return out
}
