import { describe, it, expect } from 'vitest'
import {
  expandGuideOrbit,
  guideGroupIds,
  guideHostCell,
  inverseSym,
  regenerateGuideGroup,
  transformGuide,
} from './guideOrbit'
import { createDefaultEditorConfig, createDefault488EditorConfig } from './createDefault'
import { boundarySymmetries } from './symmetry'
import { patchRotation } from './compositionLattice'
import { guideCircleRadiusPoint } from './guides'
import { applyCellTransform } from './patchSelectable'
import type { EditorGuide, EditorGuideCircle, EditorGuideLine, EditorPatch, SymmetryMode } from '../types/editor'
import type { Vec2 } from '../utils/math'

/**
 * Guides slice 4 (#29) — symmetry-orbit drawing + linked-group edit semantics.
 * The Cell used throughout is the default single-cell square Patch (Boundary
 * 400 → local corners at ±200), so a Guide near the origin is comfortably
 * inside it and one out at x = 5000 is comfortably outside.
 */

function patchWithSymmetry(mode: SymmetryMode): EditorPatch {
  const patch = createDefaultEditorConfig()
  return { ...patch, cells: patch.cells.map(c => ({ ...c, symmetryMode: mode })) }
}

function line(over: Partial<EditorGuideLine> = {}): EditorGuideLine {
  return {
    id: 'g1',
    kind: 'line',
    start: { x: 20, y: 30 },
    end: { x: 120, y: 70 },
    stamp: false,
    extend: 'none',
    manualAnchors: [],
    ...over,
  }
}

function circle(over: Partial<EditorGuideCircle> = {}): EditorGuideCircle {
  return {
    id: 'c1',
    kind: 'circle',
    center: { x: 40, y: 20 },
    radius: 60,
    phase: 0.4,
    stamp: false,
    manualAnchors: [],
    ...over,
  }
}

const ids = (i: number) => `g1-s${i}`
const near = (a: Vec2, b: Vec2, eps = 1e-6) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps

/** Position-only fingerprint of a Guide set, order-independent — the thing that
 *  has to stay invariant when a group is regenerated from a different member. */
function orbitFingerprint(guides: EditorGuide[]): string[] {
  const k = (n: number) => Math.round(n * 1e3)
  return guides
    .map(g =>
      g.kind === 'circle'
        ? `c ${k(g.center.x)} ${k(g.center.y)} ${k(g.radius)} ${k(guideCircleRadiusPoint(g).x)} ${k(guideCircleRadiusPoint(g).y)}`
        : `l ${k(g.start.x)} ${k(g.start.y)} ${k(g.end.x)} ${k(g.end.y)}`,
    )
    .sort()
}

describe('guideHostCell', () => {
  it('resolves the containing Cell by the anchor click, not the whole Guide', () => {
    const patch = patchWithSymmetry('full')
    // Start inside the Boundary, end well outside: the anchor click decides.
    const g = line({ start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } })
    expect(guideHostCell(patch, g, 0)?.id).toBe(patch.cells[0].id)
  })

  it('returns null for a canvas-space Guide (spec Decision 8 — always singles)', () => {
    const patch = patchWithSymmetry('full')
    const g = line({ start: { x: 5000, y: 5000 }, end: { x: 5100, y: 5100 } })
    expect(guideHostCell(patch, g, 0)).toBeNull()
  })
})

describe('expandGuideOrbit', () => {
  it('leaves a Guide alone under symmetry "none"', () => {
    const patch = patchWithSymmetry('none')
    const out = expandGuideOrbit(patch, line(), 0, ids)
    expect(out).toHaveLength(1)
    expect(out[0].group).toBeUndefined()
  })

  it('leaves a canvas-space Guide alone even under full symmetry', () => {
    const patch = patchWithSymmetry('full')
    const g = line({ start: { x: 5000, y: 5000 }, end: { x: 5100, y: 5050 } })
    const out = expandGuideOrbit(patch, g, 0, ids)
    expect(out).toHaveLength(1)
    expect(out[0].group).toBeUndefined()
  })

  it('produces the full D4 orbit of a generic line on a square Cell', () => {
    const patch = patchWithSymmetry('full')
    const out = expandGuideOrbit(patch, line(), 0, ids)
    expect(out).toHaveLength(8)
    // One shared group id, distinct sym indices, the drawn Guide keeps its id.
    expect(new Set(out.map(g => g.group!.id)).size).toBe(1)
    expect(out.map(g => g.group!.symIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(out[0].id).toBe('g1')
    expect(new Set(out.map(g => g.id)).size).toBe(8)
    // Every member snapshots the host Cell + the mode it was drawn under.
    expect(out.every(g => g.group!.cellId === patch.cells[0].id)).toBe(true)
    expect(out.every(g => g.group!.mode === 'full')).toBe(true)
  })

  it('produces 4 members under rotation-only symmetry', () => {
    const out = expandGuideOrbit(patchWithSymmetry('rotation'), line(), 0, ids)
    expect(out).toHaveLength(4)
  })

  it('collapses to a single when every image lands on the drawn Guide', () => {
    // A line along the vertical mirror axis is fixed by the whole subgroup.
    const patch = patchWithSymmetry('vertical')
    const g = line({ start: { x: 0, y: -80 }, end: { x: 0, y: 80 } })
    const out = expandGuideOrbit(patch, g, 0, ids)
    expect(out).toHaveLength(1)
    expect(out[0].group).toBeUndefined()
  })

  it('carries every non-geometric setting into each orbit image', () => {
    const patch = patchWithSymmetry('rotation')
    const g = line({ stamp: true, extend: 'both', tickSpacing: 37, ticksEnabled: false })
    for (const image of expandGuideOrbit(patch, g, 0, ids)) {
      expect(image.stamp).toBe(true)
      expect((image as EditorGuideLine).extend).toBe('both')
      expect(image.tickSpacing).toBe(37)
      expect(image.ticksEnabled).toBe(false)
    }
  })

  it('orbits a plain circle but never a divided one (self-symmetric)', () => {
    const patch = patchWithSymmetry('rotation')
    expect(expandGuideOrbit(patch, circle(), 0, ids)).toHaveLength(4)
    expect(expandGuideOrbit(patch, circle({ divisions: 6 }), 0, ids)).toHaveLength(1)
    expect(expandGuideOrbit(patch, circle({ divisions: 6 }), 0, ids)[0].group).toBeUndefined()
  })

  it('orbits about the host Cell centre in a multi-cell Patch, not the Patch origin', () => {
    const patch = createDefault488EditorConfig()
    const square = patch.cells.find(c => c.shape === 'square')!
    const withSym: EditorPatch = {
      ...patch,
      cells: patch.cells.map(c => (c.id === square.id ? { ...c, symmetryMode: 'rotation' } : c)),
    }
    const patchRot = patchRotation(withSym)
    // A short Guide right at the square Cell's own centre.
    const centre = applyCellTransform({ x: 0, y: 0 }, square, patchRot)
    const g = line({ start: centre, end: { x: centre.x + 20, y: centre.y + 8 } })
    const out = expandGuideOrbit(withSym, g, patchRot, ids)
    expect(out).toHaveLength(4)
    expect(out.every(m => m.group!.cellId === square.id)).toBe(true)
    // All four rotate about the Cell centre, so every start stays pinned there.
    for (const m of out) expect(near((m as EditorGuideLine).start, centre, 1e-6)).toBe(true)
  })
})

describe('transformGuide', () => {
  it('is inverted by inverseSym', () => {
    const patch = patchWithSymmetry('full')
    const cell = patch.cells[0]
    const syms = boundarySymmetries(cell.shape, 'full')
    for (const s of syms) {
      const g = line()
      const there = transformGuide(g, s, cell, 0)
      const back = transformGuide(there, inverseSym(s), cell, 0) as EditorGuideLine
      expect(near(back.start, g.start)).toBe(true)
      expect(near(back.end, g.end)).toBe(true)
    }
  })

  it('keeps a circle rigid: radius unchanged, radius point carried through', () => {
    const patch = patchWithSymmetry('full')
    const cell = patch.cells[0]
    const c = circle()
    for (const s of boundarySymmetries(cell.shape, 'full')) {
      const out = transformGuide(c, s, cell, 0) as EditorGuideCircle
      expect(out.radius).toBeCloseTo(c.radius, 9)
      // The image's radius point is the image of the original's radius point.
      const expected = transformGuide(
        circle({ center: guideCircleRadiusPoint(c), radius: 1 }),
        s,
        cell,
        0,
      ) as EditorGuideCircle
      expect(near(guideCircleRadiusPoint(out), expected.center, 1e-6)).toBe(true)
    }
  })

  it('mirrors a circle\'s manual Anchors so they stay on the same physical points', () => {
    const patch = patchWithSymmetry('full')
    const cell = patch.cells[0]
    const refl = boundarySymmetries(cell.shape, 'vertical')[1]
    const c = circle({ manualAnchors: [0.25] })
    const out = transformGuide(c, refl, cell, 0) as EditorGuideCircle
    // t = 0.25 CCW from phase becomes t = 0.75 once the rim's sense flips.
    expect(out.manualAnchors[0]).toBeCloseTo(0.75, 9)
  })
})

describe('regenerateGuideGroup', () => {
  it('re-derives siblings symmetrically instead of stacking them on the edit', () => {
    const patch = patchWithSymmetry('rotation')
    const group = expandGuideOrbit(patch, line(), 0, ids)
    // Drag member 2's end somewhere new.
    const edited = { ...(group[2] as EditorGuideLine), end: { x: -140, y: 25 } }
    const next = regenerateGuideGroup(patch, group, edited, 0)

    expect(next).toHaveLength(4)
    expect(next.map(g => g.id)).toEqual(group.map(g => g.id))
    expect(next.map(g => g.group!.symIndex)).toEqual([0, 1, 2, 3])
    // The edited member is authoritative and untouched.
    expect(near((next[2] as EditorGuideLine).end, edited.end)).toBe(true)
    // The group is still a genuine orbit: expanding fresh from the edited
    // member reproduces exactly the same four positions.
    const fresh = expandGuideOrbit(patch, { ...edited, id: 'fresh' }, 0, i => `fresh-s${i}`)
    expect(orbitFingerprint(next)).toEqual(orbitFingerprint(fresh))
  })

  it('propagates settings to every member verbatim', () => {
    const patch = patchWithSymmetry('full')
    const group = expandGuideOrbit(patch, line(), 0, ids)
    const edited = { ...(group[5] as EditorGuideLine), stamp: true, extend: 'both' as const, tickSpacing: 12 }
    const next = regenerateGuideGroup(patch, group, edited, 0)
    expect(next.every(g => g.stamp)).toBe(true)
    expect(next.every(g => (g as EditorGuideLine).extend === 'both')).toBe(true)
    expect(next.every(g => g.tickSpacing === 12)).toBe(true)
  })

  it('leaves a single Guide and unrelated Guides untouched', () => {
    const patch = patchWithSymmetry('rotation')
    const group = expandGuideOrbit(patch, line(), 0, ids)
    const stray = line({ id: 'stray', start: { x: 5000, y: 0 }, end: { x: 5100, y: 0 } })
    const all = [...group, stray]
    const edited = { ...(group[0] as EditorGuideLine), stamp: true }
    const next = regenerateGuideGroup(patch, all, edited, 0)
    expect(next[next.length - 1]).toBe(stray)
    // A single carries no group, so regeneration is a no-op on it.
    expect(regenerateGuideGroup(patch, all, stray, 0)).toBe(all)
  })

  it('fails closed when the group\'s host Cell is gone', () => {
    const patch = patchWithSymmetry('rotation')
    const group = expandGuideOrbit(patch, line(), 0, ids)
    const orphaned: EditorPatch = { ...patch, cells: [{ ...patch.cells[0], id: 'renamed' }] }
    const edited = { ...(group[1] as EditorGuideLine), stamp: true }
    expect(regenerateGuideGroup(orphaned, group, edited, 0)).toBe(group)
  })

  it('ignores a live symmetry-mode change — the group keeps its drawn shape', () => {
    const patch = patchWithSymmetry('rotation')
    const group = expandGuideOrbit(patch, line(), 0, ids)
    const flipped: EditorPatch = {
      ...patch,
      cells: patch.cells.map(c => ({ ...c, symmetryMode: 'none' as SymmetryMode })),
    }
    const edited = { ...(group[0] as EditorGuideLine), end: { x: 90, y: -40 } }
    const next = regenerateGuideGroup(flipped, group, edited, 0)
    expect(next).toHaveLength(4)
    expect(orbitFingerprint(next)).toEqual(
      orbitFingerprint(expandGuideOrbit(patch, { ...edited, id: 'f' }, 0, i => `f-s${i}`)),
    )
  })
})

describe('guideGroupIds', () => {
  it('returns the whole group for a member and just the Guide for a single', () => {
    const patch = patchWithSymmetry('rotation')
    const group = expandGuideOrbit(patch, line(), 0, ids)
    const stray = line({ id: 'stray' })
    const all = [...group, stray]
    expect(guideGroupIds(all, group[2].id)).toEqual(new Set(group.map(g => g.id)))
    expect(guideGroupIds(all, 'stray')).toEqual(new Set(['stray']))
    expect(guideGroupIds(all, 'missing').size).toBe(0)
  })
})
