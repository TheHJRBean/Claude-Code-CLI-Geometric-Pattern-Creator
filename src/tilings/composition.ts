import type { Polygon } from '../types/geometry'
import type { CompositionConfig } from '../types/pattern'
import { TILINGS } from './index'
import { generateTiling } from './archimedean'
import { generateRosettePatch } from './rosettePatch'
import { createPolygon, resetIds } from './shared'

/**
 * Names of tilings the composition picker is allowed to use as either centre
 * or background. Mandala / composition entries are excluded — centring a
 * composition inside another composition is out of v1 scope.
 */
export function compositionPickerNames(): string[] {
  return Object.values(TILINGS)
    .filter(d => d.category === 'archimedean' || d.category === 'rosette-patch')
    .map(d => d.name)
}

export const DEFAULT_COMPOSITION_CONFIG: CompositionConfig = {
  centre: 'hexadecagonal-rosette',
  background: '4.8.8',
  centreScale: 90,
  backgroundScale: 100,
  regionRadius: 280,
  frameEnabled: true,
  frameColor: 'var(--accent)',
}

export interface Viewport { x: number; y: number; width: number; height: number }

export interface CompositionData {
  /** Polygons of the central tessellation (will be clipped to the region). */
  centrePolygons: Polygon[]
  /** Polygons of the background tessellation (will be clipped to viewport ∖ region). */
  backgroundPolygons: Polygon[]
  /** Region polygon — used for clipPath geometry and frame rendering. */
  regionPolygon: Polygon
}

/**
 * Generate the polygon set for a composition: a central tessellation
 * patch surrounded by an infinite background tessellation. The central
 * region is a regular polygon centred at world origin whose fold matches
 * the centre tiling's fold-symmetry.
 */
export function generateComposition(
  cfg: CompositionConfig,
  viewport: Viewport,
): CompositionData {
  const centreDef = TILINGS[cfg.centre]
  const backgroundDef = TILINGS[cfg.background]
  if (!centreDef || !backgroundDef) {
    return {
      centrePolygons: [],
      backgroundPolygons: [],
      regionPolygon: createPolygon(4, { x: 0, y: 0 }, 1, 0),
    }
  }

  // Region polygon — centred at world origin. Fold = centre's fold-symmetry,
  // so the region naturally aligns with the centre tessellation's axes.
  // Flat-top orientation when the fold is divisible by 4 (matches mandala
  // convention so 16-gon / 8-gon centres sit nicely).
  resetIds()
  const regionFold = Math.max(3, centreDef.foldSymmetry || 8)
  const phi = regionFold % 4 === 0
    ? -Math.PI / 2 + Math.PI / regionFold
    : -Math.PI / 2
  const regionPolygon = createPolygon(
    regionFold,
    { x: 0, y: 0 },
    cfg.regionRadius,
    phi,
    `region-${regionFold}`,
  )

  // Centre tessellation — generate within a viewport that just covers the
  // region's bounding box. Slight padding so polygons that straddle the
  // boundary still get drawn (and then clipped visually by SVG).
  const r = cfg.regionRadius
  const centreViewport: Viewport = {
    x: -r * 1.2,
    y: -r * 1.2,
    width: r * 2.4,
    height: r * 2.4,
  }
  const centrePolygons = generateForCategory(centreDef, centreViewport, cfg.centreScale)

  // Background tessellation — fills the full viewport. SVG clipPath will
  // hide the inner portion.
  const backgroundPolygons = generateForCategory(backgroundDef, viewport, cfg.backgroundScale)

  return { centrePolygons, backgroundPolygons, regionPolygon }
}

function generateForCategory(
  def: typeof TILINGS[string],
  viewport: Viewport,
  scale: number,
): Polygon[] {
  if (def.category === 'rosette-patch') {
    return generateRosettePatch(def, viewport, scale)
  }
  return generateTiling(def, viewport, scale)
}
