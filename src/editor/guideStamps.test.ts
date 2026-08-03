import { describe, it, expect } from 'vitest'
import {
  ghostStampsOnly,
  isNeighbourGuideAnchor,
  neighbourGuideAnchors,
  stampGuide,
  stampedGuideCopies,
  stampingGuides,
} from './guideStamps'
import { collectGuideAnchors, guideCircleRadiusPoint } from './guides'
import { createDefaultEditorConfig } from './createDefault'
import type { EditorGuideCircle, EditorGuideLine, EditorPatch } from '../types/editor'
import type { LatticeStamp } from './lattice'

/**
 * Guides slice 5 (#30) — stamping under the Lattice. A `LatticeStamp` acts
 * directly on Patch-world coordinates, so unlike the symmetry orbit there is no
 * Cell frame to round-trip through.
 */

const T = (x: number, y: number): LatticeStamp => ({ translation: { x, y }, rotation: 0 })
const IDENTITY: LatticeStamp = T(0, 0)

function line(over: Partial<EditorGuideLine> = {}): EditorGuideLine {
  return {
    id: 'g1',
    kind: 'line',
    start: { x: 10, y: 20 },
    end: { x: 90, y: 60 },
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
    center: { x: 30, y: 40 },
    radius: 50,
    phase: 0.7,
    stamp: false,
    manualAnchors: [],
    ...over,
  }
}

function patchWith(...guides: Array<EditorGuideLine | EditorGuideCircle>): EditorPatch {
  return { ...createDefaultEditorConfig(), guides }
}

describe('stampingGuides', () => {
  it('keeps only the Guides whose stamp flag is on', () => {
    const patch = patchWith(line({ id: 'a', stamp: true }), line({ id: 'b' }), circle({ id: 'c', stamp: true }))
    expect(stampingGuides(patch).map(g => g.id)).toEqual(['a', 'c'])
  })

  it('is empty for a Patch with no Guides', () => {
    expect(stampingGuides(createDefaultEditorConfig())).toEqual([])
  })
})

describe('stampGuide', () => {
  it('translates both endpoints of a line', () => {
    const out = stampGuide(line(), T(200, -50)) as EditorGuideLine
    expect(out.start).toEqual({ x: 210, y: -30 })
    expect(out.end).toEqual({ x: 290, y: 10 })
  })

  it('moves a circle rigidly: same radius, radius point carried through', () => {
    const c = circle()
    const before = guideCircleRadiusPoint(c)
    const out = stampGuide(c, T(200, -50)) as EditorGuideCircle
    expect(out.radius).toBeCloseTo(c.radius, 9)
    expect(out.center).toEqual({ x: 230, y: -10 })
    const after = guideCircleRadiusPoint(out)
    expect(after.x).toBeCloseTo(before.x + 200, 6)
    expect(after.y).toBeCloseTo(before.y - 50, 6)
    // A pure translation leaves the drawn-radius angle alone.
    expect(out.phase).toBeCloseTo(c.phase!, 9)
  })

  it('turns a circle\'s phase with a rotating stamp', () => {
    const c = circle({ center: { x: 0, y: 0 }, phase: 0 })
    const out = stampGuide(c, { translation: { x: 0, y: 0 }, rotation: Math.PI / 2 }) as EditorGuideCircle
    expect(out.phase).toBeCloseTo(Math.PI / 2, 9)
  })

  it('carries every setting through unchanged', () => {
    const g = line({ stamp: true, extend: 'both', tickSpacing: 25, ticksEnabled: false, manualAnchors: [0.25] })
    const out = stampGuide(g, T(10, 10)) as EditorGuideLine
    expect(out.stamp).toBe(true)
    expect(out.extend).toBe('both')
    expect(out.tickSpacing).toBe(25)
    expect(out.ticksEnabled).toBe(false)
    // Parametric along start→end, so a rigid move leaves the fraction alone.
    expect(out.manualAnchors).toEqual([0.25])
  })
})

describe('ghostStampsOnly', () => {
  it('drops the identity stamp — the live Patch already draws that copy', () => {
    expect(ghostStampsOnly([IDENTITY, T(100, 0), T(0, 100)])).toHaveLength(2)
  })

  it('keeps a rotating stamp even at zero translation', () => {
    const spin: LatticeStamp = { translation: { x: 0, y: 0 }, rotation: 0.4 }
    expect(ghostStampsOnly([spin])).toEqual([spin])
  })
})

describe('stampedGuideCopies', () => {
  it('reproduces only the stamping Guides, once per stamp', () => {
    const patch = patchWith(line({ id: 'a', stamp: true }), line({ id: 'b' }))
    const out = stampedGuideCopies(patch, [T(100, 0), T(0, 100)])
    expect(out).toHaveLength(2)
    expect(out.map(s => s.guide.id)).toEqual(['a', 'a'])
    expect(out.map(s => s.stampIndex)).toEqual([0, 1])
  })

  it('is empty when nothing stamps — the visible half of the toggle', () => {
    expect(stampedGuideCopies(patchWith(line()), [T(100, 0)])).toEqual([])
  })

  it('is empty with no stamps', () => {
    expect(stampedGuideCopies(patchWith(line({ stamp: true })), [])).toEqual([])
  })
})

describe('neighbourGuideAnchors', () => {
  it('carries a stamping Guide\'s Anchors onto every stamp', () => {
    const patch = patchWith(line({ stamp: true }))
    const stamps = [T(400, 0), T(0, 400)]
    const base = collectGuideAnchors({ ...patch, guides: patch.guides }, 0, { includeTileCentres: false })
    const out = neighbourGuideAnchors(patch, 0, stamps)
    expect(out.length).toBe(base.length * stamps.length)
    expect(out.every(a => a.stamp)).toBe(true)
    // Each base Anchor has an image translated by each stamp.
    for (const b of base) {
      expect(out.some(a => Math.abs(a.p.x - (b.p.x + 400)) < 1e-9 && Math.abs(a.p.y - b.p.y) < 1e-9)).toBe(true)
    }
  })

  it('never repeats a non-stamping Guide', () => {
    expect(neighbourGuideAnchors(patchWith(line()), 0, [T(400, 0)])).toEqual([])
  })

  it('never repeats a crossing that only exists on the live Patch', () => {
    // Two Guides cross at (30, 120) — clear of the Seed Tile and of `a`'s own
    // midpoint tick, so the crossing is the only thing that could put an Anchor
    // there. Only `a` stamps, so the crossing is NOT Patch-relative and must not
    // reappear on a neighbour.
    const a = line({ id: 'a', stamp: true, start: { x: 0, y: 120 }, end: { x: 100, y: 120 } })
    const b = line({ id: 'b', start: { x: 30, y: 60 }, end: { x: 30, y: 180 } })
    const patch = patchWith(a, b)
    const stamps = [T(400, 0)]
    const out = neighbourGuideAnchors(patch, 0, stamps)
    expect(out.some(p => Math.abs(p.p.x - 430) < 1e-6 && Math.abs(p.p.y - 120) < 1e-6)).toBe(false)
    // The stamping Guide's own Anchors do repeat — its start lands at 400.
    expect(out.some(p => Math.abs(p.p.x - 400) < 1e-6 && Math.abs(p.p.y - 120) < 1e-6)).toBe(true)
  })

  it('excludes Tile-centre Anchors — those belong to the Tiles, not a Guide', () => {
    const patch = patchWith(line({ stamp: true }))
    // The default Patch has a Seed Tile at the Cell centre, so a Tile-centre
    // Anchor exists at the origin; its stamped image would sit at (400, 0).
    const withCentres = collectGuideAnchors(patch, 0)
    expect(withCentres.some(a => a.guideId.startsWith('tile-centre/'))).toBe(true)
    const out = neighbourGuideAnchors(patch, 0, [T(400, 0)])
    expect(out.every(a => !a.guideId.startsWith('tile-centre/'))).toBe(true)
  })
})

describe('isNeighbourGuideAnchor', () => {
  it('matches a stamped Anchor and rejects everything else', () => {
    const patch = patchWith(line({ stamp: true, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }))
    const stamps = [T(400, 0)]
    expect(isNeighbourGuideAnchor(patch, 0, stamps, { x: 400, y: 0 }, 1e-6)).toBe(true)
    expect(isNeighbourGuideAnchor(patch, 0, stamps, { x: 500, y: 0 }, 1e-6)).toBe(true)
    expect(isNeighbourGuideAnchor(patch, 0, stamps, { x: 450, y: 77 }, 1e-6)).toBe(false)
    // Same points, but the Guide no longer stamps.
    const off = patchWith(line({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }))
    expect(isNeighbourGuideAnchor(off, 0, stamps, { x: 400, y: 0 }, 1e-6)).toBe(false)
  })
})
