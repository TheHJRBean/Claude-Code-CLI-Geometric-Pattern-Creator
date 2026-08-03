import type { EditorCell, EditorGuide, EditorGuideCircle, EditorGuideLine, EditorPatch, GuideGroupRef } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { sub } from '../utils/math'
import { applySym, boundarySymmetries, type Sym } from './symmetry'
import { applyCellTransform, cellContainingPoint, inverseCellTransform } from './patchSelectable'
import { guideCircleRadiusPoint } from './guides'

/**
 * Guides slice 4 (#29, spec Decision 8) — **symmetry-orbit drawing**.
 *
 * Drawing a Guide inside a Cell whose Symmetry picker is active creates the
 * whole orbit at once, exactly as tile placement does (`editor/orbit.ts`); the
 * resulting Guides are **linked as one group**, so a later edit to any member
 * re-derives the others and deleting one deletes all.
 *
 * Two frames are in play. Guides live in **Patch-world** coordinates, but a
 * Cell's symmetry group is a set of linear maps about the **Cell-local** origin
 * (the Cell-Boundary centre — see `editor/symmetry.ts`). Every transform here
 * therefore round-trips: world → Cell-local (`inverseCellTransform`) → apply
 * `Sym` → Cell-local → world (`applyCellTransform`).
 *
 * Group bookkeeping lives on each member as a `GuideGroupRef` carrying the host
 * Cell, a **snapshot** of the symmetry mode, and that member's index into the
 * symmetry list. The snapshot matters: re-reading the Cell's live picker would
 * mean flipping it to `'none'` and then nudging one endpoint silently deleted
 * the rest of the group.
 */

/* ── Frame conversion ───────────────────────────────────────────────────── */

/** Patch-world point → Cell-local, apply `s`, → Patch-world. */
function symInCellFrame(p: Vec2, s: Sym, cell: EditorCell, patchRot: number): Vec2 {
  const local = inverseCellTransform(p, cell, patchRot)
  return applyCellTransform(applySym(s, local), cell, patchRot)
}

/** Whether `s` reverses orientation (a reflection). The symmetry elements are
 *  orthogonal, so the determinant is ±1. */
function isReflection(s: Sym): boolean {
  return s.a * s.d - s.b * s.c < 0
}

/** Inverse of an orthogonal 2×2 `Sym` (adjugate ÷ determinant). Needed to pull
 *  an edited member back to the group's base frame before re-emitting. */
export function inverseSym(s: Sym): Sym {
  const det = s.a * s.d - s.b * s.c
  return { a: s.d / det, b: -s.b / det, c: -s.c / det, d: s.a / det }
}

/* ── Guide transform ────────────────────────────────────────────────────── */

/**
 * Map a whole Guide through one symmetry element, in the host Cell's frame.
 *
 * Lines carry both endpoints through, which keeps `manualAnchors` (parametric
 * along start→end) valid untouched. Circles are mapped by their centre **and
 * their radius point**, so `phase` comes out right under rotations and
 * reflections alike without a special case; a reflection reverses the rim's CCW
 * sense, so circle `manualAnchors` (CCW angle fractions from `phase`) are
 * negated to stay on the same physical points.
 *
 * Every non-geometric setting (stamp, extend, tick spacing, divisions) is
 * carried verbatim — that is what makes an orbit edit "apply to all".
 */
export function transformGuide(
  g: EditorGuide,
  s: Sym,
  cell: EditorCell,
  patchRot: number,
): EditorGuide {
  const map = (p: Vec2) => symInCellFrame(p, s, cell, patchRot)
  if (g.kind === 'circle') {
    const center = map(g.center)
    const rim = map(guideCircleRadiusPoint(g))
    const d = sub(rim, center)
    const out: EditorGuideCircle = {
      ...g,
      center,
      phase: Math.atan2(d.y, d.x),
      manualAnchors: isReflection(s)
        ? g.manualAnchors.map(t => ((-t % 1) + 1) % 1)
        : g.manualAnchors,
    }
    return out
  }
  const out: EditorGuideLine = { ...g, start: map(g.start), end: map(g.end) }
  return out
}

/* ── Host Cell ──────────────────────────────────────────────────────────── */

/**
 * The Cell whose symmetry a freshly drawn Guide should obey, or `null` for a
 * canvas-space Guide (spec Decision 8: "Guides drawn outside any Cell always
 * draw as singles").
 *
 * Resolution is by strict geometric **containment** of the Guide's anchor click
 * — a line's `start`, a circle's `center`. Deliberately not `resolveHostCell`,
 * whose nearest-Cell fallback would hand every canvas-space Guide a host and so
 * make the "always singles" rule unreachable.
 */
export function guideHostCell(
  patch: EditorPatch,
  guide: EditorGuide,
  patchRot: number,
): EditorCell | null {
  const anchor = guide.kind === 'circle' ? guide.center : guide.start
  return cellContainingPoint(patch, anchor, patchRot)
}

/* ── Draw-time expansion ────────────────────────────────────────────────── */

/** Sub-millipixel key for collapsing orbit images that land on top of each
 *  other (a Guide lying on a mirror axis maps to itself). */
function guideGeometryKey(g: EditorGuide): string {
  const k = (n: number) => Math.round(n * 1e4)
  if (g.kind === 'circle') {
    const rim = guideCircleRadiusPoint(g)
    return `c:${k(g.center.x)},${k(g.center.y)},${k(rim.x)},${k(rim.y)}`
  }
  // Unordered endpoints: a reflection that swaps a line's ends produces the
  // same drawn line, and two coincident Guides would only clutter the canvas.
  const a = `${k(g.start.x)},${k(g.start.y)}`
  const b = `${k(g.end.x)},${k(g.end.y)}`
  return a < b ? `l:${a}|${b}` : `l:${b}|${a}`
}

/**
 * Expand a freshly drawn Guide into its symmetry orbit (spec Decision 8).
 *
 * Returns `[guide]` unchanged — no `group` stamped — when there is nothing to
 * propagate under: no host Cell (canvas-space), `symmetryMode` of `'none'`, a
 * subgroup that collapses to the identity, or a **divided** Guide circle (its
 * n-division already makes it self-symmetric, so the picker is ignored).
 * Otherwise every distinct image becomes a member, all sharing one group id;
 * the drawn Guide keeps its own id and is always the identity member.
 *
 * `idFor(i)` mints the sibling ids — the caller owns id shape (the reducer
 * derives them from the drawn Guide's id so they stay unique within the Patch).
 */
export function expandGuideOrbit(
  patch: EditorPatch,
  guide: EditorGuide,
  patchRot: number,
  idFor: (index: number) => string,
): EditorGuide[] {
  if (guide.kind === 'circle' && (guide.divisions ?? 0) > 0) return [guide]
  const cell = guideHostCell(patch, guide, patchRot)
  if (!cell) return [guide]
  const mode = cell.symmetryMode ?? 'none'
  const syms = boundarySymmetries(cell.shape, mode)
  if (syms.length < 2) return [guide]

  const groupId = `${guide.id}-grp`
  const seen = new Set<string>()
  const out: EditorGuide[] = []
  for (let i = 0; i < syms.length; i++) {
    const image = transformGuide(guide, syms[i], cell, patchRot)
    const key = guideGeometryKey(image)
    if (seen.has(key)) continue
    seen.add(key)
    const group: GuideGroupRef = { id: groupId, cellId: cell.id, mode, symIndex: i }
    // Index 0 is the identity element, i.e. the Guide as drawn — keep its id
    // so the selection/popup the user already has open stays valid.
    out.push({ ...image, id: i === 0 ? guide.id : idFor(i), group } as EditorGuide)
  }
  // A subgroup whose every image collapsed onto the drawn Guide (e.g. a line
  // lying along the only mirror axis) is not a group — ship the single.
  if (out.length < 2) return [guide]
  return out
}

/* ── Post-edit regeneration ─────────────────────────────────────────────── */

/** Every Guide sharing `guide`'s group, or just `guide` when it is a single. */
export function guideGroupMembers(guides: EditorGuide[], guide: EditorGuide): EditorGuide[] {
  const groupId = guide.group?.id
  if (!groupId) return [guide]
  return guides.filter(g => g.group?.id === groupId)
}

/** Ids of every Guide sharing `guideId`'s group (the delete set — spec
 *  Decision 8: "delete one → all go"). Unknown id ⇒ empty. */
export function guideGroupIds(guides: EditorGuide[], guideId: string): Set<string> {
  const guide = guides.find(g => g.id === guideId)
  if (!guide) return new Set()
  return new Set(guideGroupMembers(guides, guide).map(g => g.id))
}

/**
 * Re-derive a linked group after one member was edited (spec Decision 8:
 * "editing any member's popup settings applies to all").
 *
 * The edited member is authoritative. It is pulled back through its own
 * symmetry element to the group's base frame, then pushed out through each
 * surviving member's element — so geometry edits (endpoint drag, typed angle,
 * radius) reshape the group *symmetrically* rather than stacking every member
 * on the edited one, while settings edits copy across verbatim. Member ids and
 * their `symIndex` are preserved, so React keys, the open popup and the undo
 * coalescing key all survive a drag.
 *
 * Returns `guides` unchanged when the edited Guide is a single, or when the
 * group's host Cell is gone (fails closed — a stale group must never
 * teleport its siblings).
 */
export function regenerateGuideGroup(
  patch: EditorPatch,
  guides: EditorGuide[],
  edited: EditorGuide,
  patchRot: number,
): EditorGuide[] {
  const group = edited.group
  if (!group) return guides
  const cell = patch.cells.find(c => c.id === group.cellId)
  if (!cell) return guides
  const syms = boundarySymmetries(cell.shape, group.mode)
  const own = syms[group.symIndex]
  if (!own) return guides

  // The group's base frame: the edited member mapped back by its own element.
  const base = transformGuide(edited, inverseSym(own), cell, patchRot)
  return guides.map(g => {
    if (g.id === edited.id) return edited
    if (g.group?.id !== group.id) return g
    const s = syms[g.group.symIndex]
    if (!s) return g
    return { ...transformGuide(base, s, cell, patchRot), id: g.id, group: g.group } as EditorGuide
  })
}
