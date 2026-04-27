import { useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import type { ViewTransform } from './usePanZoom'
import { TILINGS } from '../tilings/index'
import { generateTiling } from '../tilings/archimedean'
import { generateRosettePatch } from '../tilings/rosettePatch'
import { generateMandala, DEFAULT_MANDALA_CONFIG } from '../tilings/mandala'
import { runPIC } from '../pic/index'

export interface PatternData {
  polygons: Polygon[]
  segments: Segment[]
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

    let polygons
    if (def.category === 'mandala') {
      polygons = generateMandala(config.mandala ?? DEFAULT_MANDALA_CONFIG, config.tiling.scale)
    } else if (def.category === 'rosette-patch') {
      polygons = generateRosettePatch(def, viewport, config.tiling.scale)
    } else {
      polygons = generateTiling(def, viewport, config.tiling.scale)
    }
    const segments = runPIC(polygons, config)

    return { polygons, segments }
  }, [config, genX, genY, genW, genH])
}
