import { describe, expect, it } from 'vitest'
import { createDefault488EditorConfig, createDefault33434EditorConfig } from '../editor/createDefault'
import { compositionToPolygons, compositionLatticeStamps } from '../editor/compositionLattice'
import { seedFiguresForEditor } from '../editor/tileTypes'
import { frameOutlinePolygon } from '../editor/frame'
import { runPIC } from '../pic/index'
import { decorationExtractionPolygons } from '../hooks/usePattern'
import { baseSegmentSignatureMap, segmentBaseSignatures, strandIdentitiesFromBase } from './strandGroups'
import { extractVoids } from './voids'
import { pointInPolygon, dist } from '../utils/math'
import type { Vec2 } from '../utils/math'
import type { PatternConfig } from '../types/pattern'
import type { Polygon } from '../types/geometry'
import type { FrameConfig } from '../types/editor'

/**
 * Regression suite for "Frame corrupts tile/void identity" (reported
 * 2026-07-08, diagnosed + fixed 2026-07-17).
 *
 * Mirrors usePattern's `stampedField` non-fast-path frame flow:
 *   polygons    = lattice-stamped basePolys over the frame field box
 *   picPolygons = polygons filtered to centre-inside-frame (+ completedTiles)
 *   segments    = runPIC(picPolygons)     ← the RENDERED field
 *   decoField   = extraction-field PIC    ← the Void hit-test/fill field
 *
 * A (strands): chaining the frame-FILTERED field truncates cross-tile chains
 * at the frame, so near-frame strand signatures were frame-dependent and left
 * the painted congruent class. Fixed by `strandIdentitiesFromBase` — the
 * signature comes from the base fragment's chains via stamp-mapping, matching
 * the periodic fast path.
 *
 * B (voids, held fix `2e7f8b1`): extraction must not clip at the frame
 * outline — frame-straddling voids keep their periodic congruent signature.
 *
 * C (voids at frame completions): the extraction field must swap in
 * world-space completion Tiles for the lattice tiles they replace
 * (`decorationExtractionPolygons`), or completion-bounded voids don't exist
 * in the hit-test/fill set.
 */

// Half-diagonal (circumradius) of the square frame. Big enough that the
// deep-interior band spans multiple 4.8.8 lattice cells (~241 world units) —
// otherwise the interior congruent-class census misses legitimate periodic
// classes and the assertions go red for the wrong reason.
const FRAME_SIZE = 800

function buildFrameField(opts?: { vertexLines?: boolean }) {
  // 4.8.8 multi-cell Patch — its strands chain ACROSS tiles, which is what
  // the frame truncates. (Single-cell square fields at θ=67.5 have only
  // tile-local closed-loop strands and are structurally immune.)
  const ed = createDefault488EditorConfig()
  const frame: FrameConfig = { type: 'shape', shape: 'square', size: FRAME_SIZE }
  ed.frame = frame
  const config: PatternConfig = {
    tiling: { type: 'editor', scale: 100 },
    figures: Object.fromEntries(Object.entries(seedFiguresForEditor({}, ed))
      .map(([k, f]) => [k, {
        ...f,
        contactAngle: 67.5,
        ...(opts?.vertexLines ? { vertexLinesEnabled: true } : {}),
      }])),
    strand: { width: 4, color: '#1a1a2e', background: '#f5f0e8' },
    editor: ed,
  }
  const cell = ed.cells[0]
  const outline = frameOutlinePolygon(frame)!

  // Field box = frame bbox + margin (mirrors frameFieldBox / nonFastVoidData).
  const margin = 2 * Math.max(ed.edgeLength, cell.boundarySize)
  const box = {
    x: -FRAME_SIZE - margin,
    y: -FRAME_SIZE - margin,
    width: 2 * (FRAME_SIZE + margin),
    height: 2 * (FRAME_SIZE + margin),
  }
  const stamps = compositionLatticeStamps(ed, box)
  const basePolys = compositionToPolygons(ed)

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
  const baseSegments = runPIC(basePolys, config)
  return { config, ed, cell, outline, margin, stamps, polygons, picPolygons, segments, decoField, baseSegments }
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

describe('frame identity corruption (regression)', () => {
  it('A: congruent strand paint reaches the same motif element near the frame', () => {
    const { outline, segments, stamps, baseSegments } = buildFrameField()
    // The production identity derivation (StrandLayer + nonFastStrandHits):
    // signatures from the BASE fragment's chains via stamp-mapping. Chaining
    // the frame-filtered field directly (plain `strandIdentities(segments)`)
    // truncates chains at the frame and near-frame strands leave the painted
    // congruent class — the original bug.
    const ids = strandIdentitiesFromBase(segments, baseSegments, stamps)

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

  it('D: congruent strand paint reaches every border segment of the painted base class', () => {
    // The strand-half fix (`2224286`) keyed each RENDERED chain by the
    // majority base signature of its segments. But in a multi-class field
    // (vertex lines / extra line sets) a rendered chain spans multiple base
    // classes, and a frame-TRUNCATED border chain has a different class mix
    // than the interior mega-chain — majorities flip frame-dependently and
    // whole classes can vanish from the per-chain histogram ("strand colour
    // not applying to strands touching the frame border", 2026-07-19).
    // Congruent resolution must be per SEGMENT, not per chain majority.
    const { segments, stamps, baseSegments } = buildFrameField({ vertexLines: true })
    const ids = strandIdentitiesFromBase(segments, baseSegments, stamps)
    const segSigs = segmentBaseSignatures(segments, baseSegmentSignatureMap(baseSegments), stamps)

    // The field genuinely has multiple base classes and mixed chains —
    // otherwise this test can't tell per-segment from per-chain resolution.
    const classes = new Set(segSigs.filter((s): s is string => s !== null))
    expect(classes.size).toBeGreaterThan(1)

    // Painting a class congruent-scope must reach every segment whose own
    // base class matches — visually identical copies of the clicked element.
    // The production paint keys + stroke resolution use the per-SEGMENT
    // effective signature; assert it never diverges from the base class.
    const misses: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const sig = segSigs[i]
      if (sig === null || ids.strandOfSegment[i] < 0) continue
      if (ids.segmentSignatures[i] !== sig) {
        const mx = (segments[i].from.x + segments[i].to.x) / 2
        const my = (segments[i].from.y + segments[i].to.y) / 2
        misses.push(`${sig}@${mx.toFixed(0)},${my.toFixed(0)} got=${ids.segmentSignatures[i]}`)
      }
    }
    expect(misses).toEqual([])

    // Every base class must be reachable by a congruent paint click. The
    // per-CHAIN majority (fix `2224286` alone) loses whole classes — 37/44
    // chains here are mixed and one class vanishes from the chain histogram.
    const chainSigs = new Set(ids.strands.map(s => s.signature))
    const segEffSigs = new Set(ids.segmentSignatures)
    for (const c of classes) expect(segEffSigs.has(c)).toBe(true)
    // Documents WHY the per-segment path exists: if chains ever become
    // class-pure, this goes red and the split machinery can be reconsidered.
    expect([...classes].every(c => chainSigs.has(c))).toBe(false)
  })

  it('E: strand hit/paint field covers the border band the fills paint', () => {
    // Round 5 ("border strand colour error is still persisting", 2026-07-20):
    // the RENDERED field keeps only tiles whose centre is inside the outline
    // (the completion gap), but Void fills extract from the FULL field and
    // paint out to the frame edge. The strand strips the user sees are the
    // gaps BETWEEN fills — in the border band they had no rendered segment
    // under them, so clicks hit nothing and paint never applied there.
    // nonFastStrandHits + the Decoration StrandLayer field must therefore be
    // the extraction field (decoField), whose strips match the fills.
    //
    // 4.8.8 at θ=67.5 doesn't exhibit the gap (long star arms from kept tiles
    // cover the excluded band); the reporting field — snub square at θ=10,
    // shallow arms hugging the tile edges — does. Mirror it.
    const ed = createDefault33434EditorConfig()
    const frame: FrameConfig = { type: 'shape', shape: 'square', size: 471 }
    ed.frame = frame
    const config: PatternConfig = {
      tiling: { type: 'editor', scale: 100 },
      figures: Object.fromEntries(Object.entries(seedFiguresForEditor({}, ed))
        .map(([k, f]) => [k, { ...f, contactAngle: 10 }])),
      strand: { width: 1, color: '#1a1a2e', background: '#f5f0e8' },
      editor: ed,
    }
    const outline = frameOutlinePolygon(frame)!
    const margin = 3 * Math.max(ed.edgeLength, ed.cells[0].boundarySize)
    const box = { x: -471 - margin, y: -471 - margin, width: 2 * (471 + margin), height: 2 * (471 + margin) }
    const stamps = compositionLatticeStamps(ed, box)
    const basePolys = compositionToPolygons(ed)
    const polygons: Polygon[] = []
    for (let s = 0; s < stamps.length; s++) {
      const t = stamps[s].translation
      for (const p of basePolys) {
        polygons.push({
          ...p,
          id: `${p.id}@${s}`,
          center: { x: p.center.x + t.x, y: p.center.y + t.y },
          vertices: p.vertices.map(v => ({ x: v.x + t.x, y: v.y + t.y })),
        })
      }
    }
    const segments = runPIC(polygons.filter(p => pointInPolygon(p.center, outline)), config)
    const decoField = runPIC(polygons, config)

    // Motivation: the rendered field genuinely leaves strips uncovered.
    const sampleCovered = (field: typeof segments): { visible: number; uncovered: number } => {
      let visible = 0, uncovered = 0
      for (const s of decoField) {
        for (let k = 0; k <= 4; k++) {
          const t = k / 4
          const p = { x: s.from.x + (s.to.x - s.from.x) * t, y: s.from.y + (s.to.y - s.from.y) * t }
          if (!pointInPolygon(p, outline)) continue
          visible++
          let best = Infinity
          for (const r of field) {
            const dx = r.to.x - r.from.x, dy = r.to.y - r.from.y
            const L2 = dx * dx + dy * dy
            const tt = Math.max(0, Math.min(1, ((p.x - r.from.x) * dx + (p.y - r.from.y) * dy) / (L2 || 1)))
            const d = Math.hypot(p.x - (r.from.x + dx * tt), p.y - (r.from.y + dy * tt))
            if (d < best) best = d
            if (best === 0) break
          }
          if (best > 6) uncovered++
        }
      }
      return { visible, uncovered }
    }
    const rendered = sampleCovered(segments)
    expect(rendered.visible).toBeGreaterThan(0)
    // Documents WHY hits come from decoField: if the rendered field ever
    // covers the whole visible band, the field split can be reconsidered.
    expect(rendered.uncovered).toBeGreaterThan(0)
    // The fix: the extraction field covers every visible strip (trivially —
    // the strips ARE its segments; pinned so the fields never diverge again).
    expect(sampleCovered(decoField).uncovered).toBe(0)
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
      if (!match) misses.push(`${v.signature}@${c.x.toFixed(0)},${c.y.toFixed(0)}`)
    }
    expect(checked).toBeGreaterThan(0)
    expect(misses).toEqual([])
  })
})
