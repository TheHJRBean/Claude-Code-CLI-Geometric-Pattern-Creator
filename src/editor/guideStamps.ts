import type { EditorGuide, EditorGuideCircle, EditorGuideLine, EditorPatch } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { sub } from '../utils/math'
import { applyStamp, type LatticeStamp } from './lattice'
import { collectGuideAnchors, guideCircleRadiusPoint, type GuideAnchor } from './guides'

/**
 * Guides slice 5 (#30, spec Decisions 2 + 9) — **stamping under the Lattice**.
 *
 * A Guide's `stamp` flag is what makes it Patch-relative: stamp ON, it repeats
 * in every Lattice stamp along with the Tiles; stamp OFF, it is a one-off in
 * world space and never repeats. Slice 1 shipped the flag and its colour
 * signal; this module is the geometry that makes the flag mean something —
 * the repeated copies and the **neighbour Anchors** they expose.
 *
 * Everything here is a rigid transform of an already-Patch-world Guide, so
 * unlike `guideOrbit.ts` there is no Cell frame to round-trip through: a
 * `LatticeStamp` acts directly on Patch-world coordinates.
 */

/** The Patch's stamping Guides — the ones that repeat. Empty when the Patch has
 *  no Guides or none of them stamp. */
export function stampingGuides(patch: EditorPatch): EditorGuide[] {
  return (patch.guides ?? []).filter(g => g.stamp)
}

/**
 * One Guide carried onto a Lattice stamp. Lines move both endpoints (which
 * keeps parametric `manualAnchors` valid); circles move the centre **and** the
 * radius point, so a rotating stamp turns `phase` with it. A stamp is a rigid
 * motion — never a reflection — so the rim's CCW sense is preserved and circle
 * `manualAnchors` need no correction (unlike the symmetry orbit in
 * `guideOrbit.ts`).
 *
 * The copy keeps the source Guide's `id`; it is display-and-pick geometry, not
 * a Guide in `patch.guides`. Callers that need a React key must qualify it with
 * the stamp index.
 */
export function stampGuide(g: EditorGuide, stamp: LatticeStamp): EditorGuide {
  if (g.kind === 'circle') {
    const center = applyStamp(g.center, stamp)
    const rim = applyStamp(guideCircleRadiusPoint(g), stamp)
    const d = sub(rim, center)
    const out: EditorGuideCircle = { ...g, center, phase: Math.atan2(d.y, d.x) }
    return out
  }
  const out: EditorGuideLine = { ...g, start: applyStamp(g.start, stamp), end: applyStamp(g.end, stamp) }
  return out
}

/** A stamping Guide's copy on one Lattice stamp, tagged with which stamp it
 *  came from so the renderer can key it and the picker can trace it back. */
export interface StampedGuide {
  guide: EditorGuide
  stampIndex: number
}

/**
 * `stamps` minus the identity copy. The Design-Phase neighbour set already
 * excludes the centre, but the Composition-Phase Lattice set does **not** — and
 * the live Patch draws its own Guides at full strength, so an identity ghost
 * would just double-strike them.
 */
export function ghostStampsOnly(stamps: LatticeStamp[]): LatticeStamp[] {
  return stamps.filter(s =>
    s.rotation !== 0 || Math.abs(s.translation.x) > 1e-6 || Math.abs(s.translation.y) > 1e-6)
}

/**
 * Every stamping Guide reproduced on every stamp in `stamps` — the ghost copies
 * drawn alongside the neighbour Tiles (Design Phase) or under the full Lattice
 * (Composition Phase). Non-stamping Guides are absent by construction, which is
 * exactly the visible difference the stamp toggle promises.
 */
export function stampedGuideCopies(patch: EditorPatch, stamps: LatticeStamp[]): StampedGuide[] {
  const guides = stampingGuides(patch)
  if (guides.length === 0 || stamps.length === 0) return []
  const out: StampedGuide[] = []
  for (let s = 0; s < stamps.length; s++) {
    for (const g of guides) out.push({ guide: stampGuide(g, stamps[s]), stampIndex: s })
  }
  return out
}

/**
 * The **Anchors a stamping Guide exposes on each neighbour stamp** — pickable
 * in Complete / Place under the same full-visible-lattice policy as neighbour
 * vertices (user decision 2026-05-31).
 *
 * Derived from a Patch whose Guides are narrowed to the stamping ones, so a
 * crossing with a non-stamping Guide — which exists only on the live Patch —
 * never gets reproduced on a neighbour. Tile-centre Anchors are excluded: they
 * belong to the neighbour *Tiles*, not to any Guide, and admitting them here
 * would quietly widen the neighbour pick set beyond what this ticket covers.
 * The result is always `stamp: true` (a stamping Guide's own Anchors, and
 * crossings between two stamping Guides, are Patch-relative by definition), so
 * a Tile completed on one is an ordinary repeating Cell Tile.
 */
export function neighbourGuideAnchors(
  patch: EditorPatch,
  patchRot: number,
  stamps: LatticeStamp[],
): GuideAnchor[] {
  const guides = stampingGuides(patch)
  if (guides.length === 0 || stamps.length === 0) return []
  const base = collectGuideAnchors({ ...patch, guides }, patchRot, { includeTileCentres: false })
    .filter(a => a.stamp)
  const out: GuideAnchor[] = []
  for (const stamp of stamps) {
    for (const a of base) out.push({ ...a, p: applyStamp(a.p, stamp) })
  }
  return out
}

/** True when `p` coincides with an Anchor a stamping Guide exposes on one of
 *  `stamps` — the reducer/validator's membership test for a neighbour Anchor
 *  pick, mirroring `isPatchSelectableVertex`'s neighbour branch. */
export function isNeighbourGuideAnchor(
  patch: EditorPatch,
  patchRot: number,
  stamps: LatticeStamp[],
  p: Vec2,
  eps: number,
): boolean {
  return neighbourGuideAnchors(patch, patchRot, stamps)
    .some(a => Math.abs(a.p.x - p.x) < eps && Math.abs(a.p.y - p.y) < eps)
}
