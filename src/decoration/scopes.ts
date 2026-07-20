import type { Vec2 } from '../utils/math'
import type { ColourRecord, GradientSpec, GroupingScope } from '../types/editor'

/**
 * Step 19 Stage 2 — **Grouping scope** keys + colour resolution (ADR-0005).
 *
 * Stage 1 keyed every record by congruent signature only. Stage 2 adds the
 * `patch` and `instance` rungs, whose keys also carry a position:
 *
 * - `congruent` → `<sig>` (or `'*'` for "all targets") — every congruent copy.
 * - `patch`     → `<sig>@<x>,<y>` where (x, y) is the target's centroid
 *                 *relative to its nearest lattice-stamp translation* — i.e.
 *                 the Lattice-orbit id. Colours that spot in every Patch repeat.
 * - `cell`      → `<sig>#<cellTag>:<hash>` — the canonical Cell-symmetry-orbit
 *                 outline hash (`cellScope.ts`): the target plus its
 *                 rotation/mirror twins within the Cell, per repeat. Matched
 *                 by exact string equality (the hash quantises internally).
 * - `instance`  → `<sig>@<x>,<y>` where (x, y) is the absolute **world**
 *                 centroid — exactly one target.
 *
 * Keys stay plain strings (the persisted `ColourRecord` schema is unchanged);
 * matching is numeric with a small tolerance so float noise across separate
 * extraction runs can't orphan a record. Precedence when several records hit
 * the same target: instance > patch > congruent `<sig>` > congruent `'*'`,
 * with later records winning inside one rung (later paints override).
 */

/** Position tolerance (world units) when matching a positioned key. */
export const KEY_TOL = 0.05

/** Encode a positioned scope key. 2 dp keeps keys short; matching is numeric. */
export function scopedKey(signature: string, p: Vec2): string {
  return `${signature}@${p.x.toFixed(2)},${p.y.toFixed(2)}`
}

export interface ParsedScopedKey {
  signature: string
  x: number
  y: number
}

/** Parse a positioned scope key. Returns null for bare/congruent keys. */
export function parseScopedKey(key: string): ParsedScopedKey | null {
  const at = key.lastIndexOf('@')
  if (at < 0) return null
  const [xs, ys] = key.slice(at + 1).split(',')
  const x = Number(xs)
  const y = Number(ys)
  if (!isFinite(x) || !isFinite(y)) return null
  return { signature: key.slice(0, at), x, y }
}

/**
 * A target's offset from its nearest stamp translation — the Lattice-orbit
 * position used by `patch`-scope keys. Tie-breaks deterministically (smallest
 * distance, then smallest stamp x, then y) so the chosen stamp doesn't depend
 * on viewport-dependent stamp ordering when a centroid is equidistant.
 * `stamps` should include the origin; an empty list returns `c` unchanged.
 */
export function orbitOffset(c: Vec2, stamps: Vec2[]): Vec2 {
  let best: Vec2 | null = null
  let bestD = Infinity
  for (const st of stamps) {
    const dx = c.x - st.x
    const dy = c.y - st.y
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
  if (!best) return c
  return { x: c.x - best.x, y: c.y - best.y }
}

/** A resolved fill: flat colour plus the optional gradient that wins over it
 * at render (DECORATION_GRADIENTS_SPEC — `colour` stays representative). */
export interface FillStyle {
  colour: string
  gradient?: GradientSpec
}

interface PositionedRecord extends ParsedScopedKey {
  colour: string
  gradient?: GradientSpec
}

/**
 * Pre-indexed `ColourRecord[]` for per-target colour resolution. Build once
 * per record-list change, then `resolve` per target.
 */
export interface ColourIndex {
  /** congruent `'*'` fill (all targets), or null. */
  starColour: FillStyle | null
  /** congruent signature → fill. */
  bySignature: Map<string, FillStyle>
  /** Parsed `patch`-scope records, in record order. */
  patch: PositionedRecord[]
  /** `cell`-scope records: canonical orbit key → fill (later records win,
   * matched by exact equality — see `cellScope.ts`). */
  cell: Map<string, FillStyle>
  /** Parsed `instance`-scope records, in record order. */
  instance: PositionedRecord[]
  /** True when any record needs a positioned (patch/cell/instance) match. */
  hasPositioned: boolean
  /** True when any `instance` record exists (world-space render path needed). */
  hasInstance: boolean
}

export function buildColourIndex(records: ColourRecord[] | undefined): ColourIndex {
  const idx: ColourIndex = {
    starColour: null,
    bySignature: new Map(),
    patch: [],
    cell: new Map(),
    instance: [],
    hasPositioned: false,
    hasInstance: false,
  }
  if (!records) return idx
  for (const r of records) {
    const fill: FillStyle = r.gradient ? { colour: r.colour, gradient: r.gradient } : { colour: r.colour }
    if (r.scope === 'congruent') {
      if (r.key === '*') idx.starColour = fill
      else idx.bySignature.set(r.key, fill)
      continue
    }
    if (r.scope === 'cell') {
      // Map insertion order means later records naturally win.
      idx.cell.set(r.key, fill)
      continue
    }
    const parsed = parseScopedKey(r.key)
    if (!parsed) continue
    const rec: PositionedRecord = { ...parsed, ...fill }
    if (r.scope === 'patch') idx.patch.push(rec)
    else idx.instance.push(rec)
  }
  idx.hasPositioned = idx.patch.length > 0 || idx.cell.size > 0 || idx.instance.length > 0
  idx.hasInstance = idx.instance.length > 0
  return idx
}

function matchPositioned(
  recs: PositionedRecord[],
  signature: string,
  p: Vec2,
  tol: number,
): FillStyle | null {
  // Later records win (later paints override earlier ones in the same rung).
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i]
    if (r.signature !== signature) continue
    if (Math.abs(r.x - p.x) <= tol && Math.abs(r.y - p.y) <= tol) return r
  }
  return null
}

/**
 * Resolve one target's fill (flat colour + optional gradient). `orbit` is its
 * Lattice-orbit offset (see `orbitOffset`); `world` its absolute centroid, or
 * null where world-instance records can't apply (e.g. inside the periodic
 * `<use>` fragment); `cellKey` its precomputed `cell`-scope key
 * (`cellScope.ts`), or null to skip the rung.
 * Precedence (fine wins): instance > patch > cell > congruent sig > `'*'`.
 */
export function resolveFill(
  idx: ColourIndex,
  signature: string,
  orbit: Vec2,
  world: Vec2 | null,
  cellKey: string | null = null,
  tol = KEY_TOL,
): FillStyle | null {
  if (world && idx.instance.length > 0) {
    const c = matchPositioned(idx.instance, signature, world, tol)
    if (c) return c
  }
  if (idx.patch.length > 0) {
    const c = matchPositioned(idx.patch, signature, orbit, tol)
    if (c) return c
  }
  if (cellKey && idx.cell.size > 0) {
    const c = idx.cell.get(cellKey)
    if (c) return c
  }
  return idx.bySignature.get(signature) ?? idx.starColour
}

/** Colour-only view of `resolveFill` (Strand records never carry gradients
 * in v1). */
export function resolveColour(
  idx: ColourIndex,
  signature: string,
  orbit: Vec2,
  world: Vec2 | null,
  cellKey: string | null = null,
  tol = KEY_TOL,
): string | null {
  return resolveFill(idx, signature, orbit, world, cellKey, tol)?.colour ?? null
}

// ─────────────────────────────────────────────────────────────────────────
// "Paint what you see" — clearing finer records that mask a clicked target
// ─────────────────────────────────────────────────────────────────────────

/** The full identity-key set of the target the user actually clicked,
 * carried on paint actions so the reducer can clear masking records. */
export interface ClickedTargetKeys {
  signature?: string
  cellKey?: string
  patchKey?: string
  instanceKey?: string
}

/** Resolution rank per rung (higher = finer = wins). `'*'` sits below 0. */
const SCOPE_RANK: Record<GroupingScope, number> = { congruent: 0, cell: 1, patch: 2, instance: 3 }

/** Tolerant equality of two positioned keys (same float-noise allowance the
 * renderer uses, so a record always clears if it would have matched). */
function positionedKeysMatch(a: string, b: string, tol: number): boolean {
  if (a === b) return true
  const pa = parseScopedKey(a)
  const pb = parseScopedKey(b)
  if (!pa || !pb) return false
  return pa.signature === pb.signature && Math.abs(pa.x - pb.x) <= tol && Math.abs(pa.y - pb.y) <= tol
}

/**
 * Remove records at rungs FINER than the one being painted that would mask
 * the clicked target — so a canvas paint always shows on what was clicked
 * (previously, e.g., an `instance` red kept winning over a fresh `congruent`
 * blue and the click looked dead). Records covering *other* targets are
 * untouched (deliberate finer paints elsewhere survive a coarser repaint).
 * Without `clicked` (panel bulk buttons) this is a no-op.
 *
 * `removedAny` lets the caller suppress the same-colour toggle-off: if a
 * masking record was cleared the click visibly changed the target, so it
 * was not a no-op re-paint.
 */
export function clearMaskingRecords(
  records: ColourRecord[],
  scope: GroupingScope,
  key: string,
  clicked: ClickedTargetKeys | undefined,
  tol = KEY_TOL,
): { records: ColourRecord[]; removedAny: boolean } {
  if (!clicked) return { records, removedAny: false }
  // `'*'` ranks below congruent signatures: painting "all" also unmasks the
  // clicked target's own signature record.
  const rankOf = (s: GroupingScope, k: string): number =>
    s === 'congruent' && k === '*' ? -1 : SCOPE_RANK[s]
  const rank = rankOf(scope, key)
  const masks = (r: ColourRecord): boolean => {
    if (rankOf(r.scope, r.key) <= rank) return false
    switch (r.scope) {
      case 'congruent': // a signature record, cleared only by a '*' paint
        return clicked.signature !== undefined && r.key === clicked.signature
      case 'cell':
        return clicked.cellKey !== undefined && r.key === clicked.cellKey
      case 'patch':
        return clicked.patchKey !== undefined && positionedKeysMatch(r.key, clicked.patchKey, tol)
      case 'instance':
        return clicked.instanceKey !== undefined && positionedKeysMatch(r.key, clicked.instanceKey, tol)
    }
  }
  const kept = records.filter(r => !masks(r))
  return { records: kept, removedAny: kept.length !== records.length }
}
