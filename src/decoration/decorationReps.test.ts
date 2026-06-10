import { describe, expect, it } from 'vitest'
import { createDefault488EditorConfig, createDefaultEditorConfig } from '../editor/createDefault'
import { compositionToPolygons, compositionLatticeStamps } from '../editor/compositionLattice'
import { editorTilesToPolygons } from '../editor/buildEditorPolygons'
import { editorLatticeStamps } from '../editor/lattice'
import { activeCell } from '../editor/active'
import { runPIC } from '../pic'
import { seedFiguresForEditor } from '../editor/tileTypes'
import { extractVoids } from './voids'
import type { PatternConfig } from '../types/pattern'
import type { EditorConfig } from '../types/editor'
import type { Vec2 } from '../utils/math'
import type { Segment } from '../types/geometry'
import type { LatticeStamp } from '../editor/lattice'

/**
 * Probe + regression for the Decoration representative-Void selection
 * (mirrors the `decorationReps` memo in `usePattern.ts`).
 *
 * Two guarantees:
 *  1. Alternate orientation (multi-cell rigid Patch rotation) yields the same
 *     sane rep set as unrotated — the lattice basis rotates with the patch,
 *     so the extraction is rotation-consistent (gate-drift fix `cd64218`).
 *  2. The background "sea" face between disconnected strand islands (sparse
 *     PIC fields, e.g. the default single square) must be excluded: a true
 *     periodic Void can't exceed one lattice cell's area (it would overlap
 *     its own translates). Without the d1² cap the bound-sized sea becomes a
 *     rep tiled across every stamp and hovering the bucket highlights the
 *     entire page.
 */

function stamp(base: Segment[], stamps: LatticeStamp[]): Segment[] {
  const out: Segment[] = []
  for (const st of stamps) {
    const tx = st.translation.x, ty = st.translation.y
    for (const s of base) {
      out.push({
        ...s,
        from: { x: s.from.x + tx, y: s.from.y + ty },
        to: { x: s.to.x + tx, y: s.to.y + ty },
        edgeMidpoint: { x: s.edgeMidpoint.x + tx, y: s.edgeMidpoint.y + ty },
        polygonCenter: { x: s.polygonCenter.x + tx, y: s.polygonCenter.y + ty },
      })
    }
  }
  return out
}

function centroid(poly: Vec2[]): Vec2 {
  let x = 0, y = 0
  for (const p of poly) { x += p.x; y += p.y }
  return { x: x / poly.length, y: y / poly.length }
}

function repsFor(editor: EditorConfig) {
  const patch = editor
  const multiCell = patch.cells.length > 1
  const cell = activeCell(patch)
  const basePolys = multiCell ? compositionToPolygons(patch) : editorTilesToPolygons(cell)
  const config = {
    tiling: { type: 'editor' },
    figures: seedFiguresForEditor({}, editor),
    editor,
  } as unknown as PatternConfig
  const baseSegments = runPIC(basePolys, config)
  const H = 12 * Math.max(patch.edgeLength, cell.boundarySize)
  const box = { x: -H, y: -H, width: 2 * H, height: 2 * H }
  const allStamps = multiCell ? compositionLatticeStamps(patch, box) : editorLatticeStamps(cell, box)
  let d1 = Infinity
  for (const st of allStamps) {
    const d = Math.hypot(st.translation.x, st.translation.y)
    if (d > 1e-6 && d < d1) d1 = d
  }
  const ring = allStamps.filter(st => Math.hypot(st.translation.x, st.translation.y) <= 3 * d1 + 1e-6)
  const field = stamp(baseSegments, ring)
  const R = 2.5 * d1
  const bound: Vec2[] = [{ x: -R, y: -R }, { x: R, y: -R }, { x: R, y: R }, { x: -R, y: R }]
  const voids = extractVoids(field, bound)
  // Mirror of the `decorationReps` selection in usePattern.ts (incl. the cap).
  const maxRepArea = d1 * d1 * 1.05
  const reps = voids.filter(v => {
    if (Math.abs(v.area) > maxRepArea) return false
    const c = centroid(v.polygon)
    let best = Infinity
    let isOrigin = false
    for (const st of ring) {
      const dx = c.x - st.translation.x, dy = c.y - st.translation.y
      const d = dx * dx + dy * dy
      if (d < best - 1e-6) {
        best = d
        isOrigin = st.translation.x * st.translation.x + st.translation.y * st.translation.y < 1e-6
      }
    }
    return isOrigin
  })
  return { voids, reps, d1, boundArea: (2 * R) ** 2 }
}

describe('decoration representative-Void selection', () => {
  it('4.8.8 multi-cell: alternate orientation yields the same sane rep set', () => {
    const off = repsFor(createDefault488EditorConfig())
    const on = repsFor({ ...createDefault488EditorConfig(), alternateOrientation: true })
    expect(off.reps.length).toBeGreaterThan(0)
    expect(on.reps.length).toBe(off.reps.length)
    const sigs = (r: typeof off) => r.reps.map(v => v.signature).sort()
    expect(sigs(on)).toEqual(sigs(off))
    for (const r of [...off.reps, ...on.reps]) {
      expect(Math.abs(r.area)).toBeLessThanOrEqual(off.d1 * off.d1 * 1.05)
    }
  })

  it('default single square: the background sea is extracted but capped out of the reps', () => {
    const { voids, reps, d1, boundArea } = repsFor(createDefaultEditorConfig())
    // The sparse field really does produce the bound-sized sea face…
    const sea = voids.find(v => Math.abs(v.area) > 0.9 * boundArea)
    expect(sea).toBeDefined()
    // …and the cap keeps it (and anything super-cell-sized) out of the reps.
    expect(reps.length).toBeGreaterThan(0)
    for (const r of reps) {
      expect(Math.abs(r.area)).toBeLessThanOrEqual(d1 * d1 * 1.05)
    }
  })
})
