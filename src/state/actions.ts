import type { PatternConfig, FigureConfig, LacingConfig } from '../types/pattern'

export type Action =
  | { type: 'SET_TILING_TYPE'; payload: string }
  | { type: 'SET_SCALE'; payload: number }
  | { type: 'SET_CONTACT_ANGLE'; payload: { sides: number; angle: number } }
  | { type: 'SET_LINE_LENGTH'; payload: { sides: number; lineLength: number } }
  | { type: 'SET_AUTO_LINE_LENGTH'; payload: { sides: number; auto: boolean } }
  | { type: 'SET_FIGURE_TYPE'; payload: { sides: number; figureType: FigureConfig['type'] } }
  | { type: 'SET_ROSETTE_Q'; payload: { sides: number; q: number } }
  | { type: 'SET_LACING'; payload: Partial<LacingConfig> }
  | { type: 'LOAD_CONFIG'; payload: PatternConfig }
