import type { PatternConfig } from '../types/pattern'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'

export function reducer(state: PatternConfig, action: Action): PatternConfig {
  switch (action.type) {
    case 'SET_TILING_TYPE': {
      const def = TILINGS[action.payload]
      if (!def) return state
      // Merge default figures for this tiling type
      const figures = { ...state.figures, ...(def.defaultConfig.figures ?? {}) }
      return {
        ...state,
        tiling: { ...state.tiling, type: action.payload },
        figures,
      }
    }
    case 'SET_SCALE':
      return { ...state, tiling: { ...state.tiling, scale: action.payload } }
    case 'SET_CONTACT_ANGLE': {
      const existing = state.figures[action.payload.sides] ?? { type: 'star', contactAngle: 60 }
      return {
        ...state,
        figures: {
          ...state.figures,
          [action.payload.sides]: { ...existing, contactAngle: action.payload.angle },
        },
      }
    }
    case 'SET_FIGURE_TYPE': {
      const existing = state.figures[action.payload.sides] ?? { type: 'star', contactAngle: 60 }
      return {
        ...state,
        figures: {
          ...state.figures,
          [action.payload.sides]: { ...existing, type: action.payload.figureType },
        },
      }
    }
    case 'SET_LACING':
      return { ...state, lacing: { ...state.lacing, ...action.payload } }
    case 'LOAD_CONFIG':
      return action.payload
    default:
      return state
  }
}

export { DEFAULT_CONFIG }
