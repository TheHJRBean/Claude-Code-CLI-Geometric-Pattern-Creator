import type { Vec2 } from '../utils/math'
import { dot, sub } from '../utils/math'
import { signedArea } from './voids'

/**
 * Union of a set of **face outlines from one planar arrangement** — the
 * geometry behind **Combine** (`voidMerge.ts`), which fuses several adjacent
 * Voids into one shape for the Decoration Phase.
 *
 * This is not a general polygon-boolean library and does not need to be. The
 * inputs are faces of the same arrangement, so they meet edge-to-edge and never
 * properly overlap: the union boundary is exactly the edges that belong to only
 * ONE member, and every edge belonging to two members is an internal **seam**.
 * That makes the whole operation edge cancellation plus a face walk — no
 * intersection arithmetic, so no robustness cliff at near-tangent edges.
 *
 * The one thing that isn't free is that the outlines arrive
 * **independently simplified** (`extractVoids` runs `simplifyCollinear` per
 * face). A T-junction where a third strand touches face A's straight edge from
 * outside is collinear on A — dropped — while its neighbour B, whose boundary
 * stops at that junction, keeps it. So A carries `p→r` where B carries `q→p`,
 * and naive pair cancellation leaves both, stitching a seam into the outline as
 * a zero-width spike. Step 1 re-splits every edge at any member vertex lying on
 * it, which restores the exact pairing.
 */

export interface OutlineUnion {
  /** CCW outer boundary loops, largest area first. A connected member set
   * yields exactly one; more means the input wasn't edge-connected. */
  outers: Vec2[][]
  /** CW hole loops — a member set that rings an unselected Void. */
  holes: Vec2[][]
  /** The internal edges the union erased: each shared by two members. What the
   * seam-cover render paints over so the group reads as one shape. */
  seams: [Vec2, Vec2][]
}

const EMPTY: OutlineUnion = { outers: [], holes: [], seams: [] }

/** Parameter t∈[0,1] of `p` projected onto a→b, or null when `p` isn't on the
 * segment within `tol`. (Local twin of the `voids.ts` helper — kept private
 * there, and this module's tolerance story is its own.) */
function paramOnSegment(p: Vec2, a: Vec2, b: Vec2, tol: number): number | null {
  const d = sub(b, a)
  const L2 = dot(d, d)
  if (L2 < tol * tol) return null
  const t = dot(sub(p, a), d) / L2
  if (t <= 0 || t >= 1) return null
  const proj = { x: a.x + d.x * t, y: a.y + d.y * t }
  return Math.hypot(proj.x - p.x, proj.y - p.y) <= tol ? t : null
}

/**
 * Union of `polys` (each a closed outline, winding-agnostic). `tol` is the
 * vertex-identity snap: points closer than this are one vertex. Default 1e-3,
 * matching `extractVoids`'s own snap, so faces that shared a vertex there share
 * one here.
 */
export function unionOutlines(polys: Vec2[][], tol = 1e-3): OutlineUnion {
  const usable = polys.filter(p => p.length >= 3)
  if (usable.length === 0) return EMPTY
  if (usable.length === 1) {
    const p = usable[0]
    return { outers: [signedArea(p) < 0 ? p.slice().reverse() : p], holes: [], seams: [] }
  }

  const keyOf = (p: Vec2): string => `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`
  const pts = new Map<string, Vec2>()
  for (const poly of usable) {
    for (const p of poly) if (!pts.has(keyOf(p))) pts.set(keyOf(p), p)
  }
  // Bucket the vertex set so the re-split scan below is local, not O(V) per
  // edge — a merged group is small, but this also runs per candidate group on
  // every re-extraction.
  const cell = Math.max(tol * 64, 1e-6)
  const buckets = new Map<string, Vec2[]>()
  for (const p of pts.values()) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
    const arr = buckets.get(k)
    if (arr) arr.push(p)
    else buckets.set(k, [p])
  }
  const near = (a: Vec2, b: Vec2): Vec2[] => {
    const out: Vec2[] = []
    const x0 = Math.floor(Math.min(a.x, b.x) / cell) - 1
    const x1 = Math.floor(Math.max(a.x, b.x) / cell) + 1
    const y0 = Math.floor(Math.min(a.y, b.y) / cell) - 1
    const y1 = Math.floor(Math.max(a.y, b.y) / cell) + 1
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const arr = buckets.get(`${x},${y}`)
        if (arr) out.push(...arr)
      }
    }
    return out
  }

  // 1. Directed edges, CCW-normalised so every member keeps the union interior
  //    on its left, and re-split at any member vertex lying on them.
  const directed: { a: string; b: string }[] = []
  for (const poly of usable) {
    const ccw = signedArea(poly) < 0 ? poly.slice().reverse() : poly
    for (let i = 0; i < ccw.length; i++) {
      const a = ccw[i]
      const b = ccw[(i + 1) % ccw.length]
      const ka = keyOf(a)
      const kb = keyOf(b)
      if (ka === kb) continue
      const cuts: { t: number; key: string }[] = []
      for (const p of near(a, b)) {
        const k = keyOf(p)
        if (k === ka || k === kb) continue
        const t = paramOnSegment(p, a, b, tol)
        if (t !== null) cuts.push({ t, key: k })
      }
      cuts.sort((x, y) => x.t - y.t)
      let prev = ka
      for (const c of cuts) {
        if (c.key === prev) continue
        directed.push({ a: prev, b: c.key })
        prev = c.key
      }
      if (prev !== kb) directed.push({ a: prev, b: kb })
    }
  }

  // 2. Cancel opposite pairs — those are the internal seams. What survives is
  //    the union boundary, still interior-on-the-left.
  const counts = new Map<string, number>()
  for (const e of directed) {
    const k = `${e.a}>${e.b}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const seams: [Vec2, Vec2][] = []
  const seen = new Set<string>()
  for (const [k, n] of counts) {
    const [a, b] = k.split('>')
    const rk = `${b}>${a}`
    if (seen.has(rk)) continue
    seen.add(k)
    const m = counts.get(rk) ?? 0
    const cancelled = Math.min(n, m)
    if (cancelled === 0) continue
    counts.set(k, n - cancelled)
    counts.set(rk, m - cancelled)
    for (let i = 0; i < cancelled; i++) seams.push([pts.get(a)!, pts.get(b)!])
  }

  // 3. Walk the surviving half-edges into loops. Same rule as the arrangement
  //    trace in `extractVoids`: at the far vertex take the outgoing edge
  //    immediately clockwise from the way back, which keeps the region on the
  //    left throughout.
  interface Out { toKey: string; angle: number; used: boolean }
  const outs = new Map<string, Out[]>()
  for (const [k, n] of counts) {
    if (n <= 0) continue
    const [a, b] = k.split('>')
    const pa = pts.get(a)!
    const pb = pts.get(b)!
    const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x)
    const arr = outs.get(a) ?? []
    for (let i = 0; i < n; i++) arr.push({ toKey: b, angle, used: false })
    outs.set(a, arr)
  }
  for (const arr of outs.values()) arr.sort((p, q) => p.angle - q.angle)

  const loops: Vec2[][] = []
  let budget = directed.length * 2 + 8
  for (const [startKey, arr] of outs) {
    for (const first of arr) {
      if (first.used) continue
      first.used = true
      const loop: Vec2[] = [pts.get(startKey)!]
      let from = startKey
      let to = first.toKey
      while (budget-- > 0) {
        if (to === startKey) break
        loop.push(pts.get(to)!)
        const cand = outs.get(to)
        if (!cand) break
        const pFrom = pts.get(from)!
        const pTo = pts.get(to)!
        const back = Math.atan2(pFrom.y - pTo.y, pFrom.x - pTo.x)
        let best: Out | null = null
        let bestAng = -Infinity
        let wrap: Out | null = null
        let wrapAng = -Infinity
        for (const o of cand) {
          if (o.used) continue
          if (o.angle > wrapAng) { wrapAng = o.angle; wrap = o }
          if (o.angle < back - 1e-9 && o.angle > bestAng) { bestAng = o.angle; best = o }
        }
        const next = best ?? wrap
        if (!next) break
        next.used = true
        from = to
        to = next.toKey
      }
      if (loop.length >= 3) loops.push(loop)
    }
  }

  const outers: Vec2[][] = []
  const holes: Vec2[][] = []
  for (const l of loops) (signedArea(l) > 0 ? outers : holes).push(l)
  outers.sort((a, b) => signedArea(b) - signedArea(a))
  return { outers, holes, seams }
}
