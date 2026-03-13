import type { PatternConfig, FigureConfig, LacingConfig } from '../types/pattern'

export type Action =
  | { type: 'SET_TILING_TYPE'; payload: string }
  | { type: 'SET_SCALE'; payload: number }
  | { type: 'SET_CONTACT_ANGLE'; payload: { sides: number; angle: number } }
  | { type: 'SET_FIGURE_TYPE'; payload: { sides: number; figureType: FigureConfig['type'] } }
  | { type: 'SET_LACING'; payload: Partial<LacingConfig> }
  | { type: 'LOAD_CONFIG'; payload: PatternConfig }
