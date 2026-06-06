import { useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import type { ViewTransform } from './usePanZoom'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { editorBoundaryVertices, editorTilesToPolygons, tilesToPolygons } from '../editor/buildEditorPolygons'
import { editorLatticeStamps, editorNeighbourStamps, type LatticeStamp } from '../editor/lattice'
import {
  compositionBoundaryOutlines,
  compositionLatticeStamps,
  compositionNeighbourStamps,
  compositionToPolygons,
} from '../editor/compositionLattice'
import { activeCell } from '../editor/active'
import { frameOutlinePolygon } from '../editor/frame'
import { pointInPolygon, isConvexPolygon } from '../utils/math'
import { runPIC } from '../pic/index'
import { recordPerf, periodicityEnabled } from '../utils/perf'
import type { VoidFill } from '../decoration/resolve'
import { extractVoids, type VoidRegion } from '../decoration/voids'
import { curvesEnabled, flattenStrandsToSegments } from '../decoration/flatten'

export interface PatternData {
  polygons: Polygon[]
  segments: Segment[]
  /**
   * Builder Patch Boundary outlines (Step 17.2+).
   * - Design Phase: a single outline per Cell.
   * - Composition Phase + `showBoundaryLattice`: one outline per Cell per
   *   lattice stamp.
   * - Otherwise: undefined.
   */
  boundaryOutlines?: Vec2[][]
  /**
   * Step 17.6d — Design-Phase neighbour preview. Polygons stamped at the
   * one-ring lattice offsets around the Patch, drawn at low opacity so the
   * user can see how their Patch joins its neighbours. Excluded from PIC.
   */
  ghostPolygons?: Polygon[]
  /**
   * Step 17.11 — the neighbour-stamp set (full visible lattice minus the
   * centre copy) used to build `ghostPolygons`. Returned so Canvas can derive
   * Complete-mode clickable vertices from the *same* stamps the ghosts were
   * drawn from — guaranteeing every clickable dot sits on a rendered ghost.
   * Undefined when the neighbour preview is off.
   */
  neighbourStamps?: LatticeStamp[]
  /**
   * Count of leading entries in `boundaryOutlines` that belong to the seed
   * Patch (vs neighbour-stamp ghosts). Lets the renderer style seed Cell
   * boundaries more prominently than ghost boundaries so the active Patch
   * remains the visual focal point when Show neighbours is on.
   * Undefined when there's no Seed/ghost distinction (Composition Phase
   * lattice or no boundary outlines at all).
   */
  seedOutlineCount?: number
  /**
   * Set of polygon ids belonging to neighbour-stamp ghosts (Step 17.6d, when
   * Show neighbours + Show strands are both on so PIC sees ghost polygons).
   * StrandLayer uses this to grey out Strands wholly contained inside the
   * ghost ring — seed-touching cross-boundary Strands stay full colour so
   * the user can still see how Strands flow into neighbouring Cells.
   * Undefined when ghost polygons aren't in the PIC input.
   */
  ghostPolygonIds?: Set<string>
  /**
   * Lever A (periodicity fast-path, flagged). When present, the Composition
   * field is periodic: `polygons` + `segments` are ONE fundamental domain (the
   * base patch) and the renderer tiles them at these stamp translations via
   * SVG `<use>`, so runPIC + buildStrands ran only once. Only emitted when the
   * tiling is exact + seamless this way (single-cell, pure-translation stamps,
   * no vertex-lines / frame / boundary-lattice); otherwise undefined and the
   * normal pre-stamped `polygons`/`segments` are used.
   */
  compositionStamps?: LatticeStamp[]
  /**
   * Step 19.2/19.3 — Decoration **Void Fill**s, resolved from
   * `editor.decoration` over the current bound. Drawn behind the Strands.
   * Only emitted in the Decoration phase (`decorationActive`).
   */
  voidFills?: VoidFill[]
  /**
   * Step 19.2/19.3 — Decoration **Strand colour** override (Congruent scope),
   * or null/undefined ⇒ the renderer uses `StrandStyle.color`.
   */
  strandColor?: string | null
  /**
   * Step 19.3 — ALL Voids extracted in the Decoration phase (filled or not),
   * with polygon + congruent signature. Canvas hit-tests these for Paint-mode
   * hover-highlight + click-to-Fill. Only emitted when `decorationActive`.
   */
  decorationVoids?: VoidRegion[]
}

/** Translate (and, only off the fast-path, rotate) already-PIC'd base segments
 * across lattice stamps to build the full field WITHOUT re-running PIC — valid
 * because PIC is translation-invariant on a periodic field. */
function stampSegments(base: Segment[], stamps: LatticeStamp[]): Segment[] {
  const out: Segment[] = []
  for (const st of stamps) {
    const tx = st.translation.x, ty = st.translation.y
    if (st.rotation === 0) {
      for (const s of base) {
        out.push({
          ...s,
          from: { x: s.from.x + tx, y: s.from.y + ty },
          to: { x: s.to.x + tx, y: s.to.y + ty },
          edgeMidpoint: { x: s.edgeMidpoint.x + tx, y: s.edgeMidpoint.y + ty },
          polygonCenter: { x: s.polygonCenter.x + tx, y: s.polygonCenter.y + ty },
        })
      }
    } else {
      const cos = Math.cos(st.rotation), sin = Math.sin(st.rotation)
      const rot = (v: Vec2): Vec2 => ({ x: v.x * cos - v.y * sin + tx, y: v.x * sin + v.y * cos + ty })
      for (const s of base) {
        out.push({ ...s, from: rot(s.from), to: rot(s.to), edgeMidpoint: rot(s.edgeMidpoint), polygonCenter: rot(s.polygonCenter) })
      }
    }
  }
  return out
}

/** Resolve Decoration render data (Void fills + strand colour + all Voids for
 * Paint hit-testing) from a field of segments + a convex bound. */
function buildDecorationData(
  fieldSegments: Segment[],
  bound: Vec2[],
  config: PatternConfig,
): { voidFills: VoidFill[]; strandColor: string | null; decorationVoids: VoidRegion[] } {
  const decoSegments = curvesEnabled(config) ? flattenStrandsToSegments(fieldSegments, config) : fieldSegments
  const decorationVoids = extractVoids(decoSegments, bound)
  const deco = config.editor?.decoration
  const voidFills: VoidFill[] = []
  let strandColor: string | null = null
  if (deco) {
    const strandRec = deco.strandColours.find(r => r.scope === 'congruent')
    strandColor = strandRec ? strandRec.colour : null
    const congruent = deco.voidFills.filter(r => r.scope === 'congruent')
    // A `'*'` record is the "colour all Voids" default; specific signatures override it.
    const allColour = congruent.find(r => r.key === '*')?.colour ?? null
    const colourBySig = new Map(congruent.filter(r => r.key !== '*').map(r => [r.key, r.colour]))
    if (allColour !== null || colourBySig.size > 0) {
      for (const v of decorationVoids) {
        const c = colourBySig.get(v.signature) ?? allColour
        if (c) voidFills.push({ polygon: v.polygon, colour: c })
      }
    }
  }
  return { voidFills, strandColor, decorationVoids }
}

export function usePattern(
  config: PatternConfig,
  viewTransform: ViewTransform,
  containerWidth: number,
  containerHeight: number,
  /** Step 17.6 — when true and a Builder Patch is active, stamp the Patch on the Boundary's translation lattice across the viewport. */
  editorStrandMode = false,
  /** Step 17.6 — when true in Composition Phase, also draw the Patch Boundary outline at every lattice stamp. */
  showBoundaryLattice = false,
  /** Step 17.6d — Design-Phase neighbour preview. Ignored in Composition Phase. */
  editorNeighbourPreview = false,
  /** Step 17.6d — Design-Phase neighbour preview: also draw the Boundary outline at each neighbour stamp. */
  editorNeighbourBoundaries = false,
  /** Step 17.6d — Design-Phase neighbour preview: include ghosts in the PIC input so Strands flow across boundaries. */
  editorNeighbourStrands = false,
  /** Frame overlay present — clip the field to the Frame outline and include
   * the Frame's completion Tiles in the PIC input so Strands flow out to the
   * frame edge through them. Persistent across Design + Composition. */
  editorFrame = false,
  /** Step 19.3 — Decoration phase active: resolve `editor.decoration` into
   * Void fills + strand colour, and bypass the periodic fast-path so the
   * full field is available for global Void extraction. */
  decorationActive = false,
): PatternData {
  // Visible viewport in world coordinates
  const vw = containerWidth / viewTransform.zoom
  const vh = containerHeight / viewTransform.zoom

  // Quantize the viewport position so most pan frames hit the memo cache.
  // Step = 12% of viewport size; with 75% padding the generated area
  // fully covers several steps of panning in any direction, and combined
  // with useDeferredValue in Canvas the regeneration never blocks input.
  const step = Math.max(vw, vh) * 0.12 || 1
  const qx = Math.floor(viewTransform.x / step) * step
  const qy = Math.floor(viewTransform.y / step) * step

  const pad = 0.75
  const genX = qx - vw * pad
  const genY = qy - vh * pad
  const genW = vw * (1 + 2 * pad)
  const genH = vh * (1 + 2 * pad)

  // Finding 2 (2026-06-05) — viewport-independent Builder base geometry.
  // The Patch tiles (`basePolys`), their Boundary outlines, and the no-ghost
  // PIC run depend only on `config`, not the viewport, yet the main memo below
  // re-keys on the quantised viewport and so rebuilds them on every ~12% pan
  // step. Hoisting them into a config-keyed memo means panning a Design-phase
  // Patch reuses these refs: no polygon rebuild, no runPIC, and — because
  // `polygons`/`segments` stay referentially stable — the memoised render
  // layers (TileLayer/StrandLayer) bail too. Null outside the Builder.
  // `baseSegments` is the PIC over the unstamped Patch only; the Composition
  // and neighbour-ghost paths still run their own viewport-dependent PIC.
  const editorBase = useMemo(() => {
    if (config.tiling.type !== 'editor' || !config.editor) return null
    const patch = config.editor
    const multiCell = patch.cells.length > 1
    const cell = activeCell(patch)
    const basePolys = multiCell
      ? compositionToPolygons(patch)
      : editorTilesToPolygons(cell)
    const baseOutlines: Vec2[][] = multiCell
      ? compositionBoundaryOutlines(patch)
      : [editorBoundaryVertices(cell)]
    const baseSegments = runPIC(basePolys, config)
    return { patch, multiCell, cell, basePolys, baseOutlines, baseSegments }
  }, [config])

  return useMemo(() => {
    // Step 17 Builder: when a Patch is active, render its Tiles directly.
    // Design Phase = single Patch; Composition Phase = lattice-stamped across
    // the viewport so the user sees how Strands flow across boundaries.
    if (config.tiling.type === 'editor' && config.editor && editorBase) {
      const { patch, multiCell, cell, basePolys } = editorBase
      if (!editorStrandMode) {
        const baseOutlines = editorBase.baseOutlines
        let ghostPolygons: typeof basePolys | undefined
        let boundaryOutlines: Vec2[][] = [...baseOutlines]
        // Neighbour preview: the full visible lattice of neighbour stamps minus
        // the centre copy (single-cell uses the per-Cell lattice — triangle has
        // a 2-orientation cell; multi-cell uses the Configuration lattice, each
        // stamp carrying every Cell — e.g. 1 octagon + 1 square for 4.8.8). The
        // same `ringStamps` set is returned so Complete-mode clickable vertices
        // sit exactly on these ghosts.
        let ringStamps: LatticeStamp[] | undefined
        if (editorNeighbourPreview) {
          const viewport = { x: genX, y: genY, width: genW, height: genH }
          ringStamps = multiCell
            ? compositionNeighbourStamps(patch, viewport)
            : editorNeighbourStamps(cell, viewport)
          if (ringStamps.length > 0) {
            ghostPolygons = []
            for (let s = 0; s < ringStamps.length; s++) {
              const stamp = ringStamps[s]
              const t = stamp.translation
              const cos = Math.cos(stamp.rotation)
              const sin = Math.sin(stamp.rotation)
              const rot = (v: Vec2): Vec2 => stamp.rotation === 0
                ? v
                : { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos }
              for (const p of basePolys) {
                const c = rot(p.center)
                ghostPolygons.push({
                  ...p,
                  id: `${p.id}~ghost@${s}`,
                  center: { x: c.x + t.x, y: c.y + t.y },
                  vertices: p.vertices.map(v => {
                    const r = rot(v)
                    return { x: r.x + t.x, y: r.y + t.y }
                  }),
                })
              }
              if (editorNeighbourBoundaries) {
                // Multi-cell emits one outline per Cell per stamp (octagon +
                // square × N); single-cell emits one per stamp.
                for (const outline of baseOutlines) {
                  boundaryOutlines.push(outline.map(v => {
                    const r = rot(v)
                    return { x: r.x + t.x, y: r.y + t.y }
                  }))
                }
              }
            }
          }
        }
        // Strands flow across stamp boundaries when the user opts in by
        // including ghost polygons in the PIC input. Otherwise PIC runs on
        // the centre patch only and strands stop at the boundary.
        const ghostsInPic = !!(editorNeighbourPreview && editorNeighbourStrands && ghostPolygons)
        const picInput = ghostsInPic && ghostPolygons
          ? [...basePolys, ...ghostPolygons]
          : basePolys
        // Reuse the viewport-independent base PIC run when no ghosts feed it
        // (Finding 2). Only the neighbour-ghost case needs a fresh, viewport-
        // dependent PIC over the stamped ghost ring.
        const tPic = performance.now()
        const segments = ghostsInPic ? runPIC(picInput, config) : editorBase.baseSegments
        recordPerf({
          phase: editorNeighbourPreview ? 'design+neighbours' : 'design',
          polygons: basePolys.length,
          ghosts: ghostPolygons?.length ?? 0,
          stamps: ringStamps?.length ?? 0,
          segments: segments.length,
          picMs: ghostsInPic ? performance.now() - tPic : 0,
          strandMs: 0,
        })
        const ghostPolygonIds = ghostsInPic && ghostPolygons
          ? new Set(ghostPolygons.map(p => p.id))
          : undefined
        return {
          polygons: basePolys,
          segments,
          boundaryOutlines,
          ghostPolygons,
          neighbourStamps: ringStamps,
          seedOutlineCount: baseOutlines.length,
          ghostPolygonIds,
        }
      }
      // Composition Phase — stamp on the lattice. Single-cell Patches use the
      // per-Cell lattice (triangle has 2 intra-stamps, square/hex have 1);
      // multi-cell Patches use the Configuration lattice (the unit cell is
      // already merged in basePolys via compositionToPolygons).
      const stamps = multiCell
        ? compositionLatticeStamps(patch, { x: genX, y: genY, width: genW, height: genH })
        : editorLatticeStamps(cell, { x: genX, y: genY, width: genW, height: genH })
      // Lever A (flagged): periodic fast-path. Tile ONE fundamental domain via
      // <use> instead of PIC-ing the whole stamped field every regeneration —
      // runPIC + buildStrands then run once on the base patch. Exact + seamless
      // only when: single-cell, pure-translation stamps (no rotation; tangents
      // match at seams by lattice symmetry), no vertex-lines (base PIC would
      // miss stamp-boundary internal edges), no frame (completedTiles don't
      // repeat), no boundary-lattice overlay. Otherwise fall through to the
      // exact stamped path below.
      if (
        periodicityEnabled()
        && !multiCell
        && !editorFrame
        && !showBoundaryLattice
        && !Object.values(config.figures).some(f => f?.vertexLinesEnabled)
        && stamps.every(s => s.rotation === 0)
      ) {
        recordPerf({
          phase: decorationActive ? 'decoration·periodic' : 'composition·periodic',
          polygons: basePolys.length,
          ghosts: 0,
          stamps: stamps.length,
          segments: editorBase.baseSegments.length,
          picMs: 0,
          strandMs: 0,
        })
        // Decoration over a periodic field: render via the same <use> clones
        // (PIC ran once on the base patch), and build the full field for Void
        // extraction by *translating* those base segments — no re-PIC. Repeated
        // Voids are then exact translates ⇒ identical signatures (consistent
        // group-fill), and the heavy full-field PIC/buildStrands is avoided.
        if (decorationActive) {
          const bx = genX + vw * pad
          const by = genY + vh * pad
          const bound: Vec2[] = [
            { x: bx, y: by }, { x: bx + vw, y: by },
            { x: bx + vw, y: by + vh }, { x: bx, y: by + vh },
          ]
          const field = stampSegments(editorBase.baseSegments, stamps)
          const { voidFills, strandColor, decorationVoids } = buildDecorationData(field, bound, config)
          return { polygons: basePolys, segments: editorBase.baseSegments, compositionStamps: stamps, voidFills, strandColor, decorationVoids }
        }
        return { polygons: basePolys, segments: editorBase.baseSegments, compositionStamps: stamps }
      }
      const polygons: typeof basePolys = []
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
      // Step 17 Framing — bound the stamped field to the Frame so a gap opens
      // for completion: keep only tiles whose centre is inside the outline
      // (the field stops ~1 tile short of the edge), then add the completion
      // Tiles (world space, added once — they don't repeat under the Lattice)
      // so PIC Strands flow out to the frame edge through them via each Tile's
      // own tile-type Figure recipe (already in `config.figures`).
      let picPolygons = polygons
      if (editorFrame && patch.frame) {
        const outline = frameOutlinePolygon(patch.frame)
        if (outline) {
          picPolygons = polygons.filter(p => pointInPolygon(p.center, outline))
          if (patch.frame.completedTiles?.length) {
            picPolygons = [...picPolygons, ...tilesToPolygons(patch.frame.completedTiles)]
          }
        }
      }
      const tPic = performance.now()
      const segments = runPIC(picPolygons, config)
      recordPerf({
        phase: 'composition',
        polygons: picPolygons.length,
        ghosts: 0,
        stamps: stamps.length,
        segments: segments.length,
        picMs: performance.now() - tPic,
        strandMs: 0,
      })
      // Boundary outlines are opt-in in Composition Phase (showBoundaryLattice).
      // Multi-cell emits one outline per Cell per stamp (octagon + square × N
      // stamps); single-cell emits one outline per stamp.
      let boundaryOutlines: Vec2[][] | undefined
      if (showBoundaryLattice) {
        const baseOutlines = editorBase.baseOutlines
        boundaryOutlines = []
        for (const stamp of stamps) {
          const cos = Math.cos(stamp.rotation)
          const sin = Math.sin(stamp.rotation)
          for (const outline of baseOutlines) {
            boundaryOutlines.push(outline.map(v => {
              const rx = stamp.rotation === 0 ? v.x : v.x * cos - v.y * sin
              const ry = stamp.rotation === 0 ? v.y : v.x * sin + v.y * cos
              return { x: rx + stamp.translation.x, y: ry + stamp.translation.y }
            }))
          }
        }
      }
      // Step 19.3 — Decoration: resolve Void fills + strand colour over the
      // current bound (the convex Frame outline if present, else the generated
      // viewport rect). Geometry is frozen in this phase, so the full-field
      // extraction here only re-runs on pan/zoom, not on interaction.
      if (decorationActive) {
        // Bound extraction to the VISIBLE viewport, not the padded generation
        // rect (genW/genH carry 0.75× padding ⇒ ~6× the area ⇒ ~36× the O(n²)
        // arrangement work — enough to hang on entry). The generated field
        // still covers this tight rect.
        const bx = genX + vw * pad
        const by = genY + vh * pad
        let bound: Vec2[] = [
          { x: bx, y: by }, { x: bx + vw, y: by },
          { x: bx + vw, y: by + vh }, { x: bx, y: by + vh },
        ]
        if (editorFrame && patch.frame) {
          const outline = frameOutlinePolygon(patch.frame)
          if (outline && outline.length >= 3 && isConvexPolygon(outline)) bound = outline
        }
        // Non-periodic fall-back (frame / multi-cell / vertex-lines): extract
        // over the full PIC field. Same helper as the periodic fast-path.
        const { voidFills, strandColor, decorationVoids } = buildDecorationData(segments, bound, config)
        return { polygons: picPolygons, segments, boundaryOutlines, voidFills, strandColor, decorationVoids }
      }
      return { polygons: picPolygons, segments, boundaryOutlines }
    }

    const def = TILINGS[config.tiling.type]
    if (!def) return { polygons: [], segments: [] }

    const viewport = { x: genX, y: genY, width: genW, height: genH }

    const polygons = def.category === 'rosette-patch'
      ? generateRosettePatch(def, viewport, config.tiling.scale)
      : generateTiling(def, viewport, config.tiling.scale)
    const segments = runPIC(polygons, config)

    return { polygons, segments }
  }, [config, editorBase, genX, genY, genW, genH, editorStrandMode, showBoundaryLattice, editorNeighbourPreview, editorNeighbourBoundaries, editorNeighbourStrands, editorFrame, decorationActive])
}
