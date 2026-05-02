import type { CompositionConfig, CurvePoint, FigureConfig, PatternConfig, MandalaConfig } from '../types/pattern'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'
import { DEFAULT_MANDALA_CONFIG, isLayerFoldValid } from '../tilings/mandala'
import { DEFAULT_COMPOSITION_CONFIG } from '../tilings/composition'

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
      const next: PatternConfig = {
        ...state,
        tiling: { ...state.tiling, type: action.payload },
        figures: { ...state.figures, ...(def.defaultConfig.figures ?? {}) },
      }
      if (def.category === 'mandala' && !next.mandala) {
        next.mandala = DEFAULT_MANDALA_CONFIG
        // Mandala uses scale as outer-ring radius. The default 100 px
        // looks tiny against a full canvas; bump to a comfortable default
        // the first time the user enters mandala mode.
        next.tiling = { ...next.tiling, scale: 250 }
      }
      if (def.category === 'composition' && !next.composition) {
        next.composition = DEFAULT_COMPOSITION_CONFIG
        // Seed figures so both the centre's and background's tile types
        // have sensible defaults. Centre's defaults take priority on key
        // collisions (the centre is the focal point of a composition).
        const centreDef = TILINGS[DEFAULT_COMPOSITION_CONFIG.centre]
        const backgroundDef = TILINGS[DEFAULT_COMPOSITION_CONFIG.background]
        next.figures = {
          ...next.figures,
          ...(backgroundDef?.defaultConfig.figures ?? {}),
          ...(centreDef?.defaultConfig.figures ?? {}),
        }
      }
      return next
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
    case 'SET_EDGE_LINES_ENABLED': {
      const patch: Partial<FigureConfig> = { edgeLinesEnabled: action.payload.enabled }
      if (!action.payload.enabled) patch.vertexLinesEnabled = true
      return updateFigure(state, action.payload.tileTypeId, patch)
    }
    case 'SET_VERTEX_LINES_ENABLED': {
      const patch: Partial<FigureConfig> = { vertexLinesEnabled: action.payload.enabled }
      if (!action.payload.enabled) patch.edgeLinesEnabled = true
      return updateFigure(state, action.payload.tileTypeId, patch)
    }
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
    case 'SET_CURVE_ENABLED': {
      const fig = getFigure(state, action.payload.tileTypeId)
      const curve = fig.curve ?? { enabled: false, points: [{ position: 0.5, offset: 0.2 }] }
      return updateFigure(state, action.payload.tileTypeId, {
        curve: { ...curve, enabled: action.payload.enabled },
      })
    }
    case 'SET_CURVE_POINT_COUNT': {
      const fig = getFigure(state, action.payload.tileTypeId)
      const curve = fig.curve ?? { enabled: true, points: [{ position: 0.5, offset: 0.2 }] }
      const count = Math.max(1, Math.min(3, action.payload.count))
      const existing = curve.points
      const points: CurvePoint[] = []
      for (let i = 0; i < count; i++) {
        points.push(existing[i] ?? { position: (i + 1) / (count + 1), offset: 0.2 })
      }
      return updateFigure(state, action.payload.tileTypeId, {
        curve: { ...curve, points },
      })
    }
    case 'SET_CURVE_POINT': {
      const { tileTypeId, index, point } = action.payload
      const fig = getFigure(state, tileTypeId)
      const curve = fig.curve ?? { enabled: true, points: [{ position: 0.5, offset: 0.2 }] }
      const points = curve.points.map((p, i) =>
        i === index ? { ...p, ...point } : p,
      )
      return updateFigure(state, tileTypeId, { curve: { ...curve, points } })
    }
    case 'SET_CURVE_ALTERNATING': {
      const fig = getFigure(state, action.payload.tileTypeId)
      const curve = fig.curve ?? { enabled: true, points: [{ position: 0.5, offset: 0.2 }] }
      return updateFigure(state, action.payload.tileTypeId, {
        curve: { ...curve, alternating: action.payload.alternating },
      })
    }
    case 'SET_CURVE_DIRECTION': {
      const fig = getFigure(state, action.payload.tileTypeId)
      const curve = fig.curve ?? { enabled: true, points: [{ position: 0.5, offset: 0.2 }] }
      return updateFigure(state, action.payload.tileTypeId, {
        curve: { ...curve, direction: action.payload.direction },
      })
    }
    case 'SET_SMOOTH_TRANSITIONS':
      return { ...state, smoothTransitions: action.payload }
    case 'SET_MANDALA_CONFIG':
      return { ...state, mandala: action.payload }
    case 'SET_MANDALA_OUTER_FOLD': {
      const next = action.payload
      const current: MandalaConfig = state.mandala ?? DEFAULT_MANDALA_CONFIG
      // Drop layers that no longer satisfy strict-divisor under the new outer
      const layers = current.layers.filter(l => isLayerFoldValid(next, l.fold))
      return { ...state, mandala: { outerFold: next, layers } }
    }
    case 'ADD_MANDALA_LAYER': {
      const current: MandalaConfig = state.mandala ?? DEFAULT_MANDALA_CONFIG
      // Reject silently if the proposed layer breaks strict-divisor
      if (!isLayerFoldValid(current.outerFold, action.payload.fold)) return state
      return { ...state, mandala: { ...current, layers: [...current.layers, action.payload] } }
    }
    case 'REMOVE_MANDALA_LAYER': {
      const current: MandalaConfig = state.mandala ?? DEFAULT_MANDALA_CONFIG
      const layers = current.layers.filter((_, i) => i !== action.payload.index)
      return { ...state, mandala: { ...current, layers } }
    }
    case 'SET_MANDALA_LAYER_FOLD': {
      const current: MandalaConfig = state.mandala ?? DEFAULT_MANDALA_CONFIG
      if (!isLayerFoldValid(current.outerFold, action.payload.fold)) return state
      const layers = current.layers.map((l, i) =>
        i === action.payload.index ? { ...l, fold: action.payload.fold } : l)
      return { ...state, mandala: { ...current, layers } }
    }
    case 'SET_MANDALA_LAYER_SCALE': {
      const current: MandalaConfig = state.mandala ?? DEFAULT_MANDALA_CONFIG
      const scale = Math.max(0.05, Math.min(1, action.payload.scale))
      const layers = current.layers.map((l, i) =>
        i === action.payload.index ? { ...l, scale } : l)
      return { ...state, mandala: { ...current, layers } }
    }
    case 'SET_MANDALA_LAYER_ROTATION_STEP': {
      const current: MandalaConfig = state.mandala ?? DEFAULT_MANDALA_CONFIG
      const layers = current.layers.map((l, i) => {
        if (i !== action.payload.index) return l
        const mod = 2 * l.fold
        const step = ((action.payload.step % mod) + mod) % mod
        return { ...l, rotationStep: step }
      })
      return { ...state, mandala: { ...current, layers } }
    }
    case 'SET_MANDALA_LAYER_CONTACT_ANGLE': {
      const current: MandalaConfig = state.mandala ?? DEFAULT_MANDALA_CONFIG
      const angle = Math.max(10, Math.min(85, action.payload.angle))
      const layers = current.layers.map((l, i) =>
        i === action.payload.index ? { ...l, contactAngle: angle } : l)
      return { ...state, mandala: { ...current, layers } }
    }
    case 'SET_MANDALA_OUTER_CONTACT_ANGLE': {
      const current: MandalaConfig = state.mandala ?? DEFAULT_MANDALA_CONFIG
      const angle = Math.max(10, Math.min(85, action.payload))
      return { ...state, mandala: { ...current, outerContactAngle: angle } }
    }
    case 'SET_COMPOSITION_CONFIG':
      return { ...state, composition: action.payload }
    case 'SET_COMPOSITION_CENTRE': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      const centreDef = TILINGS[action.payload]
      const figures = centreDef?.defaultConfig.figures
        ? { ...state.figures, ...centreDef.defaultConfig.figures }
        : state.figures
      return { ...state, figures, composition: { ...current, centre: action.payload } }
    }
    case 'SET_COMPOSITION_BACKGROUND': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      const backgroundDef = TILINGS[action.payload]
      const figures = backgroundDef?.defaultConfig.figures
        ? { ...state.figures, ...backgroundDef.defaultConfig.figures }
        : state.figures
      return { ...state, figures, composition: { ...current, background: action.payload } }
    }
    case 'SET_COMPOSITION_CENTRE_SCALE': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      return { ...state, composition: { ...current, centreScale: Math.max(10, action.payload) } }
    }
    case 'SET_COMPOSITION_BACKGROUND_SCALE': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      return { ...state, composition: { ...current, backgroundScale: Math.max(10, action.payload) } }
    }
    case 'SET_COMPOSITION_REGION_RADIUS': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      return { ...state, composition: { ...current, regionRadius: Math.max(20, action.payload) } }
    }
    case 'SET_COMPOSITION_FRAME_ENABLED': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      return { ...state, composition: { ...current, frameEnabled: action.payload } }
    }
    case 'SET_COMPOSITION_FRAME_COLOR': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      return { ...state, composition: { ...current, frameColor: action.payload } }
    }
    case 'SET_COMPOSITION_BOUNDARY': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      return { ...state, composition: { ...current, boundary: action.payload } }
    }
    case 'SET_COMPOSITION_SHOW_ALL_BACKGROUNDS': {
      const current: CompositionConfig = state.composition ?? DEFAULT_COMPOSITION_CONFIG
      return { ...state, composition: { ...current, showAllBackgrounds: action.payload } }
    }
    case 'LOAD_CONFIG':
      return action.payload
    default:
      return state
  }
}

export { DEFAULT_CONFIG }
