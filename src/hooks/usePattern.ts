import { useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import type { ViewTransform } from './usePanZoom'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { editorBoundaryVertices, editorTilesToPolygons } from '../editor/buildEditorPolygons'
import { editorLatticeStamps } from '../editor/lattice'
import { runPIC } from '../pic/index'

export interface PatternData {
  polygons: Polygon[]
  segments: Segment[]
  /** Editor-mode patch boundary outline (Step 17.2+). Undefined elsewhere. */
  boundaryOutline?: Vec2[]
}

export function usePattern(
  config: PatternConfig,
  viewTransform: ViewTransform,
  containerWidth: number,
  containerHeight: number,
  /** Step 17.6 — when true and an editor patch is active, stamp the patch on the boundary's translation lattice across the viewport. */
  editorStrandMode = false,
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
      const basePolys = editorTilesToPolygons(config.editor)
      if (!editorStrandMode) {
        const segments = runPIC(basePolys, config)
        const boundaryOutline = editorBoundaryVertices(config.editor)
        return { polygons: basePolys, segments, boundaryOutline }
      }
      // Strand mode — stamp on the lattice. Lacking a v1 lattice for
      // triangle (deferred to 17.6c), the helper returns a single stamp
      // and the user gets a one-patch preview.
      const stamps = editorLatticeStamps(config.editor, {
        x: genX, y: genY, width: genW, height: genH,
      })
      const polygons: typeof basePolys = []
      for (let s = 0; s < stamps.length; s++) {
        const stamp = stamps[s]
        for (const p of basePolys) {
          polygons.push({
            ...p,
            id: `${p.id}@${s}`,
            center: { x: p.center.x + stamp.translation.x, y: p.center.y + stamp.translation.y },
            vertices: p.vertices.map(v => ({ x: v.x + stamp.translation.x, y: v.y + stamp.translation.y })),
          })
        }
      }
      const segments = runPIC(polygons, config)
      // No boundary outline in strand mode — the lattice is the visual.
      return { polygons, segments }
    }

    const def = TILINGS[config.tiling.type]
    if (!def) return { polygons: [], segments: [] }

    const viewport = { x: genX, y: genY, width: genW, height: genH }

    const polygons = def.category === 'rosette-patch'
      ? generateRosettePatch(def, viewport, config.tiling.scale)
      : generateTiling(def, viewport, config.tiling.scale)
    const segments = runPIC(polygons, config)

    return { polygons, segments }
  }, [config, genX, genY, genW, genH, editorStrandMode])
}
