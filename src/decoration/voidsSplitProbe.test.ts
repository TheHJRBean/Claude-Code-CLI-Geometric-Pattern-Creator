import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { cross, dist, dot, sub } from '../utils/math'
import { extractVoids } from './voids'
import { runPIC } from '../pic/index'
import { generateTiling } from '../tilings/archimedean'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { resetIds } from '../tilings/shared'
import { flattenStrandsToSegments } from './flatten'
import { SAMPLE_EDITOR_CONFIG } from '../editor/sampleConfig'
import { editorTilesToPolygons } from '../editor/buildEditorPolygons'
import { editorLatticeStamps } from '../editor/lattice'
import { createDefault488EditorConfig } from '../editor/createDefault'
import { compositionToPolygons, compositionLatticeStamps } from '../editor/compositionLattice'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'

/**
 * PROBE — reproduce "Matching reach leaves a few odd voids unpainted".
 * Extract voids from real PIC fields, then group them by *tolerance*
 * congruence (numeric ring comparison) and report classes that split into
 * more than one quantised signature — those siblings won't co-paint.
 */

interface Ring { lens: number[]; angs: number[] } // degrees

function ringOf(poly: Vec2[]): Ring {
  const n = poly.length
  const lens: number[] = []
  const angs: number[] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]
    const cur = poly[i]
    const next = poly[(i + 1) % n]
    const inDir = sub(cur, prev)
    const outDir = sub(next, cur)
    const turn = Math.atan2(cross(inDir, outDir), dot(inDir, outDir))
    angs.push(((Math.PI - turn) * 180) / Math.PI)
    lens.push(dist(cur, next))
  }
  return { lens, angs }
}

// Interleave as [a0,e0,a1,e1,…] like voidSignature; reflection = plain ring
// reversal (alternation makes the angle↔preceding-edge re-pairing line up).
function interleave(r: Ring): number[] {
  const out: number[] = []
  for (let i = 0; i < r.lens.length; i++) { out.push(r.angs[i], r.lens[i]) }
  return out
}

function congruentTol(a: Ring, b: Ring, lenTol: number, angTol: number): boolean {
  const n = a.lens.length
  if (b.lens.length !== n) return false
  const ra = interleave(a)
  const m = ra.length
  // tolerance per slot: even slots are angles, odd slots are lengths
  const tolAt = (i: number) => (i % 2 === 0 ? angTol : lenTol)
  for (const [variant, rb] of [interleave(b), interleave(b).reverse()].entries()) {
    // keep slot types aligned: forward ring is angle-first (even rotations),
    // the reversed ring is edge-first (odd rotations re-align it)
    for (let s = variant === 0 ? 0 : 1; s < m; s += 2) {
      let ok = true
      for (let i = 0; i < m && ok; i++) {
        if (Math.abs(ra[i] - rb[(i + s) % m]) > tolAt(i)) ok = false
      }
      if (ok) return true
    }
  }
  return false
}

function probeField(name: string, segs: { from: Vec2; to: Vec2 }[], W: number): number {
  const bound: Vec2[] = [{ x: -W, y: -W }, { x: W, y: -W }, { x: W, y: W }, { x: -W, y: W }]
  const voids = extractVoids(segs, bound)
  // tolerance-congruence classes (greedy against representatives)
  const classes: { ring: Ring; sigs: Map<string, number>; area: number }[] = []
  for (const v of voids) {
    const r = ringOf(v.polygon)
    let hit = classes.find(c => Math.abs(c.area - v.area) < 1 && congruentTol(c.ring, r, 0.05, 0.05))
    if (!hit) { hit = { ring: r, sigs: new Map(), area: v.area }; classes.push(hit) }
    hit.sigs.set(v.signature, (hit.sigs.get(v.signature) ?? 0) + 1)
  }
  const split = classes.filter(c => c.sigs.size > 1)
  console.log(`\n=== ${name}: ${voids.length} voids, ${classes.length} tolerance-classes, ${split.length} SPLIT`)
  for (const c of split.slice(0, 6)) {
    console.log(`  split class area=${c.area.toFixed(2)} sigs=${[...c.sigs.entries()].map(([s, k]) => `${s}×${k}`).join(' ')}`)
    console.log(`    lens=${c.ring.lens.map(l => l.toFixed(4)).join(',')}`)
    console.log(`    angs=${c.ring.angs.map(a => a.toFixed(4)).join(',')}`)
  }
  return split.length
}

// Mirrors usePattern's stampSegments: full Segment metadata survives so the
// curve pipeline (buildStrands) works on the stamped field.
function stampSegs(base: Segment[], stamps: { translation: Vec2; rotation: number }[]): Segment[] {
  const out: Segment[] = []
  for (const st of stamps) {
    const cos = Math.cos(st.rotation), sin = Math.sin(st.rotation)
    const rot = (v: Vec2): Vec2 => st.rotation === 0
      ? { x: v.x + st.translation.x, y: v.y + st.translation.y }
      : { x: v.x * cos - v.y * sin + st.translation.x, y: v.x * sin + v.y * cos + st.translation.y }
    for (const s of base) {
      out.push({ ...s, from: rot(s.from), to: rot(s.to), edgeMidpoint: rot(s.edgeMidpoint), polygonCenter: rot(s.polygonCenter) })
    }
  }
  return out
}

describe('PROBE — Builder fields', () => {
  it('SAMPLE patch (square + 4 triangles) stamped, θ=60', () => {
    resetIds()
    const cell = SAMPLE_EDITOR_CONFIG.cells[0]
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'editor', scale: 60 },
      editor: SAMPLE_EDITOR_CONFIG,
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
      },
    }
    const basePolys = editorTilesToPolygons(cell)
    const baseSegments = runPIC(basePolys, config)
    const stamps = editorLatticeStamps(cell, { x: -600, y: -600, width: 1200, height: 1200 })
    expect(probeField('SAMPLE stamped θ=60', stampSegs(baseSegments, stamps), 500)).toBe(0)
  })

  it('SAMPLE patch CURVED θ=72/45 mixed', () => {
    resetIds()
    const cell = SAMPLE_EDITOR_CONFIG.cells[0]
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'editor', scale: 60 },
      editor: SAMPLE_EDITOR_CONFIG,
      figures: {
        3: {
          type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72,
          curve: { enabled: true, points: [{ position: 0.5, offset: 0.2 }], alternating: true },
        },
        4: {
          type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45,
          curve: { enabled: true, points: [{ position: 0.5, offset: 0.2 }], alternating: true },
        },
      },
    }
    const basePolys = editorTilesToPolygons(cell)
    const baseSegments = runPIC(basePolys, config)
    const stamps = editorLatticeStamps(cell, { x: -600, y: -600, width: 1200, height: 1200 })
    expect(probeField('SAMPLE stamped curved', flattenStrandsToSegments(stampSegs(baseSegments, stamps), config), 500)).toBe(0)
  })

  it('4.8.8 multi-cell composition θ=67.5/45', () => {
    resetIds()
    const editor = createDefault488EditorConfig()
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'editor', scale: 60 },
      editor,
      figures: {
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45 },
        8: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
      },
    }
    const basePolys = compositionToPolygons(editor)
    const baseSegments = runPIC(basePolys, config)
    const stamps = compositionLatticeStamps(editor, { x: -600, y: -600, width: 1200, height: 1200 })
    expect(probeField('4.8.8 composition', stampSegs(baseSegments, stamps), 500)).toBe(0)
  })

  it('square + vertex lines (non-fast-path), θ=67.5', () => {
    resetIds()
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'square', scale: 60 },
      figures: {
        4: {
          type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5,
          vertexLinesEnabled: true,
        },
      },
    }
    const polys = generateTiling(TILINGS['square'], { x: -400, y: -400, width: 800, height: 800 }, 60)
    expect(probeField('square + vertex lines', runPIC(polys, config), 300)).toBe(0)
  })
})

describe('PROBE — congruent-signature splits on real fields', () => {
  it('4.8.8 default θ', () => {
    resetIds()
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: '4.8.8', scale: 60 },
      figures: {
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45 },
        8: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
      },
    }
    const polys = generateTiling(TILINGS['4.8.8'], { x: -400, y: -400, width: 800, height: 800 }, 60)
    expect(probeField('4.8.8 θ=67.5/45', runPIC(polys, config), 300)).toBe(0)
  })

  it('square θ=67.5', () => {
    resetIds()
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'square', scale: 60 },
      figures: { 4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 } },
    }
    const polys = generateTiling(TILINGS['square'], { x: -400, y: -400, width: 800, height: 800 }, 60)
    expect(probeField('square θ=67.5', runPIC(polys, config), 300)).toBe(0)
  })

  it('square θ=67.5 CURVED', () => {
    resetIds()
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'square', scale: 60 },
      figures: {
        4: {
          type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5,
          curve: { enabled: true, points: [{ position: 0.5, offset: 0.3 }], alternating: true },
        },
      },
    }
    const polys = generateTiling(TILINGS['square'], { x: -400, y: -400, width: 800, height: 800 }, 60)
    const segs = runPIC(polys, config)
    expect(probeField('square θ=67.5 curved', flattenStrandsToSegments(segs, config), 300)).toBe(0)
  })

  it('4.8.8 CURVED', () => {
    resetIds()
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: '4.8.8', scale: 60 },
      figures: {
        4: {
          type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45,
          curve: { enabled: true, points: [{ position: 0.5, offset: 0.25 }] },
        },
        8: {
          type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5,
          curve: { enabled: true, points: [{ position: 0.5, offset: 0.25 }] },
        },
      },
    }
    const polys = generateTiling(TILINGS['4.8.8'], { x: -400, y: -400, width: 800, height: 800 }, 60)
    const segs = runPIC(polys, config)
    expect(probeField('4.8.8 curved', flattenStrandsToSegments(segs, config), 300)).toBe(0)
  })

  it('3.4.6.4 mixed θ', () => {
    resetIds()
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: '3.4.6.4', scale: 60 },
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 30 },
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
      },
    }
    const polys = generateTiling(TILINGS['3.4.6.4'], { x: -400, y: -400, width: 800, height: 800 }, 60)
    expect(probeField('3.4.6.4', runPIC(polys, config), 300)).toBe(0)
  })
})
