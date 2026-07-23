import { useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import type { ViewTransform } from './usePanZoom'
import { TILINGS } from '../tilings/index'
import type { TilingCategory } from '../types/tiling'
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
import { pointInPolygon, centroid } from '../utils/math'
import { runPIC } from '../pic/index'
import { morphActive } from '../pic/morph'
import { runRosettePIC } from '../pic/rosettePatch'
import { recordPerf, periodicityEnabled } from '../utils/perf'
import { colourVoids, keyVoids, makeVoidFill, type PaintVoid, type StrandHit, type VoidFill } from '../decoration/resolve'
import { resolveVoidStamps, type StampPlacement } from '../decoration/stamps'
import { extractVoids, pairCurvedOutlines, type VoidRegion } from '../decoration/voids'
import { buildColourIndex, orbitOffset, resolveFill, scopedKey } from '../decoration/scopes'
import { cellFramesFromOutlines, cellOrbitKey, reduceToOrbit, type CellFrame } from '../decoration/cellScope'
import { strandIdentities, strandIdentitiesFromBase } from '../decoration/strandGroups'
import { curvesEnabled, flattenStrandsToSegments, flattenSegmentPolylines } from '../decoration/flatten'
import { overlapsExisting } from '../editor/tileOverlap'

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
   * Stage 2 — world-space `instance`-scope Void fills. On the periodic
   * fast-path `voidFills` renders INSIDE the cloned fragment (so it tiles),
   * which can't express a single world copy; these render once, in world
   * coordinates, sandwiched between the under-fragment and strand-fragment
   * `<use>` stacks. Undefined off the fast-path (instance fills resolve into
   * `voidFills` there, which is already world-space).
   */
  instanceVoidFills?: VoidFill[]
  /**
   * Decoration **Void Stamps** — resolved image placements. Same coordinate
   * convention as `voidFills`: representative (fragment-space) on the
   * periodic fast-path so `<use>` tiles them, world-space otherwise.
   */
  voidStamps?: StampPlacement[]
  /**
   * Step 19.3 — Void hit-targets for the Paint overlay (representative Voids
   * tiled across the visible stamps), carrying their Grouping-scope keys.
   * Only emitted when painting Voids.
   */
  decorationVoids?: PaintVoid[]
  /**
   * Step 19.3 / Stage 2 — Strand hit-targets for the Paint overlay, carrying
   * each segment's strand identity (id / congruent signature / patch-orbit
   * key). Only emitted when painting Strands.
   */
  decorationStrandHits?: StrandHit[]
  /**
   * Stage 2 — lattice stamp translations for per-strand `patch`-orbit colour
   * resolution in StrandLayer. Only set on the NON-fast-path Decoration branch
   * (full pre-stamped field); on the fast-path the fragment renders base-domain
   * strands whose centroids are already orbit-relative.
   */
  decorationOrbitStamps?: Vec2[]
  /**
   * Stage 2b — per-Cell symmetry frames (from the boundary outlines) for
   * `cell`-scope colour resolution in StrandLayer. Decoration only.
   */
  decorationCellFrames?: CellFrame[]
  /**
   * Base-fragment strand-identity source for the NON-fast editor path.
   * StrandLayer resolves each rendered strand's congruent signature from the
   * base fragment's chains (majority over its segments' stamp-mapped base
   * twins) instead of the stamped field's chains — stamped chains merge
   * across stamps and truncate at the Frame, making their signatures frame-
   * dependent (near-frame paint dropout). Matches the fast path's
   * `baseStrandIds` keying. Undefined off the editor non-fast path.
   */
  strandIdentitySource?: { baseSegments: Segment[]; stamps: LatticeStamp[] }
}

/** Translate (and, only off the fast-path, rotate) already-PIC'd base segments
 * across lattice stamps to build the full field WITHOUT re-running PIC — valid
 * because PIC is translation-invariant on a periodic field. Exported for
 * characterization tests (thermo-nuclear review Chunk 4). */
export function stampSegments(base: Segment[], stamps: LatticeStamp[]): Segment[] {
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

/** Lever-A periodic fast-path eligibility — the SINGLE source of truth shared
 * by the render branch and the pan-independent Decoration reps/fills memos.
 * If the two drift, Decoration either blanks (fast-path renders but the fills
 * memo bailed) or wastes a full extraction (fills computed but the render
 * falls back to the exact stamped path). `stamps` can be ANY stamp set for
 * the patch: rotations come from the cell shape / Configuration basis, never
 * the viewport, so eligibility is viewport-independent. Exported for
 * characterization tests (thermo-nuclear review Chunk 4). */
export function periodicFastPathEligible(
  config: PatternConfig,
  editorFrame: boolean,
  showBoundaryLattice: boolean,
  stamps: LatticeStamp[],
): boolean {
  return periodicityEnabled()
    && !editorFrame
    && !showBoundaryLattice
    // Step 20 Morph: θ varies with world position, so every stamped Patch
    // copy has genuinely different Figures — <use>-stamping one base domain
    // would repeat the origin copy everywhere.
    && !morphActive(config)
    // World-space Guide-scoped Tiles don't repeat under the Lattice, so the
    // per-domain <use> tiling would either drop or falsely repeat them.
    && !(config.editor?.guideTiles?.length)
    // Across-frame gradient underlay (#45) is ONE world-space gradient spanning
    // the whole composition. A `userSpaceOnUse` def inside the tiled fragment
    // would repeat per <use> clone (the clone translation shifts its user
    // space) instead of washing continuously — fall through to the exact
    // world-space field so the underlay stays a single continuous gradient.
    && !(config.editor?.decoration?.frameGradient?.enabled)
    // Weave (Lacing) interlaces over the FULL planar arrangement: crossings at
    // the seams BETWEEN stamped copies must alternate over/under with the ones
    // inside a domain. computeWeave over one base domain never sees those seam
    // crossings, so <use>-tiling it leaves the border strands un-interlaced
    // ("lacing only within patches"). Same class of miss as vertex-lines below
    // — fall through to the exact stamped field so the weave spans the seams.
    && !config.strand?.weave
    && !Object.values(config.figures).some(f => f?.vertexLinesEnabled)
    && stamps.every(s => s.rotation === 0)
}

/** Rosette epic Step 4 (ticket #23) — the archimedean/rosette-patch PIC
 * dispatch, pulled out of the main memo so it's independently testable
 * without rendering the hook: a mis-wired category branch would silently
 * run the wrong figure construction on live Gallery tilings. */
export function runPICForCategory(category: TilingCategory, polygons: Polygon[], config: PatternConfig): Segment[] {
  return category === 'rosette-patch' ? runRosettePIC(polygons, config) : runPIC(polygons, config)
}

/** Decoration Void extraction with curve-insensitive identity: Voids (and
 * their signatures) come from the STRAIGHT strand field; with curves on, the
 * flattened curved field is extracted too and `pairCurvedOutlines` swaps in
 * the curved outline for rendering while `keyPolygon` keeps the straight one
 * for identity keys. Paints then survive curve-recipe changes, matching how
 * strand colours already behave (strand identity is never flattened). */
function extractDecorationVoids(field: Segment[], bound: Vec2[], config: PatternConfig): VoidRegion[] {
  const straight = extractVoids(field, bound)
  if (!curvesEnabled(config)) return straight
  const curved = extractVoids(flattenStrandsToSegments(field, config), bound)
  return pairCurvedOutlines(straight, curved)
}

/**
 * Polygon set the framed Decoration extraction field is PIC'd over. The
 * extraction must NOT clip at the frame outline (a clipping bound changes a
 * frame-touching Void's congruent signature — `2e7f8b1`), so it extends past
 * the rendered field with the full `lattice`. But world-space Tiles (frame
 * completions + Guide-scoped Tiles) DO bound the visible faces near the
 * frame, and the periodic continuation they replace does not — so lattice
 * tiles overlapping a world Tile are dropped and the world Tiles added.
 * Edge-sharing neighbours are not overlaps (`overlapsExisting` semantics).
 */
export function decorationExtractionPolygons(lattice: Polygon[], worldTiles: Polygon[]): Polygon[] {
  if (worldTiles.length === 0) return lattice
  const bodies = worldTiles.map(t => t.vertices)
  return [...lattice.filter(p => !overlapsExisting(p.vertices, bodies)), ...worldTiles]
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
   * Void fills + strand colour. */
  decorationActive = false,
  /** Step 19.3 — active Paint target. Off ⇒ no overlay hit-targets (the cloned
   * representative fills still cover the whole field). Voids/Strands ⇒ tile the
   * representative Voids / base Rays across the visible stamps as hit-targets
   * (translation only — no per-pan extraction). */
  decorationPaintTarget: 'off' | 'voids' | 'strands' = 'off',
): PatternData {
  const decorationPaintActive = decorationPaintTarget !== 'off'
  // Visible viewport in world coordinates — at a BUCKETED zoom (√2 steps,
  // bucket lower bound, so the generated field always covers the exact
  // visible rect). The rendered viewBox keeps the exact zoom; vw/vh only
  // size the generated coverage. Pan is quantised below, but zoom wasn't:
  // every zoom tick changed vw/vh → genX/genY/genW/genH → rebuilt the whole
  // viewport-keyed chain (field PIC, void extraction, strand identities,
  // weave) per tick — a zoom gesture at Decoration scale crawled at ~2fps
  // while frames stayed short (the deferred render time-slices the work).
  // In-bucket zooming now reuses every memo; crossing a bucket boundary
  // rebuilds once. Cost: generated area (and extraction bound) is up to 2×
  // the exact-zoom equivalent at the top of a bucket.
  const zoomBucket = Math.pow(2, Math.floor(2 * Math.log2(viewTransform.zoom)) / 2)
  const vw = containerWidth / zoomBucket
  const vh = containerHeight / zoomBucket

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
  // Re-keyed (19.4 snag #1) on the geometry sub-fields + runPIC's full config
  // read-set (`figures` + `morph` — verified) instead of the whole `config`, so
  // Decoration paints (which only touch `editor.decoration`) no longer
  // re-run PIC. The reducer's paint actions preserve the `cells` ref.
  // ⚠ Contract: the returned `patch` is a snapshot from the last GEOMETRY
  // change — its `decoration` / `frame` may be stale. Consumers may read
  // geometry fields off it (values match the deps), but must read live
  // non-geometry fields from `config.editor` directly.
  const ed = config.tiling.type === 'editor' ? config.editor : undefined
  const editorBase = useMemo(() => {
    if (!ed) return null
    const patch = ed
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `activeCellId` is deliberately NOT a dep: with the SET_ACTIVE_CELL pane
    // swap removed it only ever changes alongside `cells` (updateCell re-aims
    // it as it mutates), and re-keying on it made every selection click re-run
    // the full PIC.
  }, [ed?.cells, ed?.edgeLength, ed?.configuration, ed?.alternateOrientation, config.figures, config.morph])

  // A representative Void in the fundamental domain, enriched with its
  // centroid (= Lattice-orbit offset, since reps live in the origin stamp's
  // Voronoi cell) and the derived `patch`- and `cell`-scope keys.
  type RepVoid = VoidRegion & { centroid: Vec2; patchKey: string; cellKey: string }

  // Stage 2b — per-Cell symmetry frames for the `cell` rung, derived from the
  // boundary outlines (handles multi-cell, octagon/dodecagon, alternate
  // orientation for free). Geometry-keyed; pan-independent.
  const decorationCellFrames = useMemo<CellFrame[] | null>(() => {
    if (!decorationActive || !editorBase) return null
    return cellFramesFromOutlines(editorBase.baseOutlines)
  }, [editorBase, decorationActive])

  // Step 19.3 — pan-INDEPENDENT Decoration representative Voids. For a
  // periodic field, extract one representative Void per lattice cell (the
  // Voronoi cell of the origin stamp, closed by a local ring of neighbours),
  // positioned in the fundamental domain. The fills memo below colours them;
  // PatternSVG renders the fills INSIDE the cloned fragment, so a single set
  // tiles across the whole field via <use> — no per-viewport extraction, no
  // pan re-extract, full coverage everywhere. Recomputes only on geometry /
  // curve-recipe changes (not on pan/zoom, not on paint).
  const decorationReps = useMemo<RepVoid[] | null>(() => {
    if (!decorationActive || !editorBase) return null
    const patch = editorBase.patch
    const cell = editorBase.cell
    const H = 12 * Math.max(patch.edgeLength, cell.boundarySize)
    const box = { x: -H, y: -H, width: 2 * H, height: 2 * H }
    const allStamps = editorBase.multiCell
      ? compositionLatticeStamps(patch, box)
      : editorLatticeStamps(cell, box)
    // Only when the periodic fast-path will actually render (otherwise the
    // non-fast-path branch computes fills via buildDecorationData and this
    // extraction would be wasted — and expensive with curves on). Shared
    // predicate with the render gate so the two can't drift; the rotation
    // check also skips the extraction where the fast-path never fires
    // (e.g. triangle cells' rotation-π intra-stamp — 19.4 snag #3).
    // Alternate orientation is fine here: the rigid Patch rotation is baked
    // into basePolys AND the lattice basis (stamps stay pure-translation), so
    // the extraction field, Voronoi reps, and the <use>-cloned render all live
    // in the same rotated frame. Bailing on it blanked painted fills.
    if (!periodicFastPathEligible(config, editorFrame, showBoundaryLattice, allStamps)) return null
    let d1 = Infinity
    for (const st of allStamps) {
      const d = Math.hypot(st.translation.x, st.translation.y)
      if (d > 1e-6 && d < d1) d1 = d
    }
    if (!isFinite(d1)) return []
    // Keep only the near ring so the field stays tiny regardless of H.
    const ring = allStamps.filter(st => Math.hypot(st.translation.x, st.translation.y) <= 3 * d1 + 1e-6)
    const field = stampSegments(editorBase.baseSegments, ring)
    const R = 2.5 * d1
    const bound: Vec2[] = [{ x: -R, y: -R }, { x: R, y: -R }, { x: R, y: R }, { x: -R, y: R }]
    const voids = extractDecorationVoids(field, bound, config)
    // Representative Voids = those whose centroid lies in the origin stamp's
    // Voronoi cell (one per lattice orbit ⇒ tiles without gaps/overlap). These
    // drive both the cloned fills and the Paint overlay's hit-targets (tiled by
    // translation, so the overlay never re-extracts on pan).
    // A true periodic Void can't exceed one lattice cell's area (it would
    // overlap its own translates), so anything bigger is the background "sea"
    // between disconnected strand islands (sparse PIC fields) — without this
    // cap the sea becomes a bound-sized rep tiled across every stamp, and
    // hovering the bucket highlights the entire page. All shipping lattice
    // bases have cell area ≤ d1², so d1² (+5% slack) is a safe ceiling.
    const maxRepArea = d1 * d1 * 1.05
    const reps: RepVoid[] = []
    for (const v of voids) {
      if (Math.abs(v.area) > maxRepArea) continue
      // Identity (Voronoi rep test + keys) from the straight outline; the
      // rep's `polygon` stays the rendered (curved) outline for fills.
      const kp = v.keyPolygon ?? v.polygon
      const c = centroid(kp)
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
      // A rep lives in the origin stamp's Voronoi cell, so its centroid IS its
      // Lattice-orbit offset — bake the `patch`- and `cell`-scope keys once.
      if (isOrigin) {
        reps.push({
          ...v,
          centroid: c,
          patchKey: scopedKey(v.signature, c),
          // Rep polygons are already patch-reduced (origin Voronoi cell).
          cellKey: cellOrbitKey(v.signature, kp, true, c, decorationCellFrames ?? []),
        })
      }
    }
    return reps
    // Extraction depends on geometry + curve recipes only — NOT on
    // `editor.decoration`, so paints reuse the reps (19.4 snag #1). Curve
    // reads: curvesEnabled/flatten → `config.figures` + `config.smoothTransitions`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorBase, decorationActive, editorFrame, showBoundaryLattice, config.figures, config.smoothTransitions, decorationCellFrames])

  // Cheap colouring pass over the stable reps. Keys on the LIVE decoration
  // records (off `config.editor`, never `editorBase.patch` — that snapshot is
  // stale across paints), so a paint recomputes only this map + the render memo.
  // Congruent + patch rungs resolve here (a coloured rep tiles via <use>, which
  // IS the Lattice orbit); instance records can't render inside the fragment —
  // the main memo materialises those as world-space `instanceVoidFills`.
  const decorationFills = useMemo<{ fills: VoidFill[]; reps: RepVoid[]; voidIndex: ReturnType<typeof buildColourIndex>; stampPlacements: StampPlacement[] } | null>(() => {
    if (!decorationReps) return null
    const voidIndex = buildColourIndex(config.editor?.decoration?.voidFills)
    const fills: VoidFill[] = []
    for (const r of decorationReps) {
      const fill = resolveFill(voidIndex, r.signature, r.centroid, null, r.cellKey)
      if (fill) fills.push(makeVoidFill(r.polygon, r.keyPolygon, fill))
    }
    // Void Stamps over the same representative set — fragment-space, tiled by
    // <use> exactly like the fills.
    const stampPlacements = resolveVoidStamps(decorationReps, config.editor?.decoration?.voidStamps)
    return { fills, reps: decorationReps, voidIndex, stampPlacements }
  }, [decorationReps, config.editor?.decoration])

  // Stage 2 — a local ring of lattice translations used to reduce strand
  // centroids to their Lattice-orbit offset. The SAME reduction must apply on
  // the fast-path (base-domain strands) and the full-field path (pre-stamped
  // strands), otherwise a `patch`-scope key painted in one mode wouldn't
  // resolve after a mode switch (e.g. adding a Frame). Pan-independent.
  const decorationOrbitRing = useMemo<Vec2[] | null>(() => {
    if (!decorationActive || !editorBase) return null
    const patch = editorBase.patch
    const cell = editorBase.cell
    const H = 4 * Math.max(patch.edgeLength, cell.boundarySize)
    const box = { x: -H, y: -H, width: 2 * H, height: 2 * H }
    const allStamps = editorBase.multiCell
      ? compositionLatticeStamps(patch, box)
      : editorLatticeStamps(cell, box)
    return allStamps.map(s => s.translation)
  }, [editorBase, decorationActive])

  // Stage 2 — per-strand identities of the base domain, for the Paint
  // overlay's strand hit-targets on the periodic fast-path. Geometry-keyed
  // (not decoration-keyed) so paints reuse it; only built while actually
  // painting Strands.
  const baseStrandIds = useMemo(() => {
    if (!decorationActive || !editorBase || decorationPaintTarget !== 'strands') return null
    const ids = strandIdentities(editorBase.baseSegments)
    const ring = decorationOrbitRing ?? []
    const frames = decorationCellFrames ?? []
    const offsets = ids.strands.map(s => orbitOffset(s.centroid, ring))
    const patchKeys = ids.strands.map((s, i) => scopedKey(s.signature, offsets[i]))
    const cellKeys = ids.strands.map((s, i) => cellOrbitKey(
      s.signature,
      reduceToOrbit(ids.strandData[i].points, s.centroid, offsets[i]),
      s.closed,
      offsets[i],
      frames,
    ))
    return { ...ids, patchKeys, cellKeys }
  }, [editorBase, decorationActive, decorationPaintTarget, decorationOrbitRing, decorationCellFrames])

  // With a Frame filtering the field, everything the stamped field feeds is
  // clipped to the world-fixed Frame outline (Composition + Decoration both
  // clip to it), so the field generates over the FRAME's region instead of
  // the moving viewport: pan/zoom then reuses the entire chain (PIC ×2,
  // extraction, strand identities, weave downstream) instead of rebuilding it
  // every 12% pan step / zoom bucket. Margin: the Decoration extraction bound
  // is the frame bbox + 2 units (see nonFastVoidData), +1 unit so bound-edge
  // Voids close over real field — matching the old 0.75·vw coverage intent.
  const frameFieldBox = useMemo(() => {
    if (!editorStrandMode || !editorFrame || !ed?.frame || !editorBase) return null
    const outline = frameOutlinePolygon(ed.frame)
    if (!outline || outline.length < 3) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of outline) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const margin = 3 * Math.max(editorBase.patch.edgeLength, editorBase.cell.boundarySize)
    return {
      x: minX - margin,
      y: minY - margin,
      width: (maxX - minX) + 2 * margin,
      height: (maxY - minY) + 2 * margin,
    }
  }, [editorStrandMode, editorFrame, ed?.frame, editorBase])
  const fbX = frameFieldBox ? frameFieldBox.x : genX
  const fbY = frameFieldBox ? frameFieldBox.y : genY
  const fbW = frameFieldBox ? frameFieldBox.width : genW
  const fbH = frameFieldBox ? frameFieldBox.height : genH

  // Non-fast-path Composition/Decoration stamped field — geometry+viewport
  // keyed, NOT decoration-keyed (mirrors the editorBase 19.4 split). Before
  // this memo the field rebuilt inside the main memo on every paint click
  // (whole-`config` dep): full-field PIC (×2 with a frame filtering), and —
  // once Lacing shipped — the fresh `segments` identity also re-ran
  // buildStrands + computeWeave + wovenPathD over the full field in
  // StrandLayer, turning each paint into a multi-second freeze on frame /
  // vertex-line fields. Paints now reuse the field refs, so StrandLayer's
  // strand/weave memos hold. Reads live `config.editor` for patch geometry
  // (equal to the editorBase snapshot whenever geometry changed — see the
  // editorBase contract); `figures` (runPIC + eligibility read-set) is
  // covered by the editorBase dep; the reducer's paint actions preserve the
  // `frame` ref.
  const stampedField = useMemo(() => {
    if (!ed || !editorBase || !editorStrandMode) return null
    const patch = ed
    const { multiCell, cell, basePolys } = editorBase
    const stamps = multiCell
      ? compositionLatticeStamps(patch, { x: fbX, y: fbY, width: fbW, height: fbH })
      : editorLatticeStamps(cell, { x: fbX, y: fbY, width: fbW, height: fbH })
    if (periodicFastPathEligible(config, editorFrame, showBoundaryLattice, stamps)) {
      return { fastPath: true as const, stamps }
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
    // Guide-scoped world-space Tiles (slice 3) render once — added after the
    // stamped field and never repeated, so Strands flow through them to their
    // own tile-type Figure recipe just like frame completions.
    if (patch.guideTiles?.length) {
      picPolygons = [...picPolygons, ...tilesToPolygons(patch.guideTiles)]
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
    // Decoration extraction field. Frame Voids must NOT clip the extraction
    // to the frame outline (frame-touching Voids would change congruent
    // signature — "voids lose colour at the frame"), so when a frame is
    // filtering the rendered strands, re-PIC the FULL unfiltered field for
    // extraction only — swapping in the world-space Tiles (frame completions
    // + Guide Tiles) for the lattice tiles they replace, so faces near a
    // completion match what's rendered ("paint-all-matching misses voids
    // near the Frame"). Geometry-priced ⇒ lives here, not in the main memo.
    let decoField = segments
    if (decorationActive && editorFrame && patch.frame && picPolygons !== polygons) {
      const worldPolys = [
        ...(patch.frame.completedTiles?.length ? tilesToPolygons(patch.frame.completedTiles) : []),
        ...(patch.guideTiles?.length ? tilesToPolygons(patch.guideTiles) : []),
      ]
      decoField = runPIC(decorationExtractionPolygons(polygons, worldPolys), config)
    }
    return { fastPath: false as const, stamps, polygons, picPolygons, segments, boundaryOutlines, decoField }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorBase, ed?.frame, editorFrame, showBoundaryLattice, editorStrandMode, decorationActive, fbX, fbY, fbW, fbH])

  // Non-fast-path Decoration extraction + Void keying — FIELD-keyed, never
  // decoration- or Paint-target-keyed (the fast path's `decorationReps` twin):
  // switching Paint targets and painting reuse it; only geometry / frame /
  // curve-recipe / (frameless) viewport changes re-extract. With a frame the
  // bound is pan-independent (frame bbox + margin) and the field above is
  // frame-keyed, so pan/zoom never re-extracts at all.
  const nonFastBoundSig = decorationActive && stampedField && !stampedField.fastPath
    ? (frameFieldBox ? 'frame' : `${qx},${qy},${vw},${vh}`)
    : null
  const nonFastVoidData = useMemo(() => {
    if (!nonFastBoundSig || !stampedField || stampedField.fastPath || !ed || !editorBase) return null
    let bound: Vec2[]
    if (frameFieldBox && ed.frame) {
      // Frame bbox + symmetric margin — NOT the frame outline (a clipping
      // bound changes a frame-touching Void's congruent signature) and NOT
      // the viewport rect (its quantisation is asymmetric around the frame).
      const outline = frameOutlinePolygon(ed.frame)!
      let fMinX = Infinity, fMinY = Infinity, fMaxX = -Infinity, fMaxY = -Infinity
      for (const p of outline) {
        if (p.x < fMinX) fMinX = p.x
        if (p.x > fMaxX) fMaxX = p.x
        if (p.y < fMinY) fMinY = p.y
        if (p.y > fMaxY) fMaxY = p.y
      }
      const margin = 2 * Math.max(editorBase.patch.edgeLength, editorBase.cell.boundarySize)
      bound = [
        { x: fMinX - margin, y: fMinY - margin },
        { x: fMaxX + margin, y: fMinY - margin },
        { x: fMaxX + margin, y: fMaxY + margin },
        { x: fMinX - margin, y: fMaxY + margin },
      ]
    } else {
      bound = [
        { x: qx, y: qy }, { x: qx + vw, y: qy },
        { x: qx + vw, y: qy + vh }, { x: qx, y: qy + vh },
      ]
    }
    const stampTranslations = stampedField.stamps.map(s => s.translation)
    return {
      keyed: keyVoids(extractDecorationVoids(stampedField.decoField, bound, config), stampTranslations, decorationCellFrames ?? []),
      stampTranslations,
    }
    // Curve reads: curvesEnabled/flatten → config.figures + config.smoothTransitions.
    // qx/qy/vw/vh are captured via nonFastBoundSig (frameless bound only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonFastBoundSig, stampedField, frameFieldBox, ed?.frame, decorationCellFrames, config.figures, config.smoothTransitions])

  // Non-fast-path Strands hit data — strand chaining + per-strand identity
  // keys over the rendered field. Field-keyed so paints and hover reuse it;
  // gated on the Strands target so Voids-mode users don't pay the chaining.
  const nonFastStrandHits = useMemo<StrandHit[] | null>(() => {
    if (!decorationActive || decorationPaintTarget !== 'strands' || !stampedField || stampedField.fastPath || !editorBase) return null
    // Hit-test the EXTRACTION field, not the frame-filtered rendered field.
    // With a Frame the rendered field stops where a tile's centre leaves the
    // outline (the completion gap), but the Void fills extract from the FULL
    // field and paint out to the frame edge — so the user sees strand strips
    // (the gaps between fills) in the border band with no hit target under
    // them: border strands were unclickable and unpaintable. Frameless,
    // `decoField === segments` and nothing changes.
    const segments = stampedField.decoField
    // Signatures from the BASE fragment's chains, not the stamped field's —
    // stamped-field chains merge across stamps and truncate at the Frame, so
    // their congruent signatures are frame-dependent and near-frame strands
    // fall out of the painted class ("strand strokes drop out at the Frame").
    // Matches the periodic fast-path's `baseStrandIds` keying, so paints
    // survive toggling a Frame / vertex lines on and off.
    const ids = strandIdentitiesFromBase(segments, editorBase.baseSegments, stampedField.stamps)
    const stampTranslations = stampedField.stamps.map(s => s.translation)
    const frames = decorationCellFrames ?? []
    // Per-strand keys, hoisted OUT of the segment loop. cellOrbitKey
    // canonicalises a strand's whole point chain over every dihedral
    // image — doing that per SEGMENT (a strand has many) froze the tab
    // on dense fields the moment the Strands target was selected.
    const offsets = ids.strands.map(s => orbitOffset(s.centroid, stampTranslations))
    const patchKeys = ids.strands.map((s, i) => scopedKey(s.signature, offsets[i]))
    const cellKeys = ids.strands.map((s, i) => cellOrbitKey(
      s.signature,
      reduceToOrbit(ids.strandData[i].points, s.centroid, offsets[i]),
      s.closed,
      offsets[i],
      frames,
    ))
    // Curved strokes bow away from their straight chord — hit-test (and
    // hover-highlight) against the flattened rendered polyline instead, or
    // the bulge is a dead pick zone (at a Frame border the clip can leave
    // ONLY the bulge visible, making the stroke unclickable).
    const polys = curvesEnabled(config)
      ? flattenSegmentPolylines(segments, ids.strandData, config)
      : null
    const hits: StrandHit[] = []
    for (let i = 0; i < segments.length; i++) {
      const strandIdx = ids.strandOfSegment[i]
      if (strandIdx < 0) continue
      hits.push({
        from: segments[i].from,
        to: segments[i].to,
        poly: polys?.[i] ?? undefined,
        strandId: strandIdx,
        // Per-SEGMENT effective congruent signature — a chain spans multiple
        // base classes in multi-class fields (vertex lines / extra sets) and
        // border chains' majorities are frame-dependent, so keying the chain
        // majority made congruent paint miss border strands.
        signature: ids.segmentSignatures[i],
        patchKey: patchKeys[strandIdx],
        cellKey: cellKeys[strandIdx],
      })
    }
    return hits
    // Curve reads: curvesEnabled/flattenSegmentPolylines → config.figures +
    // config.smoothTransitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decorationActive, decorationPaintTarget, stampedField, editorBase, decorationCellFrames, config.figures, config.smoothTransitions])

  return useMemo(() => {
    // Step 17 Builder: when a Patch is active, render its Tiles directly.
    // Design Phase = single Patch; Composition Phase = lattice-stamped across
    // the viewport so the user sees how Strands flow across boundaries.
    if (config.tiling.type === 'editor' && config.editor && editorBase) {
      // `patch` must be the LIVE editor config: `editorBase.patch` is a
      // geometry-time snapshot whose `frame` / `decoration` go stale across
      // paints and frame edits (editorBase deliberately doesn't re-key on them).
      const patch = config.editor
      const { multiCell, cell, basePolys } = editorBase
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
        // Guide-scoped world-space Tiles (slice 3) join the live Patch's own
        // Tiles: rendered in the Tile layer and fed to PIC so their Strands
        // emerge immediately after a free-standing Complete. They don't ghost
        // (world-space one-offs) and force a fresh PIC run since the base run
        // is Guide-tile-free.
        const guidePolys = patch.guideTiles?.length ? tilesToPolygons(patch.guideTiles) : []
        const localPolys = guidePolys.length ? [...basePolys, ...guidePolys] : basePolys
        // Strands flow across stamp boundaries when the user opts in by
        // including ghost polygons in the PIC input. Otherwise PIC runs on
        // the centre patch only and strands stop at the boundary.
        const ghostsInPic = !!(editorNeighbourPreview && editorNeighbourStrands && ghostPolygons)
        const picInput = ghostsInPic && ghostPolygons
          ? [...localPolys, ...ghostPolygons]
          : localPolys
        // Reuse the viewport-independent base PIC run when no ghosts / Guide
        // Tiles feed it (Finding 2). The ghost or Guide-tile case needs a fresh
        // PIC over the augmented input.
        const tPic = performance.now()
        const segments = (ghostsInPic || guidePolys.length) ? runPIC(picInput, config) : editorBase.baseSegments
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
          polygons: localPolys,
          segments,
          boundaryOutlines,
          ghostPolygons,
          neighbourStamps: ringStamps,
          seedOutlineCount: baseOutlines.length,
          ghostPolygonIds,
        }
      }
      // Composition Phase — the stamped field (lattice stamps + polygons +
      // PIC) comes from the geometry-keyed `stampedField` memo above so
      // Decoration paints reuse it.
      if (!stampedField) return { polygons: [], segments: [] }
      const stamps = stampedField.stamps
      // Lever A (flagged): periodic fast-path. Tile ONE fundamental domain via
      // <use> instead of PIC-ing the whole stamped field every regeneration —
      // runPIC + buildStrands then run once on the base patch. Exact + seamless
      // only when (see periodicFastPathEligible): pure-translation stamps (no
      // rotation; tangents match at seams by lattice symmetry), no vertex-lines
      // (base PIC would miss stamp-boundary internal edges), no frame
      // (completedTiles don't repeat), no boundary-lattice overlay. Otherwise
      // fall through to the exact stamped path below.
      if (stampedField.fastPath) {
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
        // (PIC ran once on the base patch). Fills are the pan-independent
        // representative set (rendered inside the fragment ⇒ tiled by <use>).
        // The visible-field Voids for the Paint overlay's hit-testing are
        // extracted only while actually painting (target ≠ Off), by translating
        // the base segments — no re-PIC.
        if (decorationActive) {
          // Stage 2 — `instance`-scope fills are world-specific, so they can't
          // live inside the cloned fragment. Reconstruct each record's polygon
          // (rep polygon + the stamp translation its world centroid implies)
          // and return it world-space; PatternSVG sandwiches these between the
          // under-fragment and strand-fragment <use> stacks.
          let instanceVoidFills: VoidFill[] | undefined
          if (decorationFills && decorationFills.voidIndex.hasInstance) {
            instanceVoidFills = []
            for (const rec of decorationFills.voidIndex.instance) {
              for (const r of decorationFills.reps) {
                if (r.signature !== rec.signature) continue
                const t = { x: rec.x - r.centroid.x, y: rec.y - r.centroid.y }
                const st = stamps.find(s =>
                  Math.abs(s.translation.x - t.x) <= 0.06 && Math.abs(s.translation.y - t.y) <= 0.06)
                if (st) {
                  const tx = st.translation.x, ty = st.translation.y
                  // makeVoidFill re-derives the canonical pose off the
                  // translated straight outline, so a gradient record lands
                  // world-correct on the reconstructed instance.
                  instanceVoidFills.push(makeVoidFill(
                    r.polygon.map(p => ({ x: p.x + tx, y: p.y + ty })),
                    r.keyPolygon?.map(p => ({ x: p.x + tx, y: p.y + ty })),
                    rec,
                  ))
                  break
                }
              }
            }
          }
          // Paint overlay hit-targets: TILE the representative Voids / base Rays
          // across the visible stamps by translation — no per-pan extraction
          // (the old viewport extraction was the worst-ms spike). Strands need
          // tiling too, else hit-targets exist only at the base domain near the
          // origin and the bucket cursor never activates elsewhere.
          let decorationVoids: PaintVoid[] | undefined
          let decorationStrandHits: StrandHit[] | undefined
          if (decorationPaintActive && decorationFills) {
            const bx = genX + vw * pad, by = genY + vh * pad
            const m = Math.max(vw, vh) * 0.2
            const visible = stamps.filter(st =>
              !(st.translation.x < bx - m || st.translation.x > bx + vw + m
                || st.translation.y < by - m || st.translation.y > by + vh + m))
            if (decorationPaintTarget === 'voids') {
              decorationVoids = []
              for (const st of visible) {
                const tx = st.translation.x, ty = st.translation.y
                for (const r of decorationFills.reps) {
                  decorationVoids.push({
                    area: r.area,
                    signature: r.signature,
                    polygon: r.polygon.map(p => ({ x: p.x + tx, y: p.y + ty })),
                    patchKey: r.patchKey,
                    cellKey: r.cellKey,
                    instanceKey: scopedKey(r.signature, { x: r.centroid.x + tx, y: r.centroid.y + ty }),
                  })
                }
              }
            } else if (baseStrandIds) {
              decorationStrandHits = []
              const nStrands = baseStrandIds.strands.length
              // Flattened rendered polylines for curved base segments — the
              // hit-test must follow the bowed stroke, not its chord.
              const baseSegPolylines = curvesEnabled(config)
                ? flattenSegmentPolylines(editorBase.baseSegments, baseStrandIds.strandData, config)
                : null
              for (let si = 0; si < visible.length; si++) {
                const tx = visible[si].translation.x, ty = visible[si].translation.y
                for (let i = 0; i < editorBase.baseSegments.length; i++) {
                  const s = editorBase.baseSegments[i]
                  const strandIdx = baseStrandIds.strandOfSegment[i]
                  if (strandIdx < 0) continue
                  const bp = baseSegPolylines?.[i]
                  decorationStrandHits.push({
                    from: { x: s.from.x + tx, y: s.from.y + ty },
                    to: { x: s.to.x + tx, y: s.to.y + ty },
                    poly: bp ? bp.map(q => ({ x: q.x + tx, y: q.y + ty })) : undefined,
                    strandId: si * nStrands + strandIdx,
                    signature: baseStrandIds.strands[strandIdx].signature,
                    patchKey: baseStrandIds.patchKeys[strandIdx],
                    cellKey: baseStrandIds.cellKeys[strandIdx],
                  })
                }
              }
            }
          }
          return {
            polygons: basePolys,
            segments: editorBase.baseSegments,
            compositionStamps: stamps,
            voidFills: decorationFills?.fills ?? [],
            instanceVoidFills,
            voidStamps: decorationFills?.stampPlacements,
            decorationVoids,
            decorationStrandHits,
            decorationOrbitStamps: decorationOrbitRing ?? undefined,
            decorationCellFrames: decorationCellFrames ?? undefined,
          }
        }
        return { polygons: basePolys, segments: editorBase.baseSegments, compositionStamps: stamps }
      }
      const { picPolygons, segments, boundaryOutlines } = stampedField
      // Step 19.3 — Decoration (non-periodic fall-back: frame / rotated
      // stamps / vertex-lines). Extraction + Void keying live in the
      // field-keyed `nonFastVoidData` memo above; strand hit data in
      // `nonFastStrandHits`. Everything is world-space, so all scope rungs
      // (incl. instance) resolve straight into `voidFills` — only this cheap
      // colouring pass re-runs on a paint or a Paint-target switch.
      // Both non-fast returns carry the base-identity source: painted strand
      // colours render in Composition AND Decoration, so StrandLayer must key
      // strands the same way on both.
      const strandIdentitySource = { baseSegments: editorBase.baseSegments, stamps: stampedField.stamps }
      if (decorationActive) {
        const keyed = nonFastVoidData?.keyed ?? []
        const stampTranslations = nonFastVoidData?.stampTranslations ?? stamps.map(s => s.translation)
        return {
          polygons: picPolygons,
          // Strands render from the same EXTRACTION field the Void fills come
          // from (the frame clip cuts them at the outline), so painted strand
          // colours cover the border band the fills already paint — matching
          // `nonFastStrandHits`. Frameless, `decoField === segments`.
          segments: stampedField.decoField,
          boundaryOutlines,
          voidFills: colourVoids(keyed, patch.decoration),
          voidStamps: resolveVoidStamps(keyed, patch.decoration?.voidStamps),
          decorationVoids: keyed,
          decorationStrandHits: nonFastStrandHits ?? undefined,
          decorationOrbitStamps: stampTranslations,
          decorationCellFrames: decorationCellFrames ?? [],
          strandIdentitySource,
        }
      }
      return { polygons: picPolygons, segments, boundaryOutlines, strandIdentitySource }
    }

    const def = TILINGS[config.tiling.type]
    if (!def) return { polygons: [], segments: [] }

    const viewport = { x: genX, y: genY, width: genW, height: genH }

    const polygons = def.category === 'rosette-patch'
      ? generateRosettePatch(def, viewport, config.tiling.scale)
      : generateTiling(def, viewport, config.tiling.scale)
    const segments = runPICForCategory(def.category, polygons, config)

    return { polygons, segments }
  }, [config, editorBase, stampedField, decorationFills, baseStrandIds, decorationOrbitRing, decorationCellFrames, nonFastVoidData, nonFastStrandHits, genX, genY, genW, genH, editorStrandMode, showBoundaryLattice, editorNeighbourPreview, editorNeighbourBoundaries, editorNeighbourStrands, editorFrame, decorationActive, decorationPaintActive, decorationPaintTarget])
}
