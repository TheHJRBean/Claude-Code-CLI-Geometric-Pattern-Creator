import type { Vec2 } from '../utils/math'
import type { JunctionOrnamentRecord, JunctionOrnamentStyle } from '../types/editor'
import type { StrandJunction } from '../strand/junctions'
import { junctionAngle } from '../strand/junctions'
import { KEY_TOL, parseScopedKey, scopedKey } from './scopes'

/**
 * **Junction ornaments** — a dot, star or twinkle drawn where Strands cross.
 *
 * The third Decoration target after areas (Voids) and lines (Strands): the
 * *points* of the arrangement. Where the crossings are is `strand/junctions.ts`'
 * job — the same enumeration the weave interlaces over, so an ornament can only
 * land where a thread really passes another (never on a dead end).
 *
 * This module owns identity and resolution. Both mirror the Void/Strand ladder
 * exactly, because the problem is the same one: the field is re-derived every
 * frame, so a record has to **re-find** its junctions rather than point at them.
 *
 * - `congruent` `'*'`  — every junction (**All**).
 * - `congruent` `<sig>` — every junction with the same threads meeting at the
 *   same angles, anywhere in the field, however rotated or mirrored
 *   (**Matching**).
 * - `patch` `<sig>@<orbit>` — that junction's spot in every Patch repeat
 *   (**Repeat**).
 * - `instance` `<sig>@<world>` — one junction (**Single**).
 *
 * There is deliberately no `cell` (Twins) rung: that key is the canonical hash
 * of a target's *outline* within its Cell's symmetry orbit (`cellScope.ts`),
 * and a junction is a point — it has no outline to canonicalise. Offering the
 * rung would give the user a control that quietly did something else.
 */

/**
 * Whether junction ornaments apply to this Strand style — **v1: solid only**.
 *
 * A `'lines'` stroke is drawn by cutting bands out of a mask, so at a crossing
 * the line work is already a lattice of slivers; an ornament centred there
 * covers the very thing the divisions are for, and a hollow one frames a
 * fragment of the mask rather than the crossing. Rather than draw something
 * misleading, the whole target is withheld and the panel says why.
 *
 * The single predicate both the renderer and the panel ask, so the control and
 * what it produces can't disagree.
 */
export function junctionOrnamentsSupported(strand: { lineStyle?: string }): boolean {
  return (strand.lineStyle ?? 'solid') === 'solid'
}

/** A junction with its identity keys resolved — the render + hit-test unit. */
export interface KeyedJunction {
  point: Vec2
  /** Ornament orientation from the threads (radians); see `junctionAngle`. */
  threadAngle: number
  signature: string
  /** Lattice-orbit key (`patch` rung). Equals `instanceKey` with no lattice. */
  patchKey: string
  /** World-position key (`instance` rung). */
  instanceKey: string
}

/** A resolved ornament, ready to draw. */
export interface JunctionPlacement {
  point: Vec2
  /** Final rotation in radians (thread alignment + the style's own offset). */
  angle: number
  style: JunctionOrnamentStyle
}

export const DEFAULT_JUNCTION_ORNAMENT: JunctionOrnamentStyle = {
  shape: 'dot',
  size: 2.5,
  points: 6,
  innerRatio: 0.45,
  align: 'thread',
  angle: 0,
  colour: '#d4af37',
  hollow: false,
  outlineWidth: 0.25,
}

/**
 * Key every junction of a field. `stamps` are the Lattice translations used to
 * reduce a world point to its orbit position — pass an empty list on a legacy
 * substrate, where `patch` then collapses onto `instance` (which is why the
 * panel withholds the rung there, as it does for Voids).
 */
export function keyJunctions(junctions: readonly StrandJunction[], stamps: readonly Vec2[]): KeyedJunction[] {
  return junctions.map(j => {
    const orbit = nearestOffset(j.point, stamps)
    return {
      point: j.point,
      threadAngle: junctionAngle(j.dirs),
      signature: j.signature,
      patchKey: scopedKey(j.signature, orbit),
      instanceKey: scopedKey(j.signature, j.point),
    }
  })
}

/** A point's offset from its nearest lattice stamp. Mirrors `orbitOffset`,
 *  which takes the same deterministic tie-break; kept separate only so this
 *  module doesn't depend on a Void-shaped signature. */
function nearestOffset(p: Vec2, stamps: readonly Vec2[]): Vec2 {
  let best: Vec2 | null = null
  let bestD = Infinity
  for (const st of stamps) {
    const dx = p.x - st.x
    const dy = p.y - st.y
    const d = dx * dx + dy * dy
    if (
      d < bestD - 1e-9
      || (Math.abs(d - bestD) <= 1e-9 && best !== null
        && (st.x < best.x - 1e-9 || (Math.abs(st.x - best.x) <= 1e-9 && st.y < best.y - 1e-9)))
    ) {
      bestD = d
      best = st
    }
  }
  if (!best) return p
  return { x: p.x - best.x, y: p.y - best.y }
}

interface PositionedOrnament {
  signature: string
  x: number
  y: number
  style: JunctionOrnamentStyle
}

/** Pre-indexed records for per-junction resolution. Build once per record-list
 *  change, then resolve per junction. */
export interface JunctionIndex {
  /** The `'*'` record (every junction), or null. */
  all: JunctionOrnamentStyle | null
  bySignature: Map<string, JunctionOrnamentStyle>
  patch: PositionedOrnament[]
  instance: PositionedOrnament[]
  /** True when nothing is bound — lets callers skip the whole pass. */
  empty: boolean
}

export function buildJunctionIndex(records: readonly JunctionOrnamentRecord[] | undefined): JunctionIndex {
  const idx: JunctionIndex = { all: null, bySignature: new Map(), patch: [], instance: [], empty: true }
  if (!records || records.length === 0) return idx
  for (const r of records) {
    const { scope, key, ...style } = r
    if (scope === 'congruent') {
      if (key === '*') idx.all = style
      else idx.bySignature.set(key, style)
      continue
    }
    // `cell` is not a junction rung (see the module note); a record carrying it
    // — from a hand-edited save — is ignored rather than matched loosely.
    if (scope === 'cell') continue
    const parsed = parseScopedKey(key)
    if (!parsed) continue
    const rec: PositionedOrnament = { signature: parsed.signature, x: parsed.x, y: parsed.y, style }
    if (scope === 'patch') idx.patch.push(rec)
    else idx.instance.push(rec)
  }
  idx.empty = !idx.all && idx.bySignature.size === 0 && idx.patch.length === 0 && idx.instance.length === 0
  return idx
}

function matchPositioned(recs: PositionedOrnament[], signature: string, p: Vec2, tol: number): JunctionOrnamentStyle | null {
  // Later records win (a later paint overrides an earlier one in the same rung).
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i]
    if (r.signature !== signature) continue
    if (Math.abs(r.x - p.x) <= tol && Math.abs(r.y - p.y) <= tol) return r.style
  }
  return null
}

/**
 * The ornament one junction wears, or null. Precedence is the ladder's:
 * instance > patch > congruent signature > `'*'` — finer wins, exactly as for
 * Void fills and Strand colours.
 */
export function resolveJunctionOrnament(
  idx: JunctionIndex,
  j: KeyedJunction,
  tol = KEY_TOL,
): JunctionOrnamentStyle | null {
  if (idx.instance.length > 0) {
    const s = matchPositioned(idx.instance, j.signature, j.point, tol)
    if (s) return s
  }
  if (idx.patch.length > 0) {
    const parsed = parseScopedKey(j.patchKey)
    if (parsed) {
      const s = matchPositioned(idx.patch, j.signature, { x: parsed.x, y: parsed.y }, tol)
      if (s) return s
    }
  }
  return idx.bySignature.get(j.signature) ?? idx.all
}

/** Resolve every junction's ornament into draw-ready placements. */
export function resolveJunctionPlacements(
  junctions: readonly KeyedJunction[],
  records: readonly JunctionOrnamentRecord[] | undefined,
): JunctionPlacement[] {
  const idx = buildJunctionIndex(records)
  if (idx.empty) return []
  const out: JunctionPlacement[] = []
  for (const j of junctions) {
    const style = resolveJunctionOrnament(idx, j)
    if (!style) continue
    const base = (style.align ?? 'thread') === 'thread' ? j.threadAngle : 0
    out.push({ point: j.point, angle: base + ((style.angle ?? 0) * Math.PI) / 180, style })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────
// Ornament geometry
// ─────────────────────────────────────────────────────────────────────────

/** Clamped point count for a star / twinkle. */
export function ornamentPoints(style: JunctionOrnamentStyle): number {
  return Math.max(3, Math.min(12, Math.round(style.points ?? 6)))
}

/** Clamped waist ratio for a star / twinkle. */
export function ornamentInnerRatio(style: JunctionOrnamentStyle): number {
  return Math.max(0.05, Math.min(0.9, style.innerRatio ?? 0.45))
}

/**
 * The ornament outline as an SVG path, centred on the origin at radius `r`.
 * The caller places and rotates it (`translate` + `rotate`), so one path
 * serves every instance of a style and the geometry stays independent of
 * where the junction is.
 *
 * A hollow ornament is the SAME outline stroked rather than filled — not a
 * second, smaller shape — so a dot and a ring read as the same ornament at the
 * same size, and the hollow's fill sits exactly inside the outline.
 */
export function ornamentPathD(style: JunctionOrnamentStyle, r: number): string {
  if (style.shape === 'dot') {
    // Two arcs: a full circle in one path, so every shape takes the same
    // fill / stroke treatment downstream.
    return `M${-r},0A${r},${r} 0 1 0 ${r},0A${r},${r} 0 1 0 ${-r},0Z`
  }
  const n = ornamentPoints(style)
  const inner = r * ornamentInnerRatio(style)
  const step = Math.PI / n // half a point-to-point turn
  const tip = (i: number): Vec2 => ({ x: r * Math.cos(2 * i * step - Math.PI / 2), y: r * Math.sin(2 * i * step - Math.PI / 2) })
  const waist = (i: number): Vec2 => ({
    x: inner * Math.cos((2 * i + 1) * step - Math.PI / 2),
    y: inner * Math.sin((2 * i + 1) * step - Math.PI / 2),
  })
  if (style.shape === 'star') {
    let d = ''
    for (let i = 0; i < n; i++) {
      const t = tip(i)
      const w = waist(i)
      d += `${i === 0 ? 'M' : 'L'}${t.x},${t.y}L${w.x},${w.y}`
    }
    return `${d}Z`
  }
  // Twinkle: the same tips, but the sides bow INWARD through the waist —
  // the sparkle silhouette. Quadratic control at the waist point pulled
  // towards the centre gives the concave sweep without a second radius knob.
  let d = ''
  for (let i = 0; i < n; i++) {
    const t = tip(i)
    const next = tip((i + 1) % n)
    const w = waist(i)
    const c = { x: w.x * 0.45, y: w.y * 0.45 }
    if (i === 0) d += `M${t.x},${t.y}`
    d += `Q${c.x},${c.y} ${next.x},${next.y}`
  }
  return `${d}Z`
}

/**
 * How the ornament is painted. Solid = filled in its colour; hollow = the
 * outline stroked in its colour, with `hollowFill` (if any) inside.
 *
 * A hollow ornament's stroke is centred on the outline, so half of it hangs
 * outside the nominal radius; the radius is reduced by half the stroke width
 * to keep a hollow ornament the same overall size as the solid one it toggles
 * from — otherwise turning "hollow" on visibly grows the ornament.
 */
export function ornamentPaint(style: JunctionOrnamentStyle, r: number): {
  radius: number
  fill: string
  stroke: string | undefined
  strokeWidth: number
} {
  if (!style.hollow) return { radius: r, fill: style.colour, stroke: undefined, strokeWidth: 0 }
  const w = r * Math.max(0.05, Math.min(0.6, style.outlineWidth ?? 0.25))
  return {
    radius: Math.max(r - w / 2, r * 0.1),
    fill: style.hollowFill ?? 'none',
    stroke: style.colour,
    strokeWidth: w,
  }
}
