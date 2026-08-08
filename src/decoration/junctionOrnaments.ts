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
  /** Every arm leaving this junction — two per thread pass, as the line work
   *  actually runs (`StrandJunction.arms`). Carried because the **twinkle**
   *  is built FROM the line work rather than stamped on it (`flarePathD`) —
   *  a dot or a star only needs `threadAngle`. */
  arms: Vec2[]
  /** Each arm's straight run (`StrandJunction.armSpans`) — what caps the
   *  twinkle's reach so it can't outrun the line work it is drawn along. */
  armSpans: number[]
  /** The turn at the end of each run (`StrandJunction.armTurns`) — how much of
   *  that run one SIDE of the arm can use (`insetForTurn`). */
  armTurns: number[]
  /**
   * The colour of the Strands meeting here, for an ornament set to match them
   * (`decoration/strandColour.ts`). `'none'` — the sentinel a removed strand
   * paint stores — means the line work is hidden here, and an ornament
   * matching it hides too. Absent when the caller didn't resolve colours.
   *
   * ONE colour for the whole junction: the threads can be painted
   * differently, and a wedge is bounded by two arms that may belong to two of
   * them, so there is no per-part answer to give. The caller resolves the
   * threads in enumeration order and hands over the first — deterministic,
   * and right whenever they agree, which is the case the option is for.
   */
  strandColour?: string
  signature: string
  /** Lattice-orbit key (`patch` rung). Equals `instanceKey` with no lattice. */
  patchKey: string
  /** World-position key (`instance` rung). */
  instanceKey: string
}

/** A resolved ornament, ready to draw. */
export interface JunctionPlacement {
  point: Vec2
  /** Final rotation in radians (thread alignment + the style's own offset).
   *  Zero for a twinkle: its geometry already follows the threads, so
   *  rotating it would take it off them. */
  angle: number
  /** The arms meeting here — the twinkle's geometry is derived from them. */
  arms: Vec2[]
  /** Each arm's straight run, aligned with `arms` — the twinkle's per-arm cap. */
  armSpans: number[]
  /** The turn ending each run, aligned with `arms` — see `insetForTurn`. */
  armTurns: number[]
  /** The colour to draw in: the style's own, or the Strands' where the style
   *  matches them. Resolved here so the renderer never has to ask again. */
  colour: string
  style: JunctionOrnamentStyle
}

/** A fresh twinkle's reach, in world units — a few strand widths at the
 *  default line weight, so switching shape doesn't jump the size. */
export const DEFAULT_TWINKLE_REACH = 12

/** The longest reach the panel offers. Generous on purpose: the point of the
 *  switch to world units is that a twinkle on a large tile has somewhere to
 *  go, and the old ceiling of ten strand widths was the complaint. */
export const MAX_TWINKLE_REACH = 200

export const DEFAULT_JUNCTION_ORNAMENT: JunctionOrnamentStyle = {
  shape: 'dot',
  size: 2.5,
  reach: DEFAULT_TWINKLE_REACH,
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
export function keyJunctions(
  junctions: readonly StrandJunction[],
  stamps: readonly Vec2[],
  /** Colour of chain `i` of the field the junctions came from — supply it to
   *  support ornaments that match the Strands. */
  colourOfStrand?: (strandIndex: number) => string,
): KeyedJunction[] {
  return junctions.map(j => {
    const orbit = nearestOffset(j.point, stamps)
    return {
      point: j.point,
      threadAngle: junctionAngle(j.arms),
      arms: j.arms,
      armSpans: j.armSpans,
      armTurns: j.armTurns,
      ...(colourOfStrand && j.strands.length > 0
        ? { strandColour: colourOfStrand(j.strands[0]) }
        : null),
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
    const colour = style.matchStrandColour ? j.strandColour ?? style.colour : style.colour
    // `'none'` is how a removed strand paint HIDES the line work. An ornament
    // told to match the Strands has to disappear with them, or removing a
    // strand colour would leave its junction ornaments floating.
    if (colour === 'none') continue
    // A twinkle is already drawn in the junction's own frame — the alignment
    // and rotation controls belong to the free-standing figures, and the panel
    // hides them for it rather than letting them turn a fillet off its arms.
    const base = style.shape === 'twinkle' ? 0
      : (style.align ?? 'thread') === 'thread' ? j.threadAngle : 0
    const angle = style.shape === 'twinkle' ? 0 : base + ((style.angle ?? 0) * Math.PI) / 180
    out.push({ point: j.point, angle, arms: j.arms, armSpans: j.armSpans, armTurns: j.armTurns, colour, style })
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
 * How far a **twinkle** runs along each arm, in world units.
 *
 * Absolute, not a multiple of the Strand width. The two are the same quantity
 * only while the line work and the tiles keep the same proportion, and they
 * don't: strand width is a drawing weight the user picks once, so on a large
 * tile a reach of "4 × strand width" is a barely-visible nub in the middle of
 * an empty field. What the user is aiming at is a distance into the tile.
 *
 * `size` is the pre-#57 reading and stays the fallback so a saved twinkle
 * draws at the length it was drawn at; nothing writes it for twinkles now.
 */
export function twinkleReach(style: JunctionOrnamentStyle, strandWidth: number): number {
  return style.reach ?? style.size * strandWidth
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
  // A twinkle is not a free-standing figure — it is built from the threads
  // themselves (`flarePathD`), so it never reaches this branch.
  return ''
}

/**
 * **Twinkle** — the crossing's corners rounded off.
 *
 * Not a figure stamped on the junction but a shape derived from the threads
 * meeting there: in each wedge between two adjacent arms, a fillet runs from a
 * point `reach` along one arm's side, curves in past the corner, and leaves
 * along the next arm's side. Filled, it reads as the two Strands swelling into
 * each other; hollow, as a thin web arcing across each corner.
 *
 * Because the shape IS the local line work, it cannot be a shared `<defs>`
 * path rotated into place like a dot or a star: it is built per junction, in
 * coordinates local to it, from
 *
 * - `incident` — the junction's **arms** (`StrandJunction.arms`): the two
 *   directions each thread pass actually leaves in, which is what makes an
 *   ordinary crossing four corners rather than two. They are given, never
 *   derived as ±through-direction: a thread only leaves antiparallel where
 *   the field is symmetric there, and on one that bends, half the bend is
 *   exactly how far off the strands the fillets land.
 * - `strandWidth` — the arms' half-width is where the fillet has to land, or
 *   it would float off the line work.
 * - `reach` — how far along each arm the fillet starts. One value for every
 *   arm: "further up this thread than that one" would need a per-thread
 *   control with no stable way to say *which* thread across a whole congruent
 *   class.
 * - `turns` — the signed turn the thread takes at the end of each arm's run
 *   (`StrandJunction.armTurns`). The span is measured down the **centre
 *   line**, but a fillet's side is an **offset** line, and on the inside of a
 *   bend an offset line leaves the Strand *before* the bend: the two segments'
 *   inner offsets meet `half·tan(turn/2)` short of the vertex. Running to the
 *   full span therefore pokes the fillet out past the line work and then cuts
 *   it off square — the visible bump at the end of a long twinkle. Each side
 *   is shortened by that much when the thread turns **toward** it, and left
 *   alone when it turns away (there the Strand's own join carries on past the
 *   vertex, so ending at it is already flush).
 * - `spans` — how far the line work actually runs in each arm's direction
 *   (`StrandJunction.armSpans`). **The reach is capped per arm on this.** An
 *   arm is a unit direction, so without the span the fillet's straight side
 *   follows a ray that goes on for ever: wind the reach up and it sails
 *   straight past the point where the thread turned, hanging out over empty
 *   ground. Capping cuts each side off where its Strand stops going that way,
 *   so a long reach fills the crossing further and further up the line work
 *   and stops when it runs out of line work — the two sides cap
 *   independently, which is why `a` and `b` can sit at different distances.
 * - `depth` — how far the curve dips toward the corner. 1 puts both tangent
 *   handles on the corner itself, so the curve comes right down to the tip of
 *   the crossing; 0 leaves them at the ends, making the fillet a flat chord
 *   with no dip at all. The curve leaves each arm ALONG the arm at every
 *   setting, so it always meets the Strand smoothly rather than at a kink.
 *
 * Wedges with no corner to round (two collinear arms — a thread crossed by
 * nothing on that side) are skipped rather than drawn degenerate.
 */
export function flarePathD(
  incident: readonly Vec2[],
  spans: readonly number[],
  turns: readonly number[],
  strandWidth: number,
  reach: number,
  depth: number,
): string {
  const half = strandWidth / 2
  // The arms come in already — two per thread pass, and NOT antiparallel
  // where the thread bends through the crossing. Synthesising them here as
  // ±dir is what put the fillets off the line work on every asymmetric field.
  const arms: { u: Vec2; span: number; turn: number }[] = []
  for (let i = 0; i < incident.length; i++) {
    const d = incident[i]
    const len = Math.hypot(d.x, d.y)
    if (len < 1e-9) continue
    // A missing span means the line work doesn't run that way, so the fillet
    // gets its minimum on that side. It deliberately does NOT mean "no limit":
    // treating an absent span as unbounded is how a span bug hid — half of
    // every twinkle silently stopped capping instead of visibly shrinking.
    const span = spans[i]
    const t = turns[i]
    arms.push({
      u: { x: d.x / len, y: d.y / len },
      span: Number.isFinite(span) && span > 0 ? span : 0,
      turn: Number.isFinite(t) ? t : 0,
    })
  }
  if (arms.length < 2) return ''
  // Normalised to [0, 2π) — the same walk `armGapRing` takes, and immune to
  // the signed zero that `atan2(-0, -1) = -π` would otherwise smuggle in.
  // Only the order wedges are emitted in depends on it; the ring is the same.
  const turn = (v: Vec2) => {
    const a = Math.atan2(v.y, v.x)
    return a < 0 ? a + 2 * Math.PI : a
  }
  arms.sort((a, b) => turn(a.u) - turn(b.u))

  const k = Math.max(0, Math.min(1, depth))
  let d = ''
  for (let i = 0; i < arms.length; i++) {
    const { u, span: spanU, turn: turnU } = arms[i]
    const { u: v, span: spanV, turn: turnV } = arms[(i + 1) % arms.length]
    // `v` is the next arm counter-clockwise, so the wedge's inward normals are
    // fixed: CCW off `u`, CW off `v`. `sin` is the wedge angle's sine — zero
    // when the arms are collinear, i.e. no corner exists to round.
    const sin = u.x * v.y - u.y * v.x
    if (sin <= 1e-6) continue
    const nu = { x: -u.y, y: u.x }
    const nv = { x: v.y, y: -v.x }
    const a0 = { x: nu.x * half, y: nu.y * half }
    const b0 = { x: nv.x * half, y: nv.y * half }
    // Corner: where the two arms' wedge-side edges meet.
    const t = ((b0.x - a0.x) * v.y - (b0.y - a0.y) * v.x) / sin
    if (!isFinite(t) || t < 0) continue
    const corner = { x: a0.x + u.x * t, y: a0.y + u.y * t }
    // The same corner seen from the other arm. Not `t`: the two arms only
    // reach it at the same distance when the wedge is symmetric, and once the
    // sides can be capped independently the difference is visible.
    const tv = (corner.x - b0.x) * v.x + (corner.y - b0.y) * v.y
    // How much of each run this SIDE can use. `u`'s side of the wedge is its
    // CCW normal, so the thread turning CCW (turn > 0) at the end of the run
    // bends *toward* it and the offset line leaves the Strand early; `v`'s
    // side is its CW normal, so it is the CW turn that shortens it.
    const usableU = spanU - insetForTurn(turnU, half)
    const usableV = spanV - insetForTurn(-turnV, half)
    // Each side runs to the reach, cut off where its own Strand stops going
    // that way, and never short of the corner — a fillet that started inside
    // the crossing would cut into the line work instead of rounding it.
    const lenU = Math.max(Math.min(reach, usableU), t + strandWidth * 0.15)
    const lenV = Math.max(Math.min(reach, usableV), tv + strandWidth * 0.15)
    const a = { x: a0.x + u.x * lenU, y: a0.y + u.y * lenU }
    const b = { x: b0.x + v.x * lenV, y: b0.y + v.y * lenV }
    // Depth 1 puts both handles on the corner (the curve dips to the tip of
    // the crossing); depth 0 leaves them at the ends, i.e. a flat chord.
    const hu = (lenU - t) * k
    const hv = (lenV - tv) * k
    const c1 = { x: a.x - u.x * hu, y: a.y - u.y * hu }
    const c2 = { x: b.x - v.x * hv, y: b.y - v.y * hv }
    d += `M${a.x},${a.y}C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}L${corner.x},${corner.y}Z`
  }
  return d
}

/**
 * How far short of a bend an **offset** line stops being the Strand's edge.
 *
 * The run is measured down the centre line, but a fillet's side is offset by
 * half the stroke width, and on the inside of a turn the two segments' offsets
 * meet `half · tan(turn/2)` before the vertex. A shape run to the full span
 * therefore overhangs the line work there and gets cut off square — which is
 * exactly what the bump at the end of a long twinkle was.
 *
 * Zero when the thread turns the other way: on the outside of a bend the
 * Strand's own join carries the edge past the vertex, so stopping at it is
 * already flush. Clamped well short of a half turn, where the tangent runs
 * away and a doubled-back thread would eat the whole run.
 */
function insetForTurn(turn: number, half: number): number {
  if (!(turn > 1e-6)) return 0
  const a = Math.min(turn, (150 * Math.PI) / 180)
  return half * Math.tan(a / 2)
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
export function ornamentPaint(style: JunctionOrnamentStyle, r: number, colour = style.colour): {
  radius: number
  fill: string
  stroke: string | undefined
  strokeWidth: number
} {
  if (!style.hollow) return { radius: r, fill: colour, stroke: undefined, strokeWidth: 0 }
  const w = r * Math.max(0.05, Math.min(0.6, style.outlineWidth ?? 0.25))
  return {
    radius: Math.max(r - w / 2, r * 0.1),
    fill: style.hollowFill ?? 'none',
    stroke: colour,
    strokeWidth: w,
  }
}

/** Split placements by which side of the Strands they draw on. */
export function splitJunctionLayers(placements: readonly JunctionPlacement[]): {
  under: JunctionPlacement[]
  over: JunctionPlacement[]
} {
  const under: JunctionPlacement[] = []
  const over: JunctionPlacement[] = []
  for (const p of placements) ((p.style.layer ?? 'over') === 'under' ? under : over).push(p)
  return { under, over }
}
