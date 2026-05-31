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
import { pointInPolygon } from '../utils/math'
import { runPIC } from '../pic/index'

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
  /** Step 17 Framing — when true, include the Frame's completion Tiles in the
   * PIC input so Strands flow out to the frame edge through them. */
  editorFraming = false,
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

  return useMemo(() => {
    // Step 17 Builder: when a Patch is active, render its Tiles directly.
    // Design Phase = single Patch; Composition Phase = lattice-stamped across
    // the viewport so the user sees how Strands flow across boundaries.
    if (config.tiling.type === 'editor' && config.editor) {
      const patch = config.editor
      const multiCell = patch.cells.length > 1
      const cell = activeCell(patch)
      const basePolys = multiCell
        ? compositionToPolygons(patch)
        : editorTilesToPolygons(cell)
      if (!editorStrandMode) {
        const baseOutlines: Vec2[][] = multiCell
          ? compositionBoundaryOutlines(patch)
          : [editorBoundaryVertices(cell)]
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
        const segments = runPIC(picInput, config)
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
      if (editorFraming && patch.frame) {
        const outline = frameOutlinePolygon(patch.frame)
        if (outline) {
          picPolygons = polygons.filter(p => pointInPolygon(p.center, outline))
          if (patch.frame.completedTiles?.length) {
            picPolygons = [...picPolygons, ...tilesToPolygons(patch.frame.completedTiles)]
          }
        }
      }
      const segments = runPIC(picPolygons, config)
      // Boundary outlines are opt-in in Composition Phase (showBoundaryLattice).
      // Multi-cell emits one outline per Cell per stamp (octagon + square × N
      // stamps); single-cell emits one outline per stamp.
      let boundaryOutlines: Vec2[][] | undefined
      if (showBoundaryLattice) {
        const baseOutlines: Vec2[][] = multiCell
          ? compositionBoundaryOutlines(patch)
          : [editorBoundaryVertices(cell)]
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
  }, [config, genX, genY, genW, genH, editorStrandMode, showBoundaryLattice, editorNeighbourPreview, editorNeighbourBoundaries, editorNeighbourStrands, editorFraming])
}
