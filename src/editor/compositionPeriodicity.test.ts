/**
 * Regression guard for the Composition periodicity fast-path (Lever A, flagged
 * in usePattern). It tiles ONE fundamental domain via SVG <use> instead of
 * running PIC over the whole stamped field — valid only if PIC is exactly
 * per-polygon translation-equivariant. This asserts that invariant: the union
 * of base segments translated per stamp equals PIC over the fully stamped
 * field (no vertex-lines, pure-translation lattice). If PIC ever gains a
 * cross-polygon dependency that breaks this, the periodic path must be
 * re-gated — this test will catch it.
 */
import { test, expect } from 'vitest'
import type { PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import { createDefaultEditorConfig } from './createDefault'
import { editorTilesToPolygons } from './buildEditorPolygons'
import { editorLatticeStamps } from './lattice'
import { DEFAULT_EDITOR_FIGURE } from './tileTypes'
import { DEFAULT_CONFIG } from '../state/defaults'
import { runPIC } from '../pic/index'

function segKey(s: Segment): string {
  const f = 1e3
  const a = `${Math.round(s.from.x * f)},${Math.round(s.from.y * f)}`
  const b = `${Math.round(s.to.x * f)},${Math.round(s.to.y * f)}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

for (const shape of ['hexagon', 'square'] as const) {
  test(`periodic == exact (${shape}, no vertex lines)`, () => {
    const editor = createDefaultEditorConfig({ shape, seedSides: shape === 'hexagon' ? 6 : 4, edgeLength: 100 })
    const cell = editor.cells[0]
    const sides = shape === 'hexagon' ? '6' : '4'
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { ...DEFAULT_CONFIG.tiling, type: 'editor' },
      editor,
      figures: { ...DEFAULT_CONFIG.figures, [sides]: DEFAULT_EDITOR_FIGURE },
    }
    const basePolys = editorTilesToPolygons(cell)
    const baseSegs = runPIC(basePolys, config)
    const viewport = { x: -800, y: -800, width: 1600, height: 1600 }
    const stamps = editorLatticeStamps(cell, viewport)
    expect(stamps.every(s => s.rotation === 0)).toBe(true)

    // Exact: PIC over the fully stamped field.
    const stamped: Polygon[] = []
    for (let s = 0; s < stamps.length; s++) {
      const t = stamps[s].translation
      for (const p of basePolys) {
        stamped.push({
          ...p, id: `${p.id}@${s}`,
          center: { x: p.center.x + t.x, y: p.center.y + t.y },
          vertices: p.vertices.map(v => ({ x: v.x + t.x, y: v.y + t.y })),
        })
      }
    }
    const exact = runPIC(stamped, config)

    // Periodic: base segments translated per stamp.
    const periodic: Segment[] = []
    for (const st of stamps) {
      const t = st.translation
      for (const sg of baseSegs) {
        const tr = (v: Vec2) => ({ x: v.x + t.x, y: v.y + t.y })
        periodic.push({ ...sg, from: tr(sg.from), to: tr(sg.to) })
      }
    }

    const exactSet = new Set(exact.map(segKey))
    const periodicSet = new Set(periodic.map(segKey))
    // Every exact segment is reproduced by the periodic tiling and vice versa.
    const missing = [...exactSet].filter(k => !periodicSet.has(k))
    const extra = [...periodicSet].filter(k => !exactSet.has(k))
    expect(missing.length).toBe(0)
    expect(extra.length).toBe(0)
    expect(exactSet.size).toBeGreaterThan(0)
  })
}
