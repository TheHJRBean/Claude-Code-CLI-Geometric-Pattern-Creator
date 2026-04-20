import type { Vec2 } from '../utils/math'

export interface Polygon {
  id: string
  sides: number
  /** Unique tile-type key for figure config lookup (e.g. "6", "6.1", "6.2") */
  tileTypeId: string
  vertices: Vec2[]
  center: Vec2
}

export type SegmentKind = 'star-arm' | 'petal' | 'vertex-line'

export type RaySide = 'plus' | 'minus'

export interface Segment {
  from: Vec2
  to: Vec2
  /** edge midpoint this segment starts from */
  edgeMidpoint: Vec2
  /** center of the polygon that owns this segment — used for consistent curve normal orientation */
  polygonCenter: Vec2
  polygonId: string
  /** tile type ID for per-polygon-type config lookup */
  tileTypeId: string
  /** what kind of segment this is — for selective curve application */
  kind: SegmentKind
  /** which ±α ray this segment originated from. Stable across regenerations; used for alternating-curve parity even when cross-product heuristic is degenerate (e.g. triangles at θ=60°). Petals don't have a side. */
  side?: RaySide
}
