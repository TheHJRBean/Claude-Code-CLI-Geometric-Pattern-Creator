import type { FigureConfig, PatternConfig } from '../types/pattern'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'

const FALLBACK_FIGURE: FigureConfig = { type: 'star', contactAngle: 60, lineLength: 1.0, autoLineLength: true }

/** Get the figure for a given tile type ID, or fall back to defaults. */
function getFigure(state: PatternConfig, tileTypeId: string): FigureConfig {
  return state.figures[tileTypeId] ?? FALLBACK_FIGURE
}

/** Return new state with a single figure field updated. */
function updateFigure(state: PatternConfig, tileTypeId: string, patch: Partial<FigureConfig>): PatternConfig {
  return {
    ...state,
    figures: {
      ...state.figures,
      [tileTypeId]: { ...getFigure(state, tileTypeId), ...patch },
    },
  }
}

export function reducer(state: PatternConfig, action: Action): PatternConfig {
  switch (action.type) {
    case 'SET_TILING_TYPE': {
      const def = TILINGS[action.payload]
      if (!def) return state
      return {
        ...state,
        tiling: { ...state.tiling, type: action.payload },
        figures: { ...state.figures, ...(def.defaultConfig.figures ?? {}) },
      }
    }
    case 'SET_SCALE':
      return { ...state, tiling: { ...state.tiling, scale: action.payload } }
    case 'SET_CONTACT_ANGLE':
      return updateFigure(state, action.payload.tileTypeId, { contactAngle: action.payload.angle })
    case 'SET_LINE_LENGTH':
      return updateFigure(state, action.payload.tileTypeId, { lineLength: action.payload.lineLength })
    case 'SET_AUTO_LINE_LENGTH':
      return updateFigure(state, action.payload.tileTypeId, { autoLineLength: action.payload.auto })
    case 'SET_SNAP_LINE_LENGTH':
      return updateFigure(state, action.payload.tileTypeId, { snapLineLength: action.payload.snap })
    case 'SET_FIGURE_TYPE':
      return updateFigure(state, action.payload.tileTypeId, { type: action.payload.figureType })
    case 'SET_ROSETTE_Q':
      return updateFigure(state, action.payload.tileTypeId, { rosetteQ: action.payload.q })
    case 'SET_LACING':
      return { ...state, lacing: { ...state.lacing, ...action.payload } }
    case 'SET_VERTEX_LINES_ENABLED':
      return updateFigure(state, action.payload.tileTypeId, { vertexLinesEnabled: action.payload.enabled })
    case 'SET_VERTEX_LINES_DECOUPLED': {
      const existing = getFigure(state, action.payload.tileTypeId)
      const decoupled = action.payload.decoupled
      return updateFigure(state, action.payload.tileTypeId, {
        vertexLinesDecoupled: decoupled,
        ...(decoupled ? {
          vertexContactAngle: existing.vertexContactAngle ?? existing.contactAngle,
          vertexLineLength: existing.vertexLineLength ?? existing.lineLength,
          vertexAutoLineLength: existing.vertexAutoLineLength ?? existing.autoLineLength,
        } : {}),
      })
    }
    case 'SET_VERTEX_CONTACT_ANGLE':
      return updateFigure(state, action.payload.tileTypeId, { vertexContactAngle: action.payload.angle })
    case 'SET_VERTEX_LINE_LENGTH':
      return updateFigure(state, action.payload.tileTypeId, { vertexLineLength: action.payload.lineLength })
    case 'SET_VERTEX_AUTO_LINE_LENGTH':
      return updateFigure(state, action.payload.tileTypeId, { vertexAutoLineLength: action.payload.auto })
    case 'LOAD_CONFIG':
      return action.payload
    default:
      return state
  }
}

export { DEFAULT_CONFIG }
