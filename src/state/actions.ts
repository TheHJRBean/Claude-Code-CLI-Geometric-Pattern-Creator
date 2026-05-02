import type { PatternConfig, FigureConfig, LacingConfig, MandalaConfig, MandalaLayer, CompositionConfig } from '../types/pattern'

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
  | { type: 'SET_EDGE_LINES_ENABLED'; payload: { tileTypeId: string; enabled: boolean } }
  | { type: 'SET_VERTEX_LINES_ENABLED'; payload: { tileTypeId: string; enabled: boolean } }
  | { type: 'SET_VERTEX_LINES_DECOUPLED'; payload: { tileTypeId: string; decoupled: boolean } }
  | { type: 'SET_VERTEX_CONTACT_ANGLE'; payload: { tileTypeId: string; angle: number } }
  | { type: 'SET_VERTEX_LINE_LENGTH'; payload: { tileTypeId: string; lineLength: number } }
  | { type: 'SET_VERTEX_AUTO_LINE_LENGTH'; payload: { tileTypeId: string; auto: boolean } }
  | { type: 'SET_CURVE_ENABLED'; payload: { tileTypeId: string; enabled: boolean } }
  | { type: 'SET_CURVE_POINT_COUNT'; payload: { tileTypeId: string; count: number } }
  | { type: 'SET_CURVE_POINT'; payload: { tileTypeId: string; index: number; point: Partial<{ position: number; offset: number }> } }
  | { type: 'SET_CURVE_ALTERNATING'; payload: { tileTypeId: string; alternating: boolean } }
  | { type: 'SET_CURVE_DIRECTION'; payload: { tileTypeId: string; direction: 'left' | 'right' } }
  | { type: 'SET_SMOOTH_TRANSITIONS'; payload: boolean }
  | { type: 'SET_MANDALA_CONFIG'; payload: MandalaConfig }
  | { type: 'SET_MANDALA_OUTER_FOLD'; payload: number }
  | { type: 'ADD_MANDALA_LAYER'; payload: MandalaLayer }
  | { type: 'REMOVE_MANDALA_LAYER'; payload: { index: number } }
  | { type: 'SET_MANDALA_LAYER_FOLD'; payload: { index: number; fold: number } }
  | { type: 'SET_MANDALA_LAYER_SCALE'; payload: { index: number; scale: number } }
  | { type: 'SET_MANDALA_LAYER_ROTATION_STEP'; payload: { index: number; step: number } }
  | { type: 'SET_MANDALA_LAYER_CONTACT_ANGLE'; payload: { index: number; angle: number } }
  | { type: 'SET_MANDALA_OUTER_CONTACT_ANGLE'; payload: number }
  | { type: 'SET_COMPOSITION_CONFIG'; payload: CompositionConfig }
  | { type: 'SET_COMPOSITION_CENTRE'; payload: string }
  | { type: 'SET_COMPOSITION_BACKGROUND'; payload: string }
  | { type: 'SET_COMPOSITION_CENTRE_SCALE'; payload: number }
  | { type: 'SET_COMPOSITION_BACKGROUND_SCALE'; payload: number }
  | { type: 'SET_COMPOSITION_REGION_RADIUS'; payload: number }
  | { type: 'SET_COMPOSITION_FRAME_ENABLED'; payload: boolean }
  | { type: 'SET_COMPOSITION_FRAME_COLOR'; payload: string }
  | { type: 'SET_COMPOSITION_BOUNDARY'; payload: 'match' | 'frame' }
  | { type: 'SET_COMPOSITION_SHOW_ALL_BACKGROUNDS'; payload: boolean }
  | { type: 'LOAD_CONFIG'; payload: PatternConfig }
