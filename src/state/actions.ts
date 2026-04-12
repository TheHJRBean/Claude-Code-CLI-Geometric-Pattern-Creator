import type { PatternConfig, FigureConfig, LacingConfig } from '../types/pattern'

export type Action =
  | { type: 'SET_TILING_TYPE'; payload: string }
  | { type: 'SET_SCALE'; payload: number }
  | { type: 'SET_CONTACT_ANGLE'; payload: { tileTypeId: string; angle: number } }
  | { type: 'SET_LINE_LENGTH'; payload: { tileTypeId: string; lineLength: number } }
  | { type: 'SET_AUTO_LINE_LENGTH'; payload: { tileTypeId: string; auto: boolean } }
  | { type: 'SET_SNAP_LINE_LENGTH'; payload: { tileTypeId: string; snap: boolean } }
  | { type: 'SET_FIGURE_TYPE'; payload: { tileTypeId: string; figureType: FigureConfig['type'] } }
  | { type: 'SET_ROSETTE_Q'; payload: { tileTypeId: string; q: number } }
  | { type: 'SET_LACING'; payload: Partial<LacingConfig> }
  | { type: 'SET_VERTEX_LINES_ENABLED'; payload: { tileTypeId: string; enabled: boolean } }
  | { type: 'SET_VERTEX_LINES_DECOUPLED'; payload: { tileTypeId: string; decoupled: boolean } }
  | { type: 'SET_VERTEX_CONTACT_ANGLE'; payload: { tileTypeId: string; angle: number } }
  | { type: 'SET_VERTEX_LINE_LENGTH'; payload: { tileTypeId: string; lineLength: number } }
  | { type: 'SET_VERTEX_AUTO_LINE_LENGTH'; payload: { tileTypeId: string; auto: boolean } }
  | { type: 'SET_CURVE_ENABLED'; payload: { tileTypeId: string; enabled: boolean } }
  | { type: 'SET_CURVE_POINT_COUNT'; payload: { tileTypeId: string; count: number } }
  | { type: 'SET_CURVE_POINT'; payload: { tileTypeId: string; index: number; point: Partial<{ position: number; offset: number }> } }
  | { type: 'SET_CURVE_ALTERNATING'; payload: { tileTypeId: string; alternating: boolean } }
  | { type: 'LOAD_CONFIG'; payload: PatternConfig }
