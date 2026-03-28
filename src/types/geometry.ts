import type { Vec2 } from '../utils/math'

export interface Polygon {
  id: string
  sides: number
  vertices: Vec2[]
  center: Vec2
}

export interface Segment {
  from: Vec2
  to: Vec2
  /** edge midpoint this segment starts from */
  edgeMidpoint: Vec2
  polygonId: string
}
