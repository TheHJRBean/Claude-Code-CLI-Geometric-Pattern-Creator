import type { PatternConfig, CompositionConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import { runPIC } from '../pic/index'
import {
  effectiveCompositionBoundary,
  isTrivialMatchPair,
} from './compositionVerifiedPairs'

export interface CompositionStrandResult {
  centreSegments: Segment[]
  backgroundSegments: Segment[]
  /**
   * Step 13 trivial-match path. When set, the renderer should draw these
   * segments once across the whole viewport WITHOUT per-region clipping —
   * the strand network spans the seam continuously. `centreSegments` and
   * `backgroundSegments` are then empty.
   */
  unifiedSegments?: Segment[]
  /**
   * The mode actually used. Echoes the requested mode unless the requested
   * mode was 'match' and the pair was unverified, in which case the
   * renderer silently falls back to 'frame'.
   */
  effectiveBoundary: 'match' | 'frame'
}

/**
 * Step 13 — Composition strand renderer.
 *
 * Dispatches between hard-frame and match-strand rendering based on the
 * requested boundary mode and the verified-pairs allow-list.
 *
 * Match path (v1): only **trivial pairs** (centre === background, verified)
 * are implemented. `composition.ts` generates a single unified tessellation
 * across the full viewport for these pairs; we run PIC once over that set
 * and return its segments via `unifiedSegments`. The seam is structurally
 * invisible because both sides use the same polygons.
 *
 * Future non-trivial verified pairs will dispatch on the pair key into a
 * per-pair stitching branch here. None exist yet.
 */
export function runCompositionPIC(
  cfg: CompositionConfig,
  centrePolygons: Polygon[],
  backgroundPolygons: Polygon[],
  patternConfig: PatternConfig,
): CompositionStrandResult {
  const effectiveBoundary = effectiveCompositionBoundary(cfg)

  if (effectiveBoundary === 'match') {
    if (isTrivialMatchPair(cfg.centre, cfg.background)) {
      // composition.ts has already pointed centrePolygons + backgroundPolygons
      // at the same unified set, so picking either produces the unified pass.
      const unifiedSegments = runPIC(backgroundPolygons, patternConfig)
      return {
        centreSegments: [],
        backgroundSegments: [],
        unifiedSegments,
        effectiveBoundary: 'match',
      }
    }
    // Non-trivial verified pair branch — none implemented yet. Falls through
    // to frame mode below. (Unreachable today: the verified-pairs allow-list
    // contains only trivial pairs, so effectiveBoundary === 'match' implies
    // isTrivialMatchPair() === true.)
  }

  return runFrameMode(centrePolygons, backgroundPolygons, patternConfig)
}

function runFrameMode(
  centrePolygons: Polygon[],
  backgroundPolygons: Polygon[],
  patternConfig: PatternConfig,
): CompositionStrandResult {
  return {
    centreSegments: runPIC(centrePolygons, patternConfig),
    backgroundSegments: runPIC(backgroundPolygons, patternConfig),
    effectiveBoundary: 'frame',
  }
}
