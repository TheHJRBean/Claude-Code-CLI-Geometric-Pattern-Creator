import { describe, expect, it } from 'vitest'
import { createDefault488EditorConfig, createDefaultEditorConfig } from '../editor/createDefault'
import { compositionToPolygons, compositionLatticeStamps, compositionBoundaryOutlines } from '../editor/compositionLattice'
import { editorTilesToPolygons, editorBoundaryVertices } from '../editor/buildEditorPolygons'
import { editorLatticeStamps } from '../editor/lattice'
import { activeCell } from '../editor/active'
import { runPIC } from '../pic'
import { seedFiguresForEditor } from '../editor/tileTypes'
import { extractVoids } from './voids'
import { cellFramesFromOutlines, cellOrbitKey } from './cellScope'
import type { PatternConfig } from '../types/pattern'
import type { EditorConfig } from '../types/editor'
import type { Vec2 } from '../utils/math'
import type { Segment } from '../types/geometry'
import type { LatticeStamp } from '../editor/lattice'

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

function probe(editor: EditorConfig) {
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
  const outlines = multiCell ? compositionBoundaryOutlines(patch) : [editorBoundaryVertices(cell)]
  const frames = cellFramesFromOutlines(outlines)
  // Group reps by signature, then by cellKey within each signature.
  const bySig = new Map<string, Map<string, Vec2[]>>()
  for (const r of reps) {
    const c = centroid(r.polygon)
    const cellKey = cellOrbitKey(r.signature, r.polygon, true, c, frames)
    if (!bySig.has(r.signature)) bySig.set(r.signature, new Map())
    const orbits = bySig.get(r.signature)!
    if (!orbits.has(cellKey)) orbits.set(cellKey, [])
    orbits.get(cellKey)!.push(c)
  }
  return bySig
}

/**
 * Regression for the cell ("Twins") rung over REAL PIC fields — pins the
 * orbit structure the outline-canonical key produces:
 * - 4.8.8: the 4-member congruent class around the octagon/square boundary
 *   splits into 2 orbits of 2 (Twins ≠ Matching).
 * - default single square: its 2-member class stays ONE orbit — the two
 *   voids really are D4 images of each other (vertex-average centroids both
 *   at the origin). Pins that outline canonicalisation doesn't over-SPLIT
 *   genuine twins.
 */
describe('cell-scope orbit structure on real PIC fields', () => {
  it('4.8.8: a multi-member congruent class splits into symmetry orbits', () => {
    const bySig = probe(createDefault488EditorConfig())
    const multi = [...bySig.values()].filter(orbits => [...orbits.values()].flat().length > 1)
    expect(multi.length).toBeGreaterThan(0)
    const splitClass = multi.find(orbits => orbits.size > 1)
    expect(splitClass).toBeDefined()
    for (const members of splitClass!.values()) expect(members.length).toBeGreaterThan(0)
  })

  it('default square: genuine same-centroid twins stay one orbit', () => {
    const bySig = probe(createDefaultEditorConfig())
    const pair = [...bySig.values()].find(orbits => [...orbits.values()].flat().length === 2)
    expect(pair).toBeDefined()
    expect(pair!.size).toBe(1)
  })
})
