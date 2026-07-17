import { describe, expect, it } from 'vitest'
import { createDefault488EditorConfig, createDefaultEditorConfig } from '../editor/createDefault'
import { editorTilesToPolygons } from '../editor/buildEditorPolygons'
import { editorLatticeStamps } from '../editor/lattice'
import { compositionToPolygons, compositionLatticeStamps } from '../editor/compositionLattice'
import { seedFiguresForEditor } from '../editor/tileTypes'
import { frameOutlinePolygon } from '../editor/frame'
import { runPIC } from '../pic/index'
import { decorationExtractionPolygons } from '../hooks/usePattern'
import { strandIdentities } from './strandGroups'
import { extractVoids } from './voids'
import { pointInPolygon, dist } from '../utils/math'
import type { Vec2 } from '../utils/math'
import type { PatternConfig } from '../types/pattern'
import type { Polygon } from '../types/geometry'
import type { FrameConfig } from '../types/editor'

/**
 * [DEBUG-fid1] Diagnosis probe — "Frame corrupts tile/void identity"
 * (memory: project_frame_touching_strands_bug, 2026-07-08).
 *
 * Mirrors usePattern's `stampedField` non-fast-path frame flow EXACTLY:
 *   polygons   = lattice-stamped basePolys over the frame field box
 *   picPolygons = polygons filtered to centre-inside-frame (+ completedTiles)
 *   segments   = runPIC(picPolygons)     ← the RENDERED field
 *   decoField  = runPIC(polygons)        ← the Void-extraction field
 *
 * Symptom A (strands): painting an interior congruent strand class misses
 * frame-adjacent strands — their chains are truncated by the frame filter so
 * their signatures leave the interior class.
 *
 * Symptom B (voids): paint-all-matching-voids misses voids near the Frame —
 * their extracted signature differs from the interior congruent class.
 */

// Half-diagonal (circumradius) of the square frame. Big enough that the
// deep-interior band spans multiple 4.8.8 lattice cells (~241 world units) —
// otherwise the interior congruent-class census misses legitimate periodic
// classes and the assertions go red for the wrong reason.
const FRAME_SIZE = 800

function buildFrameField(kind: 'square' | '488' = '488') {
  // 4.8.8 multi-cell Patch — cross-Cell strands (single-cell square fields
  // have only tile-local closed-loop strands, structurally immune to frame
  // truncation). The square variant is kept as the immune control.
  const ed = kind === '488'
    ? createDefault488EditorConfig()
    : createDefaultEditorConfig({ boundarySize: 100 })
  const frame: FrameConfig = { type: 'shape', shape: 'square', size: FRAME_SIZE }
  ed.frame = frame
  const config: PatternConfig = {
    tiling: { type: 'editor', scale: 100 },
    // θ=67.5 — the classic 4.8.8 star pattern, whose strands close into
    // small local loops (the default 60° chains the entire field into one
    // giant strand, which drowns the frame-adjacency signal).
    figures: Object.fromEntries(Object.entries(seedFiguresForEditor({}, ed))
      .map(([k, f]) => [k, { ...f, contactAngle: 67.5 }])),
    strand: { width: 4, color: '#1a1a2e', background: '#f5f0e8' },
    editor: ed,
  }
  const cell = ed.cells[0]
  const multiCell = ed.cells.length > 1
  const outline = frameOutlinePolygon(frame)!

  // Field box = frame bbox + margin (mirrors frameFieldBox / nonFastVoidData).
  const margin = 2 * Math.max(ed.edgeLength, cell.boundarySize)
  const box = {
    x: -FRAME_SIZE - margin,
    y: -FRAME_SIZE - margin,
    width: 2 * (FRAME_SIZE + margin),
    height: 2 * (FRAME_SIZE + margin),
  }
  const stamps = multiCell
    ? compositionLatticeStamps(ed, box)
    : editorLatticeStamps(cell, box)!
  const basePolys = multiCell ? compositionToPolygons(ed) : editorTilesToPolygons(cell)

  const polygons: Polygon[] = []
  for (let s = 0; s < stamps.length; s++) {
    const stamp = stamps[s]
    const t = stamp.translation
    const cos = Math.cos(stamp.rotation)
    const sin = Math.sin(stamp.rotation)
    const rot = (v: Vec2): Vec2 => stamp.rotation === 0
      ? v
      : { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos }
    for (const p of basePolys) {
      const c = rot(p.center)
      polygons.push({
        ...p,
        id: `${p.id}@${s}`,
        center: { x: c.x + t.x, y: c.y + t.y },
        vertices: p.vertices.map(v => {
          const r = rot(v)
          return { x: r.x + t.x, y: r.y + t.y }
        }),
      })
    }
  }

  const picPolygons = polygons.filter(p => pointInPolygon(p.center, outline))
  const segments = runPIC(picPolygons, config)
  const decoField = runPIC(polygons, config)
  return { config, ed, cell, outline, margin, stamps, polygons, picPolygons, segments, decoField }
}

/** Min distance from a point to the (square, axis-aligned) frame outline. */
function distToOutline(p: Vec2, outline: Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const L2 = dx * dx + dy * dy
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
    const q = { x: a.x + dx * t, y: a.y + dy * t }
    best = Math.min(best, dist(p, q))
  }
  return best
}

describe('[DEBUG-fid1] frame identity corruption', () => {
  it('[DEBUG-fid1] field stats', () => {
    const { segments, picPolygons, polygons, decoField, ed } = buildFrameField()
    const report = (label: string, segs: typeof segments) => {
      const ids = strandIdentities(segs)
      const sizes = new Map<number, number>()
      const sigCount = new Map<string, number>()
      let crossTile = 0
      for (let s = 0; s < ids.strandData.length; s++) {
        const segIdx = ids.strandData[s].segmentIndices
        sizes.set(segIdx.length, (sizes.get(segIdx.length) ?? 0) + 1)
        const polys = new Set(segIdx.map(i => segs[i].polygonId))
        if (polys.size > 1) crossTile++
        const sig = ids.strands[s].signature
        sigCount.set(sig, (sigCount.get(sig) ?? 0) + 1)
      }
      console.log(`[DEBUG-fid1] ${label}: strands`, ids.strands.length, 'crossTile:', crossTile,
        'chain sizes:', [...sizes.entries()].sort((a, b) => a[0] - b[0]),
        'classes:', sigCount.size, [...sigCount.values()].sort((a, b) => b - a).slice(0, 10))
    }
    console.log('[DEBUG-fid1] tiles kept:', picPolygons.length, 'of', polygons.length, 'edge:', ed.edgeLength)
    report('rendered (frame-filtered)', segments)
    report('full field (decoField)  ', decoField)
  })

  // `.fails` — pins the OPEN strand half of the bug (fix in progress): strand
  // identity is chained over the frame-FILTERED field, so near-frame chains
  // truncate and their congruent signatures leave the interior class. Flip to
  // a plain `it` when the strand-identity fix lands.
  it.fails('A: congruent strand paint reaches the same motif element near the frame', () => {
    const { outline, segments, stamps } = buildFrameField()
    const ids = strandIdentities(segments)

    // "Paint" the strand that owns a deep-interior segment, congruent scope:
    // reach = every segment of every strand sharing that signature.
    const segMid = (i: number): Vec2 => ({
      x: (segments[i].from.x + segments[i].to.x) / 2,
      y: (segments[i].from.y + segments[i].to.y) / 2,
    })
    let seed = -1
    let seedD = -Infinity
    for (let i = 0; i < segments.length; i++) {
      const d = distToOutline(segMid(i), outline)
      if (pointInPolygon(segMid(i), outline) && d > seedD) { seedD = d; seed = i }
    }
    expect(seed).toBeGreaterThanOrEqual(0)
    const paintedSig = ids.strands[ids.strandOfSegment[seed]].signature
    const painted = new Set<number>()
    for (let i = 0; i < segments.length; i++) {
      if (ids.strands[ids.strandOfSegment[i]]?.signature === paintedSig) painted.add(i)
    }

    // The SAME motif element translated by lattice vectors toward the frame:
    // visually identical to the painted one, so the user expects it painted.
    const p0 = segMid(seed)
    const misses: string[] = []
    let translatesChecked = 0
    for (const st of stamps) {
      const t = st.translation
      if (Math.hypot(t.x, t.y) < 1e-6) continue
      const q = { x: p0.x + t.x, y: p0.y + t.y }
      if (!pointInPolygon(q, outline)) continue
      // Find the rendered segment whose midpoint sits at the translate.
      let hit = -1
      for (let i = 0; i < segments.length; i++) {
        if (dist(segMid(i), q) < 1e-3) { hit = i; break }
      }
      if (hit < 0) continue // truncated away entirely (field stops short)
      translatesChecked++
      if (!painted.has(hit)) {
        misses.push(`translate(${t.x.toFixed(0)},${t.y.toFixed(0)}) dToFrame=${distToOutline(q, outline).toFixed(0)}`)
      }
    }
    expect(translatesChecked).toBeGreaterThan(0)
    // Desired: congruent paint covers every visible copy of the motif element.
    expect(misses).toEqual([])
  })

  it('B: voids near the frame keep an interior congruent signature', () => {
    const { outline, decoField, ed, margin } = buildFrameField()
    const L = ed.edgeLength
    const bound: Vec2[] = [
      { x: -FRAME_SIZE - margin, y: -FRAME_SIZE - margin },
      { x: FRAME_SIZE + margin, y: -FRAME_SIZE - margin },
      { x: FRAME_SIZE + margin, y: FRAME_SIZE + margin },
      { x: -FRAME_SIZE - margin, y: FRAME_SIZE + margin },
    ]
    const voids = extractVoids(decoField, bound)

    const interiorSigs = new Set<string>()
    const frameAdjacent: { sig: string; c: Vec2 }[] = []
    for (const v of voids) {
      let cx = 0, cy = 0
      for (const p of v.polygon) { cx += p.x; cy += p.y }
      const c = { x: cx / v.polygon.length, y: cy / v.polygon.length }
      if (!pointInPolygon(c, outline)) continue
      const d = distToOutline(c, outline)
      if (d > 1.5 * L) interiorSigs.add(v.signature)
      else frameAdjacent.push({ sig: v.signature, c })
    }
    expect(interiorSigs.size).toBeGreaterThan(0)
    expect(frameAdjacent.length).toBeGreaterThan(0)

    const orphans = frameAdjacent.filter(f => !interiorSigs.has(f.sig))
    expect(
      orphans.map(o => `${o.sig}@${o.c.x.toFixed(0)},${o.c.y.toFixed(0)}`),
    ).toEqual([])
  })

  it('C: voids bounded by frame-completion Tiles exist in the extraction field', () => {
    const { config, outline, margin, polygons, picPolygons } = buildFrameField()
    // A frame completion: a Tile the frame-node Complete flow would add in
    // the gap between the filtered field and the outline. Take a lattice
    // polygon that was filtered OUT (centre outside) but overlaps the frame
    // interior — exactly where completions live.
    const kept = new Set(picPolygons.map(p => p.id))
    const found = polygons.find(p =>
      !kept.has(p.id)
      && !pointInPolygon(p.center, outline)
      && p.vertices.some(v => pointInPolygon(v, outline)))
    expect(found).toBeDefined()
    // Frame completions anchor to FRAME nodes (edgeLength-spaced along the
    // outline from each corner) — generally OFF-lattice. A lattice-aligned
    // completion coincides with a decoField polygon and hides the divergence,
    // so shift it half a tile sideways like a real node-anchored completion.
    const shift = { x: config.editor!.edgeLength / 2, y: 0 }
    const comp = {
      ...found!,
      id: `${found!.id}-comp`,
      center: { x: found!.center.x + shift.x, y: found!.center.y + shift.y },
      vertices: found!.vertices.map(v => ({ x: v.x + shift.x, y: v.y + shift.y })),
    }

    // Rendered field WITH the completion (mirrors picPolygons + completedTiles).
    const rendered = runPIC([...picPolygons, comp!], config)
    const bound: Vec2[] = [
      { x: -FRAME_SIZE - margin, y: -FRAME_SIZE - margin },
      { x: FRAME_SIZE + margin, y: -FRAME_SIZE - margin },
      { x: FRAME_SIZE + margin, y: FRAME_SIZE + margin },
      { x: -FRAME_SIZE - margin, y: FRAME_SIZE + margin },
    ]
    const visible = extractVoids(rendered, bound)
    // What hit-testing/fills use — the production extraction-field builder.
    const appVoids = extractVoids(
      runPIC(decorationExtractionPolygons(polygons, [comp]), config), bound)

    // Every visible Void inside the frame near the completion Tile must have
    // a same-signature, same-place counterpart in the app extraction.
    const near = (c: Vec2) => dist(c, comp!.center) < 1.5 * config.editor!.edgeLength
    const misses: string[] = []
    let checked = 0
    for (const v of visible) {
      let cx = 0, cy = 0
      for (const p of v.polygon) { cx += p.x; cy += p.y }
      const c = { x: cx / v.polygon.length, y: cy / v.polygon.length }
      if (!pointInPolygon(c, outline) || !near(c)) continue
      // Decorative-scale faces only. The synthetic completion is shifted off
      // the lattice WITHOUT re-anchoring to the kept field (a real frame
      // completion is flush by construction), so the visible field has big
      // open gap faces around it whose closure legitimately differs from the
      // extraction's periodic closure — those aren't paintable voids.
      if (v.area > 0.5 * config.editor!.edgeLength ** 2) continue
      checked++
      const match = appVoids.some(a => {
        if (a.signature !== v.signature) return false
        let ax = 0, ay = 0
        for (const p of a.polygon) { ax += p.x; ay += p.y }
        return dist({ x: ax / a.polygon.length, y: ay / a.polygon.length }, c) < 1
      })
      if (!match) {
        const nearSame = appVoids.filter(a => {
          let ax = 0, ay = 0
          for (const p of a.polygon) { ax += p.x; ay += p.y }
          return dist({ x: ax / a.polygon.length, y: ay / a.polygon.length }, c) < 20
        }).map(a => `${a.signature} area=${a.area.toFixed(0)}`)
        console.log('[DEBUG-fid1] C orphan', v.signature, `@${c.x.toFixed(0)},${c.y.toFixed(0)}`,
          'area=', v.area.toFixed(0), 'compCenter=', comp.center, 'nearApp=', nearSame)
        misses.push(`${v.signature}@${c.x.toFixed(0)},${c.y.toFixed(0)}`)
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(misses).toEqual([])
  })
})
