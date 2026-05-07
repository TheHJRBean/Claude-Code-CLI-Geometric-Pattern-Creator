import type { CurvePoint, FigureConfig, PatternConfig } from '../types/pattern'
import type { EditorConfig } from '../types/editor'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'
import { createDefaultEditorConfig, createOriginTile, DEFAULT_BOUNDARY_SIZE_BY_SHAPE } from '../editor/createDefault'
import { computeExposedEdges } from '../editor/exposedEdges'
import { isPlacementViable, placeRegularNGonOnEdge } from '../editor/placement'
import { orbitTileIds, placeTilesOnOrbit } from '../editor/orbit'
import { completeGap } from '../editor/complete'
import { placePolygonsOnOrbit } from '../editor/orbit'
import { autoCompletePatch, fitBoundarySize } from '../editor/autoComplete'
import { seedFiguresForEditor } from '../editor/tileTypes'

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
    case 'EDITOR_NEW': {
      const editor = createDefaultEditorConfig()
      return seedFigures({
        ...state,
        tiling: { ...state.tiling, type: 'editor' },
        editor,
      })
    }
    case 'EDITOR_CLEAR': {
      const { editor: _drop, ...rest } = state
      void _drop
      return { ...rest, tiling: { ...state.tiling, type: '' } }
    }
    case 'SET_EDITOR_BOUNDARY_SHAPE': {
      if (!state.editor) return state
      // Tiles are preserved across boundary-shape changes — the orbit-
      // propagation rationale that originally cleared them no longer
      // applies (17.4 was archived, single-edge placements remain valid
      // under any boundary). Boundary size still snaps to the new shape's
      // default so triangle/square/hexagon read at a comparable visual scale.
      const next: EditorConfig = {
        ...state.editor,
        boundaryShape: action.payload,
        boundarySize: DEFAULT_BOUNDARY_SIZE_BY_SHAPE[action.payload],
      }
      return applyWrap(seedFigures({ ...state, editor: next }))
    }
    case 'SET_EDITOR_BOUNDARY_SIZE':
      // Q9 Option B: only the boundary outline rescales — tiles untouched.
      // Manual slider drag implies the user wants a specific size, so wrap
      // turns off.
      if (!state.editor) return state
      return updateEditor(state, { boundarySize: action.payload, wrapBoundary: false })
    case 'SET_EDITOR_ALTERNATE_BOUNDARY':
      // Pure visual flip: rotates the boundary outline (and its lattice basis
      // in strand mode) by π/n. Tile contents are untouched.
      return applyWrap(updateEditor(state, { alternateBoundary: action.payload }))
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
      return applyWrap(seedFigures({ ...state, editor: next }))
    }
    case 'EDITOR_PLACE_TILE_ON_EDGE': {
      if (!state.editor) return state
      const { tileId, edgeIndex, sides } = action.payload
      const edges = computeExposedEdges(state.editor)
      const edge = edges.find(e => e.tileId === tileId && e.edgeIndex === edgeIndex)
      if (!edge) return state
      const mode = state.editor.symmetryMode ?? 'none'
      // Subgroup picker — `'none'` keeps the 17.3 single-edge behaviour.
      // Other subgroups propagate the placement under the chosen orbit;
      // any orbit image that fails viability fails the whole placement.
      if (mode === 'none') {
        if (!isPlacementViable(edge, sides, state.editor)) return state
        const id = `placed-${state.editor.tiles.length}-${Date.now()}`
        const tile = placeRegularNGonOnEdge(sides, state.editor.edgeLength, edge.p1, edge.p2, edge.sourceCenter, id)
        return applyWrap(seedFigures({ ...state, editor: { ...state.editor, tiles: [...state.editor.tiles, tile] } }))
      }
      const idPrefix = `placed-${state.editor.tiles.length}-${Date.now()}`
      const placements = placeTilesOnOrbit(state.editor, edge, sides, idPrefix)
      if (!placements) return state
      return applyWrap(seedFigures({
        ...state,
        editor: { ...state.editor, tiles: [...state.editor.tiles, ...placements] },
      }))
    }
    case 'EDITOR_DELETE_TILE': {
      if (!state.editor) return state
      const { tileId } = action.payload
      const target = state.editor.tiles.find(t => t.id === tileId)
      // The auto-placed origin can't be deleted — it anchors the patch.
      if (!target || target.origin === 'origin') return state
      const mode = state.editor.symmetryMode ?? 'none'
      // Orbit-aware delete: removing one propagated tile takes its orbit
      // siblings with it, otherwise the patch's symmetry would silently
      // break. None mode = single-tile delete (17.3 behaviour). The origin
      // tile is filtered out of the orbit set defensively.
      const ids = mode === 'none'
        ? new Set([tileId])
        : new Set(orbitTileIds(state.editor, target).filter(id => {
            const t = state.editor!.tiles.find(t => t.id === id)
            return t && t.origin !== 'origin'
          }))
      // Q15: orphaned figures are retained on tile removal so re-placing the
      // same shape restores the user's tuning. We only ever add to figures.
      return applyWrap({
        ...state,
        editor: { ...state.editor, tiles: state.editor.tiles.filter(t => !ids.has(t.id)) },
      })
    }
    case 'EDITOR_COMPLETE_GAP': {
      if (!state.editor) return state
      const { pA, pB } = action.payload
      const id = `completed-${state.editor.tiles.length}-${Date.now()}`
      const tile = completeGap(state.editor, pA, pB, id)
      if (!tile) return state
      return applyWrap(seedFigures({ ...state, editor: { ...state.editor, tiles: [...state.editor.tiles, tile] } }))
    }
    case 'EDITOR_COMPLETE_N_GAP': {
      if (!state.editor) return state
      const { picks } = action.payload
      // 17.11b — orbit propagation. With symmetryMode='none' this returns
      // the same single-instance tile array as 17.11; with a non-trivial
      // subgroup, all orbit images that pass the vertex-coincidence gate
      // place atomically (or none of them do, per Decision a).
      const idPrefix = `completed-n-${state.editor.tiles.length}-${Date.now()}`
      const tiles = placePolygonsOnOrbit(state.editor, picks, idPrefix)
      if (!tiles || tiles.length === 0) return state
      return applyWrap(seedFigures({ ...state, editor: { ...state.editor, tiles: [...state.editor.tiles, ...tiles] } }))
    }
    case 'SET_EDITOR_AUTO_COMPLETE_ENABLED': {
      if (!state.editor) return state
      const prev = state.editor.autoComplete ?? { enabled: false }
      return updateEditor(state, { autoComplete: { ...prev, enabled: action.payload } })
    }
    case 'EDITOR_RUN_AUTO_COMPLETE': {
      if (!state.editor) return state
      const { tiles } = autoCompletePatch(state.editor)
      // Idempotent on already-convex patches: reference-equal tiles → no
      // state churn, no figure re-seed.
      if (tiles === state.editor.tiles) return state
      return applyWrap(seedFigures({ ...state, editor: { ...state.editor, tiles } }))
    }
    case 'SET_EDITOR_WRAP_BOUNDARY': {
      if (!state.editor) return state
      const next = updateEditor(state, { wrapBoundary: action.payload })
      // Toggling on must take effect immediately — otherwise the toggle does
      // nothing visible until the next tile mutation.
      return action.payload ? applyWrap(next) : next
    }
    case 'SET_EDITOR_SYMMETRY_MODE': {
      if (!state.editor) return state
      // Triangle has no horizontal mirror — coerce the request defensively.
      const mode = action.payload === 'horizontal' && state.editor.boundaryShape === 'triangle'
        ? 'none'
        : action.payload
      return updateEditor(state, { symmetryMode: mode })
    }
    case 'EDITOR_RESTORE_SNAPSHOT': {
      // Step 17.9 — undo/redo. Snapshot already has its own boundarySize, so
      // we don't run applyWrap (the snapshot represents the post-wrap state
      // at the time it was captured). seedFigures keeps figure-map coverage
      // consistent with the restored tile types.
      const snapshot = action.payload
      if (snapshot === null) {
        const { editor: _drop, ...rest } = state
        void _drop
        return { ...rest, tiling: { ...state.tiling, type: '' } }
      }
      return seedFigures({
        ...state,
        tiling: { ...state.tiling, type: 'editor' },
        editor: snapshot,
      })
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

/**
 * Q15 — after any editor mutation, ensure every distinct `tileTypeId` in the
 * patch has a `figures` entry. No-op when the editor is inactive or every
 * tile type is already seeded.
 */
function seedFigures(state: PatternConfig): PatternConfig {
  if (!state.editor) return state
  const next = seedFiguresForEditor(state.figures, state.editor)
  return next === state.figures ? state : { ...state, figures: next }
}

/**
 * If `wrapBoundary` is on, recompute `boundarySize` so the boundary polygon
 * hugs the patch. No-op otherwise. Called after every tile-mutating action so
 * the boundary stays fitted as the user builds.
 */
function applyWrap(state: PatternConfig): PatternConfig {
  if (!state.editor || !state.editor.wrapBoundary) return state
  const fit = fitBoundarySize(state.editor)
  if (!Number.isFinite(fit) || fit <= 0 || fit === state.editor.boundarySize) return state
  return { ...state, editor: { ...state.editor, boundarySize: fit } }
}

export { DEFAULT_CONFIG }
