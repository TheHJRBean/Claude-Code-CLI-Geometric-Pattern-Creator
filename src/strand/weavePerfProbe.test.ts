import { describe, it } from 'vitest'
import { createDefault4612EditorConfig, createDefaultEditorConfig } from '../editor/createDefault'
import { compositionToPolygons, compositionLatticeStamps } from '../editor/compositionLattice'
import { editorTilesToPolygons } from '../editor/buildEditorPolygons'
import { editorLatticeStamps } from '../editor/lattice'
import { activeCell } from '../editor/active'
import { runPIC } from '../pic'
import { seedFiguresForEditor } from '../editor/tileTypes'
import { buildStrands } from './buildStrands'
import { computeCurves } from './computeCurves'
import { computeWeave } from './weave'
import { wovenPathD } from './wovenPathD'
import type { PatternConfig } from '../types/pattern'
import type { EditorConfig } from '../types/editor'
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

function probe(label: string, editor: EditorConfig, vw: number, vh: number) {
  const patch = editor
  const multiCell = patch.cells.length > 1
  const cell = activeCell(patch)
  const basePolys = multiCell ? compositionToPolygons(patch) : editorTilesToPolygons(cell)
  const config = {
    tiling: { type: 'editor' },
    figures: seedFiguresForEditor({}, editor),
    editor,
    strand: { width: 3, color: '#000', background: '#fff' },
  } as unknown as PatternConfig
  const baseSegments = runPIC(basePolys, config)
  // Mirror the non-fast-path: gen rect = visible + 0.75*vw padding each side.
  const genW = vw * 2.5, genH = vh * 2.5
  const box = { x: -genW / 2, y: -genH / 2, width: genW, height: genH }
  const stamps = multiCell ? compositionLatticeStamps(patch, box) : editorLatticeStamps(cell, box)
  const field = stamp(baseSegments, stamps)

  const t0 = performance.now()
  const strandData = buildStrands(field)
  const t1 = performance.now()
  const weaves = computeWeave(strandData)
  const t2 = performance.now()
  const curved = computeCurves(strandData, field, config)
  const t3 = performance.now()
  let unders = 0
  let pathChars = 0
  for (let i = 0; i < curved.length; i++) {
    const u = weaves[i].under
    unders += u.length
    if (u.length > 0) pathChars += wovenPathD(curved[i], u.map(c => ({ s: c.s, half: 4 }))).length
  }
  const t4 = performance.now()
  // eslint-disable-next-line no-console
  console.log(
    `${label}: stamps=${stamps.length} segs=${field.length} strands=${strandData.length} unders=${unders}\n` +
    `  buildStrands=${(t1 - t0).toFixed(0)}ms computeWeave=${(t2 - t1).toFixed(0)}ms ` +
    `computeCurves=${(t3 - t2).toFixed(0)}ms wovenPathD=${(t4 - t3).toFixed(0)}ms ` +
    `TOTAL=${(t4 - t0).toFixed(0)}ms (pathChars=${pathChars})`,
  )
}

describe('weave perf probe (decoration-scale fields)', () => {
  it('default single square, 1600x1200 viewport', () => {
    probe('single-square', createDefaultEditorConfig(), 1600, 1200)
  })
  it('4.6.12 multi-cell, 1600x1200 viewport', () => {
    probe('4.6.12', createDefault4612EditorConfig(), 1600, 1200)
  })
  it('4.6.12 multi-cell, zoomed out 3200x2400', () => {
    probe('4.6.12-zoomout', createDefault4612EditorConfig(), 3200, 2400)
  })
})
