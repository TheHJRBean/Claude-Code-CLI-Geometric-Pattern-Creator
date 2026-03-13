import type { Vec2 } from '../utils/math'

export interface Polygon {
  id: string
  sides: number
  vertices: Vec2[]
  center: Vec2
}

export interface Edge {
  id: string
  a: Vec2
  b: Vec2
  /** IDs of the (up to 2) polygons that share this edge */
  polygonIds: string[]
}

export interface Ray {
  origin: Vec2
  dir: Vec2
  edgeId: string
  polygonId: string
}

export interface Segment {
  from: Vec2
  to: Vec2
  /** edge midpoint this segment starts from */
  edgeMidpoint: Vec2
  polygonId: string
}

export interface Strand {
  id: string
  points: Vec2[]
}

export interface LacedStrand extends Strand {
  /** indices into points[] where this strand crosses another (interior crossings) */
  crossingIndices: number[]
  /** over/under at each crossing index */
  lacingMap: Map<number, 'over' | 'under'>
}
