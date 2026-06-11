import type { Vec2 } from '../utils/math'
import { centroid, cross, dist, dot, sub } from '../utils/math'

/**
 * Step 19.1 — global **Void** extraction (ADR-0005, TESSELLATION_REVAMP_PLAN
 * Step 19). A **Void** is a bounded face of the *global* arrangement of all
 * the rendered **Rays** (here taken as straight `Segment`s — curves are a
 * render-time overlay and the spec's default is to flatten). This module
 * builds a planar subdivision over the segments + a bounding outline and walks
 * its faces, returning each interior face plus a rotation/translation/
 * reflection-invariant **congruent signature** so that "all similar Voids"
 * can be coloured together (the Stage-1 Grouping scope).
 *
 * SPIKE SCOPE / known limitations (to address in 19.2+):
 * - **Connected arrangement assumed.** Faces with holes (an isolated strand
 *   loop floating inside another face, disconnected from the bound) are not
 *   composed into face+hole; each loop is returned as its own cycle. PIC
 *   strand networks are usually connected within a region, but a Void fully
 *   enclosed by a ring that doesn't touch the bound is the canonical gap.
 * - **Spurs** (dangling segment ends inside a face) are traced out-and-back
 *   into the face cycle as a zero-area spike, perturbing that Void's signature.
 * - **Convex bound only** (rectangle / shape Frame). n-ring (non-convex)
 *   outlines need per-edge clipping that isn't implemented here.
 */

export interface VoidRegion {
  /** CCW outline of the Void (flattened straight edges). */
  polygon: Vec2[]
  /** Absolute area in world units². */
  area: number
  /** Congruent signature: equal iff two Voids are congruent (same shape+size,
   * up to rotation / translation / reflection). 8 hex chars. */
  signature: string
}

export interface ExtractVoidsOptions {
  /** Vertex-identity snap distance (world units). Points closer than this fuse
   * to one arrangement vertex. Default 1e-3. */
  snap?: number
  /** Edge-length quantisation for the congruent signature (world units).
   * Default 0.5. */
  lengthSnap?: number
  /** Turn-angle quantisation for the congruent signature (radians).
   * Default ~0.5°. */
  angleSnap?: number
  /** Drop Voids whose area is below this (suppresses sliver faces from
   * near-degenerate crossings). Default 1e-3. */
  minArea?: number
}

interface Seg { a: Vec2; b: Vec2 }

const DEFAULTS = {
  snap: 1e-3,
  lengthSnap: 0.5,
  angleSnap: (0.5 * Math.PI) / 180,
  minArea: 1e-3,
}

// ─────────────────────────────────────────────────────────────────────────
// Convex-bound clipping (Cyrus–Beck)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Clip segment `a`→`b` to the interior of a convex polygon `bound`. Returns the
 * clipped segment, or null if it lies entirely outside (or degenerates to a
 * point). Winding-agnostic — the inward side is taken as the one containing the
 * bound centroid.
 */
export function clipSegmentToConvex(a: Vec2, b: Vec2, bound: Vec2[]): Seg | null {
  const c = centroid(bound)
  const d = sub(b, a)
  let tEnter = 0
  let tLeave = 1
  for (let i = 0; i < bound.length; i++) {
    const v0 = bound[i]
    const v1 = bound[(i + 1) % bound.length]
    const edge = sub(v1, v0)
    // Inward normal: perpendicular to the edge, oriented toward the centroid.
    let n = { x: -edge.y, y: edge.x }
    if (dot(n, sub(c, v0)) < 0) n = { x: -n.x, y: -n.y }
    const num = dot(n, sub(a, v0)) // n·(a - v0)
    const den = dot(n, d)          // n·(b - a)
    if (Math.abs(den) < 1e-12) {
      // Parallel to this edge: reject only if a is on the outside.
      if (num < 0) return null
      continue
    }
    const t = -num / den
    if (den > 0) {
      if (t > tEnter) tEnter = t
    } else {
      if (t < tLeave) tLeave = t
    }
    if (tEnter > tLeave) return null
  }
  if (tLeave - tEnter < 1e-9) return null
  return {
    a: { x: a.x + d.x * tEnter, y: a.y + d.y * tEnter },
    b: { x: a.x + d.x * tLeave, y: a.y + d.y * tLeave },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Arrangement + face extraction
// ─────────────────────────────────────────────────────────────────────────

const snapKey = (p: Vec2, snap: number): string =>
  `${Math.round(p.x / snap)},${Math.round(p.y / snap)}`

/** Parameter t∈[0,1] of point `p` projected onto segment a→b, or null if `p`
 * isn't on the segment (within `tol`). */
function paramOnSegment(p: Vec2, a: Vec2, b: Vec2, tol: number): number | null {
  const d = sub(b, a)
  const L2 = dot(d, d)
  if (L2 < tol * tol) return null
  const t = dot(sub(p, a), d) / L2
  if (t < -tol || t > 1 + tol) return null
  const proj = { x: a.x + d.x * t, y: a.y + d.y * t }
  if (dist(proj, p) > tol) return null
  return Math.max(0, Math.min(1, t))
}

/** Proper (non-parallel) intersection of a→b and c→d. Returns t on a→b if both
 * params lie within [0,1]; else null. */
function intersectParam(a: Vec2, b: Vec2, c: Vec2, dd: Vec2): number | null {
  const r = sub(b, a)
  const s = sub(dd, c)
  const denom = cross(r, s)
  if (Math.abs(denom) < 1e-12) return null
  const t = cross(sub(c, a), s) / denom
  const u = cross(sub(c, a), r) / denom
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return Math.max(0, Math.min(1, t))
}

interface Vertex {
  pt: Vec2
  outs: { toKey: string; angle: number }[]
}

/**
 * Extract the bounded Voids of the arrangement of `segments`, clipped to a
 * convex `bound` outline (viewport bbox or Shape-Frame outline). Each Void
 * carries a congruent `signature`.
 */
export function extractVoids(
  segments: { from: Vec2; to: Vec2 }[],
  bound: Vec2[],
  options: ExtractVoidsOptions = {},
): VoidRegion[] {
  const snap = options.snap ?? DEFAULTS.snap
  const lengthSnap = options.lengthSnap ?? DEFAULTS.lengthSnap
  const angleSnap = options.angleSnap ?? DEFAULTS.angleSnap
  const minArea = options.minArea ?? DEFAULTS.minArea

  // 1. Clip input segments to the bound; add the bound's own edges so faces
  //    close at the boundary.
  const segs: Seg[] = []
  for (const s of segments) {
    const clipped = clipSegmentToConvex(s.from, s.to, bound)
    if (clipped) segs.push(clipped)
  }
  for (let i = 0; i < bound.length; i++) {
    segs.push({ a: bound[i], b: bound[(i + 1) % bound.length] })
  }

  // 2. Split every segment at its intersections / T-junctions with the others.
  const verts = new Map<string, Vertex>()
  const edgeSet = new Set<string>()

  const canonPt = (p: Vec2): { key: string; pt: Vec2 } => {
    const key = snapKey(p, snap)
    let v = verts.get(key)
    if (!v) { v = { pt: p, outs: [] }; verts.set(key, v) }
    return { key, pt: v.pt }
  }

  // Spatial-grid broad-phase so step 2 isn't O(n²). Short segments are bucketed
  // by the grid cells their bbox covers; "long" segments (a few bound edges /
  // spanning strands) would pollute every cell, so they're kept in a small
  // brute-force list tested against everything. Candidate(i) = segments sharing
  // a cell with i, plus all long segments.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let lenSum = 0
  for (const s of segs) {
    minX = Math.min(minX, s.a.x, s.b.x); maxX = Math.max(maxX, s.a.x, s.b.x)
    minY = Math.min(minY, s.a.y, s.b.y); maxY = Math.max(maxY, s.a.y, s.b.y)
    lenSum += Math.abs(s.b.x - s.a.x) + Math.abs(s.b.y - s.a.y)
  }
  const cellSize = Math.max(
    lenSum / Math.max(1, segs.length),
    (maxX - minX) / 512, (maxY - minY) / 512, 1e-6,
  )
  const longThreshold = cellSize * 8
  const grid = new Map<string, number[]>()
  const longIdx: number[] = []
  const cellsOf = (s: Seg): string[] => {
    const keys: string[] = []
    const cx0 = Math.floor(Math.min(s.a.x, s.b.x) / cellSize)
    const cx1 = Math.floor(Math.max(s.a.x, s.b.x) / cellSize)
    const cy0 = Math.floor(Math.min(s.a.y, s.b.y) / cellSize)
    const cy1 = Math.floor(Math.max(s.a.y, s.b.y) / cellSize)
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) keys.push(`${cx},${cy}`)
    return keys
  }
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const span = Math.abs(s.b.x - s.a.x) + Math.abs(s.b.y - s.a.y)
    if (span > longThreshold) { longIdx.push(i); continue }
    for (const k of cellsOf(s)) {
      let arr = grid.get(k)
      if (!arr) { arr = []; grid.set(k, arr) }
      arr.push(i)
    }
  }
  const candidatesOf = (i: number): number[] => {
    const span = Math.abs(segs[i].b.x - segs[i].a.x) + Math.abs(segs[i].b.y - segs[i].a.y)
    // A long segment can cross anything → test against all others.
    if (span > longThreshold) {
      const all: number[] = []
      for (let j = 0; j < segs.length; j++) if (j !== i) all.push(j)
      return all
    }
    const set = new Set<number>()
    for (const k of cellsOf(segs[i])) {
      const arr = grid.get(k)
      if (arr) for (const j of arr) if (j !== i) set.add(j)
    }
    for (const j of longIdx) set.add(j)
    return [...set]
  }

  for (let i = 0; i < segs.length; i++) {
    const { a, b } = segs[i]
    const ts: number[] = [0, 1]
    for (const j of candidatesOf(i)) {
      const { a: c, b: d } = segs[j]
      const ti = intersectParam(a, b, c, d)
      if (ti !== null) ts.push(ti)
      // T-junctions + collinear overlaps: j's endpoints lying on i.
      const tc = paramOnSegment(c, a, b, snap)
      if (tc !== null) ts.push(tc)
      const td = paramOnSegment(d, a, b, snap)
      if (td !== null) ts.push(td)
    }
    ts.sort((x, y) => x - y)
    let prev: { key: string; pt: Vec2 } | null = null
    let prevT = -1
    for (const t of ts) {
      if (t - prevT < 1e-9) continue
      prevT = t
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      const cur = canonPt(p)
      if (prev && prev.key !== cur.key) {
        const ek = prev.key < cur.key ? `${prev.key}|${cur.key}` : `${cur.key}|${prev.key}`
        if (!edgeSet.has(ek)) {
          edgeSet.add(ek)
          const pv = verts.get(prev.key)!
          const cv = verts.get(cur.key)!
          pv.outs.push({ toKey: cur.key, angle: Math.atan2(cur.pt.y - prev.pt.y, cur.pt.x - prev.pt.x) })
          cv.outs.push({ toKey: prev.key, angle: Math.atan2(prev.pt.y - cur.pt.y, prev.pt.x - cur.pt.x) })
        }
      }
      prev = cur
    }
  }

  if (edgeSet.size === 0) return []
  for (const v of verts.values()) v.outs.sort((p, q) => p.angle - q.angle)

  // 3. Walk half-edges into face cycles. `next` of (u→v) is the outgoing edge
  //    at v immediately clockwise from the direction (v→u) — the standard
  //    DCEL face trace. Bounded faces come out with one consistent winding;
  //    the single outer (unbounded) face has the largest |area| and is dropped.
  const visited = new Set<string>()
  const cycles: Vec2[][] = []
  const maxSteps = edgeSet.size * 2 + 4

  for (const [fromKey, v] of verts) {
    for (const o of v.outs) {
      const startHe = `${fromKey}->${o.toKey}`
      if (visited.has(startHe)) continue
      const cycle: Vec2[] = []
      let curFrom = fromKey
      let curTo = o.toKey
      let steps = 0
      while (steps++ < maxSteps) {
        const he = `${curFrom}->${curTo}`
        if (visited.has(he)) break
        visited.add(he)
        cycle.push(verts.get(curFrom)!.pt)
        // At curTo, pick next clockwise from direction (curTo→curFrom).
        const vTo = verts.get(curTo)!
        const back = Math.atan2(
          verts.get(curFrom)!.pt.y - vTo.pt.y,
          verts.get(curFrom)!.pt.x - vTo.pt.x,
        )
        const outs = vTo.outs
        let best: { toKey: string; angle: number } | null = null
        let bestAng = -Infinity
        let globalMax: { toKey: string; angle: number } | null = null
        let globalMaxAng = -Infinity
        for (const e of outs) {
          if (e.angle > globalMaxAng) { globalMaxAng = e.angle; globalMax = e }
          if (e.angle < back - 1e-9 && e.angle > bestAng) { bestAng = e.angle; best = e }
        }
        const nxt = best ?? globalMax!
        curFrom = curTo
        curTo = nxt.toKey
        if (curFrom === fromKey && curTo === o.toKey) break
      }
      if (cycle.length >= 3) cycles.push(cycle)
    }
  }

  if (cycles.length === 0) return []

  // 4. Drop the outer face (max |signed area|); keep the rest as Voids.
  const areas = cycles.map(signedArea)
  let outerIdx = 0
  for (let i = 1; i < cycles.length; i++) {
    if (Math.abs(areas[i]) > Math.abs(areas[outerIdx])) outerIdx = i
  }

  const voids: VoidRegion[] = []
  for (let i = 0; i < cycles.length; i++) {
    if (i === outerIdx) continue
    const area = Math.abs(areas[i])
    if (area < minArea) continue
    const ccw = areas[i] < 0 ? cycles[i].slice().reverse() : cycles[i]
    // Drop collinear / duplicate vertices so two congruent Voids that differ
    // only by a T-junction vertex on a straight edge hash to the same
    // signature (otherwise group-fill leaves "random" siblings unpainted).
    const poly = simplifyCollinear(ccw)
    voids.push({ polygon: poly, area, signature: voidSignature(poly, lengthSnap, angleSnap) })
  }
  // 5. Canonicalise signatures across the field. Independent token rounding
  //    coin-flips when a true edge length / angle sits ON a quantisation
  //    boundary (e.g. a length at an odd multiple of lengthSnap/2): float
  //    noise at different field positions rounds either way and one congruent
  //    class splits into several signatures — "Matching leaves a few odd
  //    voids unpainted". Merge classes congruent within HALF a snap (≫ the
  //    noise, ≪ one snap, so intentionally-distinct classes never merge) and
  //    give every member the class's lexicographically-smallest signature.
  canonicaliseSignatures(voids, lengthSnap, angleSnap)
  return voids
}

/**
 * Raw (unquantised) alternating interior-angle / edge-length ring of a
 * CCW polygon — the numeric twin of `voidSignature`'s token ring.
 */
function rawRing(poly: Vec2[]): number[] {
  const n = poly.length
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]
    const cur = poly[i]
    const next = poly[(i + 1) % n]
    const inDir = sub(cur, prev)
    const outDir = sub(next, cur)
    const turn = Math.atan2(cross(inDir, outDir), dot(inDir, outDir))
    out.push(Math.PI - turn)        // even slots: interior angle (rad)
    out.push(dist(cur, next))       // odd slots: edge length
  }
  return out
}

/** Tolerance congruence of two raw rings under rotation + reflection.
 * Slot types must stay aligned: the forward ring is angle-first (even
 * rotations); plain reversal re-pairs each angle with its preceding edge and
 * lands edge-first (odd rotations re-align it). */
function ringsCongruent(a: number[], b: number[], lenTol: number, angTol: number): boolean {
  const m = a.length
  if (b.length !== m) return false
  const tolAt = (i: number) => (i % 2 === 0 ? angTol : lenTol)
  for (const [variant, rb] of [b, b.slice().reverse()].entries()) {
    for (let s = variant === 0 ? 0 : 1; s < m; s += 2) {
      let ok = true
      for (let i = 0; i < m && ok; i++) {
        if (Math.abs(a[i] - rb[(i + s) % m]) > tolAt(i)) ok = false
      }
      if (ok) return true
    }
  }
  return false
}

/** Merge quantisation-boundary signature splits: group the field's Voids by
 * tolerance congruence (half a snap — see `extractVoids` step 5) and rewrite
 * every member's signature to the group's lexicographically-smallest one.
 * Deterministic for a given field, so persisted records stay stable across
 * re-extractions of the same geometry. */
function canonicaliseSignatures(voids: VoidRegion[], lengthSnap: number, angleSnap: number): void {
  if (voids.length < 2) return
  const lenTol = lengthSnap / 2
  const angTol = angleSnap / 2
  interface Cls { ring: number[]; area: number; sigs: Set<string>; members: VoidRegion[] }
  const classes: Cls[] = []
  for (const v of voids) {
    const ring = rawRing(v.polygon)
    let cls: Cls | undefined
    for (const c of classes) {
      if (c.ring.length !== ring.length) continue
      if (Math.abs(c.area - v.area) > 0.01 * c.area + 0.1) continue
      if (ringsCongruent(c.ring, ring, lenTol, angTol)) { cls = c; break }
    }
    if (!cls) {
      cls = { ring, area: v.area, sigs: new Set(), members: [] }
      classes.push(cls)
    }
    cls.sigs.add(v.signature)
    cls.members.push(v)
  }
  for (const c of classes) {
    if (c.sigs.size < 2) continue
    let canonical: string | null = null
    for (const s of c.sigs) if (canonical === null || s < canonical) canonical = s
    for (const m of c.members) m.signature = canonical!
  }
}

/**
 * Remove vertices whose turn angle is ~0 (collinear with their neighbours) and
 * any zero-length steps. A T-junction where a neighbouring strand merely
 * touches a Void's straight edge injects such a vertex on one Void but not its
 * congruent sibling; dropping them makes the two outlines — and signatures —
 * identical.
 */
function simplifyCollinear(poly: Vec2[], angleTol = (1.5 * Math.PI) / 180): Vec2[] {
  const n = poly.length
  if (n < 4) return poly
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]
    const cur = poly[i]
    const next = poly[(i + 1) % n]
    const inDir = sub(cur, prev)
    const outDir = sub(next, cur)
    const turn = Math.atan2(cross(inDir, outDir), dot(inDir, outDir))
    if (Math.abs(turn) > angleTol) out.push(cur)
  }
  return out.length >= 3 ? out : poly
}

function signedArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y
  }
  return a / 2
}

// ─────────────────────────────────────────────────────────────────────────
// Congruent signature
// ─────────────────────────────────────────────────────────────────────────

/**
 * Rotation/translation/reflection-invariant signature of a polygon outline.
 * Two polygons are congruent iff their signatures match.
 *
 * Built from the cyclic sequence of **interior angles** (intrinsic — preserved
 * by rotation, translation *and* reflection, and >π at reflex corners) and
 * **edge lengths**, quantised, laid out as one alternating
 * `a…,e…,a…,e…` token ring. Canonicalised as the lexicographically-smallest
 * rotation over the ring and its reversal (start-vertex + traversal-direction
 * freedom). Interior angles are measured on the CCW-normalised polygon so the
 * value doesn't depend on the input winding.
 */
export function voidSignature(poly: Vec2[], lengthSnap: number, angleSnap: number): string {
  // Normalise to CCW so interior angle = π − signedTurn is well-defined, and
  // strip collinear / duplicate vertices so a stray T-junction vertex on a
  // straight edge can't change the signature of an otherwise-congruent Void.
  const simplified = simplifyCollinear(signedArea(poly) < 0 ? poly.slice().reverse() : poly)
  const ccw = simplified
  const n = ccw.length
  const tokens: string[] = [] // alternating a<angle>, e<edge>, … (length 2n)
  for (let i = 0; i < n; i++) {
    const prev = ccw[(i - 1 + n) % n]
    const cur = ccw[i]
    const next = ccw[(i + 1) % n]
    const inDir = sub(cur, prev)
    const outDir = sub(next, cur)
    const turn = Math.atan2(cross(inDir, outDir), dot(inDir, outDir)) // (−π, π]
    const interior = Math.PI - turn // (0, 2π), >π at reflex corners
    tokens.push(`a${Math.round(interior / angleSnap)}`)
    tokens.push(`e${Math.round(dist(cur, next) / lengthSnap)}`)
  }
  return hash8(minRotation(tokens))
}

/** Booth's algorithm — index of the lexicographically-smallest rotation of a
 * sequence under element-wise `<`. O(m), no string churn. */
function leastRotationIndex(s: string[]): number {
  const n = s.length
  const f = new Int32Array(2 * n).fill(-1)
  let k = 0
  for (let j = 1; j < 2 * n; j++) {
    const sj = s[j % n]
    let i = f[j - k - 1]
    while (i !== -1 && sj !== s[(k + i + 1) % n]) {
      if (sj < s[(k + i + 1) % n]) k = j - i - 1
      i = f[i]
    }
    if (i === -1 && sj !== s[k % n]) {
      if (sj < s[k % n]) k = j
      f[j - k] = -1
    } else {
      f[j - k] = i + 1
    }
  }
  return k % n
}

/** Lexicographically-smallest rotation of a token ring or its reversal.
 * Exported for the strand-signature builder (`strandGroups.ts`).
 *
 * O(m) via Booth's algorithm — the old all-rotations scan was O(m²) with a
 * string join per rotation, and dominated extraction on flattened-curve
 * fields (hundreds of tokens per Void). Tokens are compared with a `;`
 * suffix so the ordering is EXACTLY the old joined-string ordering (a bare
 * element-wise compare ranks prefix tokens differently, which would silently
 * re-canonicalise — and re-hash — existing persisted signatures). */
export function minRotation(tokens: string[]): string {
  const m = tokens.length
  if (m === 0) return ''
  const fwd = tokens.map(t => t + ';')
  const rev = fwd.slice().reverse()
  const a = leastRotationIndex(fwd)
  const b = leastRotationIndex(rev)
  const revTokens = tokens.slice().reverse()
  const sa = tokens.slice(a).concat(tokens.slice(0, a)).join(';')
  const sb = revTokens.slice(b).concat(revTokens.slice(0, b)).join(';')
  return sa < sb ? sa : sb
}

/** FNV-1a → 8 hex chars. Exported for the strand-signature builder. */
export function hash8(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
