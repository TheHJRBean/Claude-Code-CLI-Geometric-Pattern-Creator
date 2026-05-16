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
import { activeCell } from '../editor/active'
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
        // Neighbour preview: single-Cell uses the per-Cell one-ring;
        // multi-cell uses the Configuration one-ring (8 surrounding cells via
        // the Configuration's translation basis, each carrying every Cell —
        // so for 4.8.8, every neighbour stamp brings 1 octagon + 1 square).
        if (editorNeighbourPreview) {
          const ringStamps = multiCell
            ? compositionOneRingStamps(patch)
            : editorOneRingNeighbourStamps(cell)
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
        const picInput = editorNeighbourPreview && editorNeighbourStrands && ghostPolygons
          ? [...basePolys, ...ghostPolygons]
          : basePolys
        const segments = runPIC(picInput, config)
        return { polygons: basePolys, segments, boundaryOutlines, ghostPolygons }
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
      const segments = runPIC(polygons, config)
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
