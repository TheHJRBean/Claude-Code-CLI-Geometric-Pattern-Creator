import { useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import type { ViewTransform } from './usePanZoom'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { editorBoundaryVertices, editorTilesToPolygons } from '../editor/buildEditorPolygons'
import { editorLatticeStamps, editorOneRingNeighbourStamps } from '../editor/lattice'
import {
  compositionBoundaryOutlines,
  compositionLatticeStamps,
  compositionOneRingStamps,
  compositionToPolygons,
} from '../editor/compositionLattice'
import { runPIC } from '../pic/index'

export interface PatternData {
  polygons: Polygon[]
  segments: Segment[]
  /**
   * Editor-mode patch boundary outlines (Step 17.2+).
   * - Design mode: a single outline (the patch boundary).
   * - Strand mode + `showBoundaryLattice`: one outline per lattice stamp.
   * - Otherwise: undefined.
   */
  boundaryOutlines?: Vec2[][]
  /**
   * Step 17.6d — Design-mode neighbour preview. Polygons stamped at the
   * one-ring lattice offsets around the patch, drawn at low opacity so the
   * user can see how their patch joins its neighbours. Excluded from PIC.
   */
  ghostPolygons?: Polygon[]
}

export function usePattern(
  config: PatternConfig,
  viewTransform: ViewTransform,
  containerWidth: number,
  containerHeight: number,
  /** Step 17.6 — when true and an editor patch is active, stamp the patch on the boundary's translation lattice across the viewport. */
  editorStrandMode = false,
  /** Step 17.6 — when true in strand mode, also draw the patch boundary outline at every lattice stamp. */
  showBoundaryLattice = false,
  /** Step 17.6d — Design-mode neighbour preview. Ignored in strand mode. */
  editorNeighbourPreview = false,
  /** Step 17.6d — Design-mode neighbour preview: also draw the boundary outline at each neighbour stamp. */
  editorNeighbourBoundaries = false,
  /** Step 17.6d — Design-mode neighbour preview: include ghosts in the PIC input so strands flow across boundaries. */
  editorNeighbourStrands = false,
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
    // Step 17 editor: when the patch is active, render its tiles directly.
    // Design mode = single patch; Strand mode = lattice-stamped across the
    // viewport so the user sees how strands flow across boundaries.
    if (config.tiling.type === 'editor' && config.editor) {
      const composition = config.editor.composition
      const basePolys = composition
        ? compositionToPolygons(composition)
        : editorTilesToPolygons(config.editor)
      if (!editorStrandMode) {
        const baseOutlines: Vec2[][] = composition
          ? compositionBoundaryOutlines(composition)
          : [editorBoundaryVertices(config.editor)]
        let ghostPolygons: typeof basePolys | undefined
        let boundaryOutlines: Vec2[][] = [...baseOutlines]
        // Neighbour preview: single-shape uses the per-patch one-ring;
        // composition uses the cell-level one-ring (8 surrounding cells via
        // the composition's translation basis, each carrying every boundary
        // tile in the cell — so for 4.8.8, every neighbour stamp brings 1
        // octagon + 1 square along).
        if (editorNeighbourPreview) {
          const ringStamps = composition
            ? compositionOneRingStamps(composition)
            : editorOneRingNeighbourStamps(config.editor)
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
                // Composition emits one outline per boundary tile per stamp
                // (octagon + square × N); single-shape emits one per stamp.
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
        const picInput = editorNeighbourPreview && editorNeighbourStrands && ghostPolygons
          ? [...basePolys, ...ghostPolygons]
          : basePolys
        const segments = runPIC(picInput, config)
        return { polygons: basePolys, segments, boundaryOutlines, ghostPolygons }
      }
      // Strand mode — stamp on the lattice. Single-shape patches use the
      // per-patch lattice (triangle has 2 intra-stamps, square/hex have 1);
      // composition patches use the cell-level lattice (the unit cell is
      // already merged in basePolys via compositionToPolygons).
      const stamps = composition
        ? compositionLatticeStamps(composition, { x: genX, y: genY, width: genW, height: genH })
        : editorLatticeStamps(config.editor, { x: genX, y: genY, width: genW, height: genH })
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
      const segments = runPIC(polygons, config)
      // Boundary outlines are opt-in in strand mode (showBoundaryLattice).
      // Composition emits one outline per boundary tile per stamp (octagon +
      // square × N stamps); single-shape emits one outline per stamp.
      let boundaryOutlines: Vec2[][] | undefined
      if (showBoundaryLattice) {
        const baseOutlines: Vec2[][] = composition
          ? compositionBoundaryOutlines(composition)
          : [editorBoundaryVertices(config.editor)]
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
      return { polygons, segments, boundaryOutlines }
    }

    const def = TILINGS[config.tiling.type]
    if (!def) return { polygons: [], segments: [] }

    const viewport = { x: genX, y: genY, width: genW, height: genH }

    const polygons = def.category === 'rosette-patch'
      ? generateRosettePatch(def, viewport, config.tiling.scale)
      : generateTiling(def, viewport, config.tiling.scale)
    const segments = runPIC(polygons, config)

    return { polygons, segments }
  }, [config, genX, genY, genW, genH, editorStrandMode, showBoundaryLattice, editorNeighbourPreview, editorNeighbourBoundaries, editorNeighbourStrands])
}
