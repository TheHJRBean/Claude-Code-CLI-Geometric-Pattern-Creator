import { useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { ViewTransform } from './usePanZoom'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { generateMandala, DEFAULT_MANDALA_CONFIG } from '../tilings/mandala'
import { runMandalaPIC } from '../tilings/mandalaStrand'
import { generateComposition, DEFAULT_COMPOSITION_CONFIG } from '../tilings/composition'
import { runCompositionPIC } from '../tilings/compositionStrand'
import { runPIC } from '../pic/index'

export interface CompositionRender {
  centrePolygons: Polygon[]
  centreSegments: Segment[]
  backgroundPolygons: Polygon[]
  backgroundSegments: Segment[]
  /**
   * Step 13 trivial-match: when present, renderer draws these once across
   * the whole viewport (no per-region clip) so strands span the seam.
   */
  unifiedSegments?: Segment[]
  regionPolygon: Polygon
  frameEnabled: boolean
  frameColor: string
  /** Boundary mode actually used for strand rendering (see compositionStrand.ts). */
  effectiveBoundary: 'match' | 'frame'
}

export interface PatternData {
  polygons: Polygon[]
  segments: Segment[]
  /** Set when the active tessellation is a composition; consumed by PatternSVG for clipPath rendering. */
  composition?: CompositionRender
}

export function usePattern(
  config: PatternConfig,
  viewTransform: ViewTransform,
  containerWidth: number,
  containerHeight: number,
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
    const def = TILINGS[config.tiling.type]
    if (!def) return { polygons: [], segments: [] }

    const viewport = { x: genX, y: genY, width: genW, height: genH }

    if (def.category === 'composition') {
      const cfg = config.composition ?? DEFAULT_COMPOSITION_CONFIG
      const { centrePolygons, backgroundPolygons, regionPolygon, unifiedPolygons } =
        generateComposition(cfg, viewport)
      const { centreSegments, backgroundSegments, unifiedSegments, effectiveBoundary } =
        runCompositionPIC(cfg, centrePolygons, backgroundPolygons, config)
      // Combined polygons/segments are used for non-clipped rendering paths
      // (e.g. export); the clipped per-region rendering reads `composition`.
      // For trivial-match pairs `centrePolygons === backgroundPolygons`
      // (shared reference), so dedup before flattening.
      const flatPolygons = unifiedPolygons ?? [...backgroundPolygons, ...centrePolygons]
      const flatSegments = unifiedSegments ?? [...backgroundSegments, ...centreSegments]
      return {
        polygons: flatPolygons,
        segments: flatSegments,
        composition: {
          centrePolygons,
          centreSegments,
          backgroundPolygons,
          backgroundSegments,
          unifiedSegments,
          regionPolygon,
          frameEnabled: cfg.frameEnabled,
          frameColor: cfg.frameColor,
          effectiveBoundary,
        },
      }
    }

    let polygons
    if (def.category === 'mandala') {
      const mandala = config.mandala ?? DEFAULT_MANDALA_CONFIG
      polygons = generateMandala(mandala, config.tiling.scale)
      // Mandala uses the per-layer specialised renderer so each ring gets
      // its own contact angle independent of the global figures map.
      const segments = runMandalaPIC(polygons, mandala, config)
      return { polygons, segments }
    } else if (def.category === 'rosette-patch') {
      polygons = generateRosettePatch(def, viewport, config.tiling.scale)
    } else {
      polygons = generateTiling(def, viewport, config.tiling.scale)
    }
    const segments = runPIC(polygons, config)

    return { polygons, segments }
  }, [config, genX, genY, genW, genH])
}
