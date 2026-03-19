import type { PatternConfig, FigureConfig, LacingConfig } from '../types/pattern'

export type Action =
  | { type: 'SET_TILING_TYPE'; payload: string }
  | { type: 'SET_SCALE'; payload: number }
  | { type: 'SET_CONTACT_ANGLE'; payload: { sides: number; angle: number } }
  | { type: 'SET_LINE_LENGTH'; payload: { sides: number; lineLength: number } }
  | { type: 'SET_AUTO_LINE_LENGTH'; payload: { sides: number; auto: boolean } }
  | { type: 'SET_SNAP_LINE_LENGTH'; payload: { sides: number; snap: boolean } }
  | { type: 'SET_FIGURE_TYPE'; payload: { sides: number; figureType: FigureConfig['type'] } }
  | { type: 'SET_ROSETTE_Q'; payload: { sides: number; q: number } }
  | { type: 'SET_LACING'; payload: Partial<LacingConfig> }
  | { type: 'SET_VERTEX_LINES_ENABLED'; payload: { sides: number; enabled: boolean } }
  | { type: 'SET_VERTEX_LINES_DECOUPLED'; payload: { sides: number; decoupled: boolean } }
  | { type: 'SET_VERTEX_CONTACT_ANGLE'; payload: { sides: number; angle: number } }
  | { type: 'SET_VERTEX_LINE_LENGTH'; payload: { sides: number; lineLength: number } }
  | { type: 'SET_VERTEX_AUTO_LINE_LENGTH'; payload: { sides: number; auto: boolean } }
  | { type: 'LOAD_CONFIG'; payload: PatternConfig }
