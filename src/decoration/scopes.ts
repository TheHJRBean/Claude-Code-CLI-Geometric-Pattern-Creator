import type { Vec2 } from '../utils/math'
import type { ColourRecord } from '../types/editor'

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

interface PositionedRecord extends ParsedScopedKey {
  colour: string
}

/**
 * Pre-indexed `ColourRecord[]` for per-target colour resolution. Build once
 * per record-list change, then `resolve` per target.
 */
export interface ColourIndex {
  /** congruent `'*'` colour (all targets), or null. */
  starColour: string | null
  /** congruent signature → colour. */
  bySignature: Map<string, string>
  /** Parsed `patch`-scope records, in record order. */
  patch: PositionedRecord[]
  /** Parsed `instance`-scope records, in record order. */
  instance: PositionedRecord[]
  /** True when any record needs a positioned (patch/instance) match. */
  hasPositioned: boolean
  /** True when any `instance` record exists (world-space render path needed). */
  hasInstance: boolean
}

export function buildColourIndex(records: ColourRecord[] | undefined): ColourIndex {
  const idx: ColourIndex = {
    starColour: null,
    bySignature: new Map(),
    patch: [],
    instance: [],
    hasPositioned: false,
    hasInstance: false,
  }
  if (!records) return idx
  for (const r of records) {
    if (r.scope === 'congruent') {
      if (r.key === '*') idx.starColour = r.colour
      else idx.bySignature.set(r.key, r.colour)
      continue
    }
    if (r.scope === 'patch' || r.scope === 'instance') {
      const parsed = parseScopedKey(r.key)
      if (!parsed) continue
      const rec = { ...parsed, colour: r.colour }
      if (r.scope === 'patch') idx.patch.push(rec)
      else idx.instance.push(rec)
    }
    // 'cell' rung reserved (ADR-0005); records of that scope are ignored here.
  }
  idx.hasPositioned = idx.patch.length > 0 || idx.instance.length > 0
  idx.hasInstance = idx.instance.length > 0
  return idx
}

function matchPositioned(
  recs: PositionedRecord[],
  signature: string,
  p: Vec2,
  tol: number,
): string | null {
  // Later records win (later paints override earlier ones in the same rung).
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i]
    if (r.signature !== signature) continue
    if (Math.abs(r.x - p.x) <= tol && Math.abs(r.y - p.y) <= tol) return r.colour
  }
  return null
}

/**
 * Resolve one target's colour. `orbit` is its Lattice-orbit offset (see
 * `orbitOffset`); `world` its absolute centroid, or null where world-instance
 * records can't apply (e.g. inside the periodic `<use>` fragment).
 */
export function resolveColour(
  idx: ColourIndex,
  signature: string,
  orbit: Vec2,
  world: Vec2 | null,
  tol = KEY_TOL,
): string | null {
  if (world && idx.instance.length > 0) {
    const c = matchPositioned(idx.instance, signature, world, tol)
    if (c) return c
  }
  if (idx.patch.length > 0) {
    const c = matchPositioned(idx.patch, signature, orbit, tol)
    if (c) return c
  }
  return idx.bySignature.get(signature) ?? idx.starColour
}
