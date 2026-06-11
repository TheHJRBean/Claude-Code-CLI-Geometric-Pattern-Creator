import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { centroid } from '../utils/math'
import { extractVoids } from './voids'
import { runPIC } from '../pic/index'
import { editorTilesToPolygons } from '../editor/buildEditorPolygons'
import { editorLatticeStamps } from '../editor/lattice'
import { createDefaultEditorConfig } from '../editor/createDefault'
import { activeCell } from '../editor/active'
import { DEFAULT_CONFIG } from '../state/defaults'
import type { PatternConfig } from '../types/pattern'
import type { Segment } from '../types/geometry'

/**
 * PROBE — fast-path Decoration rep coverage. Replicates usePattern's
 * `decorationReps` (Voronoi-cell rep selection) and checks that tiling the
 * reps across stamps covers EVERY void of a directly-extracted field:
 * a hole = a void "Matching" can never paint (and clicks pass through).
 */

function stampSegs(base: Segment[], stamps: { translation: Vec2; rotation: number }[]): { from: Vec2; to: Vec2 }[] {
  const out: { from: Vec2; to: Vec2 }[] = []
  for (const st of stamps) {
    for (const s of base) {
      out.push({
        from: { x: s.from.x + st.translation.x, y: s.from.y + st.translation.y },
        to: { x: s.to.x + st.translation.x, y: s.to.y + st.translation.y },
      })
    }
  }
  return out
}

function probeReps(name: string, shape: 'square' | 'hexagon' | 'triangle', contactAngle: number): number {
  const editor = createDefaultEditorConfig({ shape })
  const cell = activeCell(editor)
  const seed = cell.tiles[0]
  const seedSides = seed.kind === 'regular' ? seed.sides : 4
  const config: PatternConfig = {
    ...DEFAULT_CONFIG,
    tiling: { type: 'editor', scale: 60 },
    editor,
    figures: { [String(seedSides)]: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle } },
  }
  const basePolys = editorTilesToPolygons(cell)
  const baseSegments = runPIC(basePolys, config)

  // — replicate decorationReps —
  const H = 12 * Math.max(editor.edgeLength, cell.boundarySize)
  const allStamps = editorLatticeStamps(cell, { x: -H, y: -H, width: 2 * H, height: 2 * H })
  if (!allStamps.every(s => s.rotation === 0)) {
    console.log(`\n=== ${name}: rotation stamps — fast-path ineligible, skipping`)
    return 0
  }
  let d1 = Infinity
  for (const st of allStamps) {
    const d = Math.hypot(st.translation.x, st.translation.y)
    if (d > 1e-6 && d < d1) d1 = d
  }
  const ring = allStamps.filter(st => Math.hypot(st.translation.x, st.translation.y) <= 3 * d1 + 1e-6)
  const field = stampSegs(baseSegments, ring)
  const R = 2.5 * d1
  const bound: Vec2[] = [{ x: -R, y: -R }, { x: R, y: -R }, { x: R, y: R }, { x: -R, y: R }]
  const voids = extractVoids(field, bound)
  const maxRepArea = d1 * d1 * 1.05
  const reps: { polygon: Vec2[]; signature: string; centroid: Vec2 }[] = []
  for (const v of voids) {
    if (Math.abs(v.area) > maxRepArea) continue
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
    if (isOrigin) reps.push({ polygon: v.polygon, signature: v.signature, centroid: c })
  }

  // — coverage check: every interior void of the field should match a tiled rep —
  // candidate world rep centroids = rep centroid + stamp translation
  const repSpots: { x: number; y: number; sig: string }[] = []
  for (const st of ring) {
    for (const r of reps) {
      repSpots.push({ x: r.centroid.x + st.translation.x, y: r.centroid.y + st.translation.y, sig: r.signature })
    }
  }
  const innerR = R - d1 // away from the bound so clipped voids don't count
  let holes = 0
  const holeDetails: string[] = []
  for (const v of voids) {
    if (Math.abs(v.area) > maxRepArea) continue
    const c = centroid(v.polygon)
    if (Math.abs(c.x) > innerR || Math.abs(c.y) > innerR) continue
    const hit = repSpots.find(s => Math.abs(s.x - c.x) < 0.5 && Math.abs(s.y - c.y) < 0.5)
    if (!hit) {
      holes++
      holeDetails.push(`  HOLE at (${c.x.toFixed(1)},${c.y.toFixed(1)}) area=${v.area.toFixed(1)} sig=${v.signature}`)
    } else if (hit.sig !== v.signature) {
      holes++
      holeDetails.push(`  SIG-MISMATCH at (${c.x.toFixed(1)},${c.y.toFixed(1)}) field=${v.signature} rep=${hit.sig}`)
    }
  }
  console.log(`\n=== ${name}: ${voids.length} field voids, ${reps.length} reps, ${holes} HOLES/MISMATCHES`)
  for (const h of holeDetails.slice(0, 10)) console.log(h)
  return holes
}

describe('PROBE — fast-path rep coverage holes', () => {
  it('square cell θ=60 (Builder default)', () => expect(probeReps('square θ=60', 'square', 60)).toBe(0))
  it('square cell θ=67.5', () => expect(probeReps('square θ=67.5', 'square', 67.5)).toBe(0))
  it('hexagon cell θ=60', () => expect(probeReps('hexagon θ=60', 'hexagon', 60)).toBe(0))
  it('hexagon cell θ=67.5', () => expect(probeReps('hexagon θ=67.5', 'hexagon', 67.5)).toBe(0))
  it('triangle cell θ=60', () => expect(probeReps('triangle θ=60', 'triangle', 60)).toBe(0))
})
