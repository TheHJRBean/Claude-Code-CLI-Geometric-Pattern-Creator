import type { CurvePoint, FigureConfig, PatternConfig } from '../types/pattern'
import type { EditorConfig } from '../types/editor'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig, createOriginTile, DEFAULT_BOUNDARY_SIZE_BY_SHAPE } from '../editor/createDefault'
import { computeExposedEdges } from '../editor/exposedEdges'
import { isPlacementViable, placeRegularNGonOnEdge } from '../editor/placement'

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
    case 'LOAD_CONFIG':
      return action.payload
    case 'EDITOR_NEW':
      return {
        ...state,
        tiling: { ...state.tiling, type: 'editor' },
        editor: createDefaultEditorConfig(),
      }
    case 'EDITOR_CLEAR': {
      const { editor: _drop, ...rest } = state
      void _drop
      return { ...rest, tiling: { ...state.tiling, type: '' } }
    }
    case 'SET_EDITOR_BOUNDARY_SHAPE': {
      if (!state.editor) return state
      // Boundary shape determines the orbit symmetry; placed/completed tiles
      // computed under the previous orbit are no longer valid. Reset to the
      // origin tile only and snap the boundary size to the new shape's
      // default so triangle/square/hexagon read at a comparable visual scale.
      const next: EditorConfig = {
        ...state.editor,
        boundaryShape: action.payload,
        boundarySize: DEFAULT_BOUNDARY_SIZE_BY_SHAPE[action.payload],
        tiles: [createOriginTile(state.editor.originSides, state.editor.edgeLength)],
      }
      return { ...state, editor: next }
    }
    case 'SET_EDITOR_BOUNDARY_SIZE':
      // Q9 Option B: only the boundary outline rescales — tiles untouched.
      return updateEditor(state, { boundarySize: action.payload })
    case 'SET_EDITOR_ORIGIN_SIDES': {
      if (!state.editor) return state
      const sides = Math.max(3, Math.floor(action.payload))
      // Changing origin sides invalidates any placed/completed tiles built on
      // the previous origin's edges. Reset to the new origin tile only.
      const next: EditorConfig = {
        ...state.editor,
        originSides: sides,
        tiles: [createOriginTile(sides, state.editor.edgeLength)],
      }
      return { ...state, editor: next }
    }
    case 'EDITOR_PLACE_TILE_ON_EDGE': {
      if (!state.editor) return state
      const { tileId, edgeIndex, sides } = action.payload
      const edges = computeExposedEdges(state.editor)
      const edge = edges.find(e => e.tileId === tileId && e.edgeIndex === edgeIndex)
      if (!edge || !isPlacementViable(edge, sides, state.editor)) return state
      const id = `placed-${state.editor.tiles.length}-${Date.now()}`
      const tile = placeRegularNGonOnEdge(sides, state.editor.edgeLength, edge.p1, edge.p2, edge.sourceCenter, id)
      return { ...state, editor: { ...state.editor, tiles: [...state.editor.tiles, tile] } }
    }
    case 'EDITOR_DELETE_TILE': {
      if (!state.editor) return state
      const { tileId } = action.payload
      const target = state.editor.tiles.find(t => t.id === tileId)
      // The auto-placed origin can't be deleted — it anchors the patch.
      if (!target || target.origin === 'origin') return state
      return {
        ...state,
        editor: { ...state.editor, tiles: state.editor.tiles.filter(t => t.id !== tileId) },
      }
    }
    default:
      return state
  }
}

/** Patch `EditorConfig` if active; no-op otherwise. */
function updateEditor(state: PatternConfig, patch: Partial<EditorConfig>): PatternConfig {
  if (!state.editor) return state
  return { ...state, editor: { ...state.editor, ...patch } }
}

export { DEFAULT_CONFIG }
