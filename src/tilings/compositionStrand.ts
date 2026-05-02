import type { PatternConfig, CompositionConfig } from '../types/pattern'
import type { Polygon, Segment } from '../types/geometry'
import { runPIC } from '../pic/index'
import { isPairVerified } from './compositionVerifiedPairs'

export interface CompositionStrandResult {
  centreSegments: Segment[]
  backgroundSegments: Segment[]
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
 * Dispatches between hard-frame and (future) match-strand rendering based
 * on the requested boundary mode and the verified-pairs allow-list.
 *
 * Currently the allow-list is empty (see `compositionVerifiedPairs.ts`), so
 * every call falls back to 'frame' regardless of `cfg.boundary`. That is by
 * design — the strand-match path needs analytical proof per CS-1 before any
 * pair ships.
 */
export function runCompositionPIC(
  cfg: CompositionConfig,
  centrePolygons: Polygon[],
  backgroundPolygons: Polygon[],
  patternConfig: PatternConfig,
): CompositionStrandResult {
  const verified = isPairVerified(cfg.centre, cfg.background)
  const effectiveBoundary: 'match' | 'frame' =
    cfg.boundary === 'match' && verified ? 'match' : 'frame'

  if (effectiveBoundary === 'match') {
    // Future: per-pair stitching logic — for any pair added to the
    // verified allow-list we'd implement seam-aware strand generation here
    // (e.g. shared contact-vertex placement, joined trim across the seam).
    // No verified pairs exist yet, so this branch is unreachable in v1.
    return runFrameMode(centrePolygons, backgroundPolygons, patternConfig, 'match')
  }

  return runFrameMode(centrePolygons, backgroundPolygons, patternConfig, 'frame')
}

function runFrameMode(
  centrePolygons: Polygon[],
  backgroundPolygons: Polygon[],
  patternConfig: PatternConfig,
  effectiveBoundary: 'match' | 'frame',
): CompositionStrandResult {
  return {
    centreSegments: runPIC(centrePolygons, patternConfig),
    backgroundSegments: runPIC(backgroundPolygons, patternConfig),
    effectiveBoundary,
  }
}
