import type { Vec2 } from '../utils/math'
import { centroid } from '../utils/math'
import type { GroupingScope, VoidMergeRecord } from '../types/editor'
import type { VoidRegion } from './voids'
import { voidSignature } from './voids'
import { unionOutlines } from './polyUnion'
import { canonicalPoses, toCanonicalPoint, type StampTransform } from './stamps'
import { KEY_TOL, parseScopedKey } from './scopes'
import { keyVoids, type KeyedVoid } from './resolve'
import type { CellFrame } from './cellScope'

/**
 * **Combine** — fuse several adjacent Voids into one, for the whole Decoration
 * Phase (fill, gradient, stamp, hover and hit-testing alike).
 *
 * ## Why this is a matcher and not an edit
 *
 * Voids are not stored. They are re-derived from the rendered ray field on
 * every pan, zoom, θ change and curve edit — so a combine cannot be a mutation
 * of a Void, because there is no Void to mutate between two frames. It has to
 * be a **record that re-finds its own members**, exactly as a `ColourRecord`
 * re-finds the shapes it paints, and for the same reason: identity has to
 * survive the field being rebuilt underneath it.
 *
 * ## How a group is stored
 *
 * One member is the **anchor**, named by an identity key at the record's Reach
 * rung (`scope`) — the same four rungs a paint binds at, so Combine inherits
 * the whole ladder for free: at `congruent` the anchor names a shape class and
 * the combine repeats on every instance of it in the field; at `instance` it
 * names one Void and the combine happens once.
 *
 * The other members are stored as offsets **in the anchor's canonical pose**
 * (`stamps.ts`) — the same congruence-canonical frame that lands one stamp
 * consistently on every congruent Void. That is what makes the `congruent`
 * rung work at all: a stored offset is a statement about the neighbour's
 * position *relative to the anchor's own shape*, so it carries onto a rotated
 * or mirrored instance elsewhere in the field without any lattice or symmetry
 * bookkeeping. Rotation, reflection and repeat all come out in the wash.
 *
 * ## What a match produces
 *
 * A single composite `VoidRegion` whose outline is the union of its members
 * (`polyUnion.ts`), with a signature computed from that union like any other
 * Void. Everything downstream — `colourVoids`, `resolveVoidStamps`,
 * `buildVoidTargeting`, the paint overlay's hit paths and hover grouping — is
 * untouched: it sees one bigger Void where it used to see three, and a
 * composite is congruent to another composite of the same shape, so a
 * `congruent` paint spreads across combined groups the way it always did.
 */

/** How close a member centroid must land to its predicted position to count.
 * Generous next to `KEY_TOL` because the prediction runs through a canonical
 * pose whose own quantisation is ±(LENGTH_SNAP/2) on the anchor's edges — a
 * tight tolerance here would drop legitimate members on curved fields. */
const MEMBER_TOL = 0.75

/** Map a canonical-frame point out to instance coordinates through a pose. */
function fromCanonical(t: StampTransform, p: Vec2): Vec2 {
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f }
}

/** Identity outline of a Void — the straight one on a curved field, so
 * everything about a merge stays curve-insensitive like the keys do. */
function identityOutline(v: VoidRegion): Vec2[] {
  return v.keyPolygon ?? v.polygon
}

/**
 * Build the record for a user's combine of `members` at `scope`. Returns null
 * when the selection can't be stored: fewer than two members, or a degenerate
 * anchor outline.
 *
 * The anchor is the member whose identity key at `scope` sorts first. Any
 * member would do — the matcher re-derives the group from whichever one it
 * finds — but a deterministic choice keeps the record stable when the same
 * selection is combined twice, so a repeat combine overwrites rather than
 * stacking a second record on the same group.
 */
export function buildVoidMergeRecord(
  members: KeyedVoid[],
  scope: GroupingScope,
): VoidMergeRecord | null {
  if (members.length < 2) return null
  const keyAt = (v: KeyedVoid): string => voidScopeKey(v, scope)
  const sorted = members.slice().sort((a, b) => (keyAt(a) < keyAt(b) ? -1 : keyAt(a) > keyAt(b) ? 1 : 0))
  const anchor = sorted[0]
  const pose = canonicalPoses(identityOutline(anchor))[0]
  if (!pose) return null
  return {
    scope,
    key: keyAt(anchor),
    signature: anchor.signature,
    members: sorted.slice(1).map(m => ({
      signature: m.signature,
      offset: toCanonicalPoint(pose.toInstance, centroid(identityOutline(m))),
    })),
  }
}

/** A Void's identity key at one Reach rung. */
export function voidScopeKey(v: KeyedVoid, scope: GroupingScope): string {
  return scope === 'congruent' ? v.signature
    : scope === 'cell' ? v.cellKey
      : scope === 'patch' ? v.patchKey
        : v.instanceKey
}

/** Does `v` answer to `rec`'s anchor key? Positioned rungs match numerically
 * with the same tolerance the colour resolver uses, so float noise across two
 * extractions can't orphan a combine. */
function isAnchor(v: KeyedVoid, rec: VoidMergeRecord): boolean {
  if (v.signature !== rec.signature) return false
  const key = voidScopeKey(v, rec.scope)
  if (key === rec.key) return true
  if (rec.scope === 'congruent' || rec.scope === 'cell') return false
  const a = parseScopedKey(key)
  const b = parseScopedKey(rec.key)
  return !!a && !!b && a.signature === b.signature
    && Math.abs(a.x - b.x) <= KEY_TOL && Math.abs(a.y - b.y) <= KEY_TOL
}

/** Centroid lookup grid over the field's Voids. */
function buildIndex(voids: KeyedVoid[]): (p: Vec2, signature: string) => number[] {
  const cell = Math.max(MEMBER_TOL * 2, 1e-6)
  const grid = new Map<string, number[]>()
  voids.forEach((v, i) => {
    const c = v.centre
    const k = `${Math.floor(c.x / cell)},${Math.floor(c.y / cell)}`
    const arr = grid.get(k)
    if (arr) arr.push(i)
    else grid.set(k, [i])
  })
  return (p, signature) => {
    const out: number[] = []
    const x0 = Math.floor((p.x - MEMBER_TOL) / cell)
    const x1 = Math.floor((p.x + MEMBER_TOL) / cell)
    const y0 = Math.floor((p.y - MEMBER_TOL) / cell)
    const y1 = Math.floor((p.y + MEMBER_TOL) / cell)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (const i of grid.get(`${x},${y}`) ?? []) {
          if (voids[i].signature !== signature) continue
          const c = voids[i].centre
          if (Math.abs(c.x - p.x) <= MEMBER_TOL && Math.abs(c.y - p.y) <= MEMBER_TOL) out.push(i)
        }
      }
    }
    // Nearest first, so a dense field picks the intended neighbour.
    return out.sort((i, j) => {
      const ci = voids[i].centre
      const cj = voids[j].centre
      return Math.hypot(ci.x - p.x, ci.y - p.y) - Math.hypot(cj.x - p.x, cj.y - p.y)
    })
  }
}

/**
 * Composite region for one matched group: the union outline, its holes, the
 * internal seams the union erased, and a signature taken from the union the
 * same way any Void's is. Null when the members don't union to a single
 * connected shape (they weren't edge-adjacent after all — a stale record
 * against a changed field).
 */
function compositeRegion(group: KeyedVoid[], recordIndex: number): VoidRegion | null {
  const rendered = unionOutlines(group.map(v => v.polygon))
  if (rendered.outers.length !== 1) return null
  const curved = group.some(v => v.keyPolygon)
  const identity = curved ? unionOutlines(group.map(identityOutline)) : rendered
  if (identity.outers.length !== 1) return null
  const keyOutline = identity.outers[0]
  const region: VoidRegion = {
    polygon: rendered.outers[0],
    area: group.reduce((s, v) => s + v.area, 0),
    // Same quantisation `extractVoids` defaults to, so a composite is
    // congruent to a composite of the same shape elsewhere in the field.
    signature: voidSignature(keyOutline, 0.5, (0.5 * Math.PI) / 180),
    mergedCount: group.length,
    mergedFrom: recordIndex,
    seams: rendered.seams,
  }
  if (curved) region.keyPolygon = keyOutline
  if (rendered.holes.length > 0) region.holes = rendered.holes
  if (group.some(v => v.clipped)) region.clipped = true
  return region
}

/**
 * Apply every merge record to a keyed field, returning the field with each
 * matched group replaced by one composite Void.
 *
 * Runs AFTER `keyVoids` and re-keys only the composites, because keying is the
 * expensive half (`cellOrbitKey` canonicalises each outline over every dihedral
 * image) and must stay memoised on the field — while merges change on a user
 * action. Callers memoise this on `(keyed, merges)`.
 *
 * Records are applied in array order and a Void joins at most one group, so an
 * overlapping pair of records resolves first-come rather than ambiguously.
 */
export function applyVoidMerges(
  keyed: KeyedVoid[],
  merges: VoidMergeRecord[] | undefined,
  stampTranslations: Vec2[],
  cellFrames: CellFrame[] = [],
): KeyedVoid[] {
  if (!merges || merges.length === 0 || keyed.length === 0) return keyed
  const lookup = buildIndex(keyed)
  const indexOf = new Map<KeyedVoid, number>()
  keyed.forEach((v, i) => indexOf.set(v, i))
  const consumed = new Set<number>()
  const composites: VoidRegion[] = []

  for (let ri = 0; ri < merges.length; ri++) {
    const rec = merges[ri]
    if (!rec.members || rec.members.length === 0) continue
    for (let ai = 0; ai < keyed.length; ai++) {
      if (consumed.has(ai)) continue
      const anchor = keyed[ai]
      if (!isAnchor(anchor, rec)) continue
      // A symmetric anchor ties on several canonical poses; only the image
      // that aims the stored offsets at the real neighbours completes.
      let group: number[] | null = null
      for (const pose of canonicalPoses(identityOutline(anchor))) {
        const picked: number[] = [ai]
        let ok = true
        for (const m of rec.members) {
          const world = fromCanonical(pose.toInstance, m.offset)
          const hit = lookup(world, m.signature).find(i => !consumed.has(i) && !picked.includes(i))
          if (hit === undefined) { ok = false; break }
          picked.push(hit)
        }
        if (ok) { group = picked; break }
      }
      if (!group) continue
      const region = compositeRegion(group.map(i => keyed[i]), ri)
      if (!region) continue
      for (const i of group) consumed.add(i)
      composites.push(region)
    }
  }

  if (composites.length === 0) return keyed
  const rest = keyed.filter((_, i) => !consumed.has(i))
  return [...rest, ...keyVoids(composites, stampTranslations, cellFrames)]
}

/**
 * Drop the record that produced the clicked composite — what **Separate**
 * does. Identified by the `mergedFrom` provenance the matcher stamps on each
 * composite, not by re-deriving which record could have made it: a composite's
 * own key is the *union's* identity while a record's key is its *anchor's*, so
 * there is nothing to compare them by.
 *
 * Returns `merges` unchanged when the click wasn't on a composite, so the
 * caller can treat "nothing to separate" as a no-op rather than a special case.
 */
export function removeMergeAt(
  merges: VoidMergeRecord[] | undefined,
  clicked: VoidRegion,
): VoidMergeRecord[] {
  const from = clicked.mergedFrom
  if (!merges || from === undefined || from < 0 || from >= merges.length) return merges ?? []
  return merges.filter((_, i) => i !== from)
}
