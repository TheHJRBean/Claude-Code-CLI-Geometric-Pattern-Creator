import type { CurvePoint, FigureConfig, PatternConfig } from '../types/pattern'
import type { EditorCell } from '../types/editor'
import type { Vec2 } from '../utils/math'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'
import {
  createDefault488EditorConfig,
  createDefaultEditorConfig,
  createSeedTile,
  DEFAULT_BOUNDARY_SIZE_BY_SHAPE,
} from '../editor/createDefault'
import { computeExposedEdges } from '../editor/exposedEdges'
import { isPlacementViable, placeRegularNGonOnEdge } from '../editor/placement'
import { orbitTileIds, placeTilesOnOrbit, placePolygonsOnOrbit } from '../editor/orbit'
import { completeGap } from '../editor/complete'
import { autoCompleteCell, fitBoundarySize } from '../editor/autoComplete'
import { seedFiguresForEditor } from '../editor/tileTypes'
import { activeCell, allCells, withActiveCell } from '../editor/active'

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
      // From a multi-cell **Configuration** (e.g. 4.8.8), picking a single
      // boundary shape exits the Configuration: seed a fresh single-cell
      // Patch in the requested shape. The Configuration's authored Cells are
      // discarded — the user can undo to restore.
      if (state.editor.cells.length > 1) {
        const fresh = createDefaultEditorConfig({
          shape: action.payload,
          boundarySize: DEFAULT_BOUNDARY_SIZE_BY_SHAPE[action.payload],
        })
        return seedFigures({ ...state, editor: fresh })
      }
      // Single-cell: Tiles are preserved across boundary-shape changes
      // (single-edge placements remain valid under any Boundary). The Cell's
      // boundarySize snaps to the new shape's default.
      return applyWrap(seedFigures(updateActiveCell(state, cell => ({
        ...cell,
        shape: action.payload,
        boundarySize: DEFAULT_BOUNDARY_SIZE_BY_SHAPE[action.payload],
      }))))
    }
    case 'SET_EDITOR_BOUNDARY_SIZE': {
      // Q9 Option B: the slider rescales the Cell's Boundary outline — Tiles
      // untouched. Manual slider drag implies the user wants a specific size,
      // so wrap turns off on the touched Cells.
      //
      // Multi-cell: the slider scales the whole lattice. All Cell centres
      // scale proportionally, every Cell's boundarySize updates, and
      // `patch.edgeLength` (which drives `compositionCellBasis`) follows so
      // the 4.8.8 invariant — octagon edge = square edge = lattice edge —
      // holds. Seed Tile sizes stay so the inside of each Cell keeps its
      // authored polygon (single-shape parity).
      if (!state.editor) return state
      const next = action.payload
      if (next <= 0) return state
      if (state.editor.cells.length > 1) {
        if (state.editor.edgeLength === next) return state
        const k = state.editor.edgeLength === 0 ? 1 : next / state.editor.edgeLength
        const cells = state.editor.cells.map(c => ({
          ...c,
          center: { x: c.center.x * k, y: c.center.y * k },
          boundarySize: next,
          wrapBoundary: false,
        }))
        return {
          ...state,
          editor: { ...state.editor, cells, edgeLength: next },
        }
      }
      return updateActiveCell(state, cell => ({
        ...cell,
        boundarySize: next,
        wrapBoundary: false,
      }))
    }
    case 'SET_EDITOR_ALTERNATE_BOUNDARY':
      // Flips just the active Cell's Boundary outline by π/n. Sibling Cells in
      // a multi-cell Patch are untouched — the unit cell still tiles by
      // translation because each Cell's `center` + `rotation` is preserved.
      if (!state.editor) return state
      return applyWrap(updateActiveCell(state, cell => ({
        ...cell,
        alternateBoundary: action.payload,
      })))
    case 'SET_EDITOR_ORIGIN_SIDES': {
      if (!state.editor) return state
      const sides = Math.max(3, Math.floor(action.payload))
      // Changing Seed sides invalidates any placed/completed Tiles built on
      // the previous Seed Tile's edges. Reset the active Cell to the new
      // Seed Tile only.
      const edgeLength = state.editor.edgeLength
      return applyWrap(seedFigures(updateActiveCell(state, cell => ({
        ...cell,
        seedSides: sides,
        tiles: [createSeedTile(sides, edgeLength)],
      }))))
    }
    case 'EDITOR_PLACE_TILE_ON_EDGE': {
      if (!state.editor) return state
      const { tileId, edgeIndex, sides } = action.payload
      const edgeLength = state.editor.edgeLength
      return applyWrap(seedFigures(updateActiveCell(state, cell => {
        const edges = computeExposedEdges(cell, edgeLength)
        const edge = edges.find(e => e.tileId === tileId && e.edgeIndex === edgeIndex)
        if (!edge) return cell
        const mode = cell.symmetryMode ?? 'none'
        // Subgroup picker — `'none'` keeps the 17.3 single-edge behaviour.
        // Other subgroups propagate the placement under the chosen orbit;
        // any orbit image that fails viability fails the whole placement.
        if (mode === 'none') {
          if (!isPlacementViable(edge, sides, cell, edgeLength)) return cell
          const id = `placed-${cell.tiles.length}-${Date.now()}`
          const tile = placeRegularNGonOnEdge(sides, edgeLength, edge.p1, edge.p2, edge.sourceCenter, id)
          return { ...cell, tiles: [...cell.tiles, tile] }
        }
        const idPrefix = `placed-${cell.tiles.length}-${Date.now()}`
        const placements = placeTilesOnOrbit(cell, edgeLength, edge, sides, idPrefix)
        if (!placements) return cell
        return { ...cell, tiles: [...cell.tiles, ...placements] }
      })))
    }
    case 'EDITOR_DELETE_TILE': {
      if (!state.editor) return state
      const { tileId } = action.payload
      return applyWrap(updateActiveCell(state, cell => {
        const target = cell.tiles.find(t => t.id === tileId)
        // The auto-placed Seed Tile can't be deleted — it anchors the Cell.
        if (!target || target.source === 'seed') return cell
        const mode = cell.symmetryMode ?? 'none'
        // Orbit-aware delete: removing one propagated Tile takes its orbit
        // siblings with it, otherwise the Cell's symmetry would silently
        // break. None mode = single-Tile delete (17.3 behaviour). The Seed
        // Tile is filtered out of the orbit set defensively.
        const ids = mode === 'none'
          ? new Set([tileId])
          : new Set(orbitTileIds(cell, target).filter(id => {
              const t = cell.tiles.find(t => t.id === id)
              return t && t.source !== 'seed'
            }))
        // Q15: orphaned figures are retained on tile removal so re-placing
        // the same shape restores the user's tuning. We only ever add to
        // figures.
        return { ...cell, tiles: cell.tiles.filter(t => !ids.has(t.id)) }
      }))
    }
    case 'EDITOR_COMPLETE_GAP': {
      if (!state.editor) return state
      const { pA, pB } = action.payload
      // Cross-Cell completion: try the active Cell first, then each sibling.
      // Picks come from the canvas in Patch-local coords; transform into each
      // Cell's local frame before handing to `completeGap`.
      return completeAcrossCells(state, cell => {
        const localA = inverseCellTransform(pA, cell)
        const localB = inverseCellTransform(pB, cell)
        const id = `completed-${cell.tiles.length}-${Date.now()}`
        const tile = completeGap(cell, localA, localB, id)
        if (!tile) return null
        return { ...cell, tiles: [...cell.tiles, tile] }
      })
    }
    case 'EDITOR_COMPLETE_N_GAP': {
      if (!state.editor) return state
      const { picks } = action.payload
      // 17.11b — orbit propagation. With symmetryMode='none' this returns
      // the same single-instance tile array as 17.11; with a non-trivial
      // subgroup, all orbit images that pass the vertex-coincidence gate
      // place atomically (or none of them do, per Decision a).
      return completeAcrossCells(state, cell => {
        const localPicks = picks.map(p => inverseCellTransform(p, cell))
        const idPrefix = `completed-n-${cell.tiles.length}-${Date.now()}`
        const tiles = placePolygonsOnOrbit(cell, localPicks, idPrefix)
        if (!tiles || tiles.length === 0) return null
        return { ...cell, tiles: [...cell.tiles, ...tiles] }
      })
    }
    case 'SET_EDITOR_AUTO_COMPLETE_ENABLED': {
      if (!state.editor) return state
      const prev = state.editor.autoComplete ?? { enabled: false }
      return {
        ...state,
        editor: { ...state.editor, autoComplete: { ...prev, enabled: action.payload } },
      }
    }
    case 'EDITOR_RUN_AUTO_COMPLETE': {
      if (!state.editor) return state
      return applyWrap(seedFigures(updateActiveCell(state, cell => {
        const { tiles } = autoCompleteCell(cell)
        // Idempotent on already-convex Cells: reference-equal tiles → no
        // state churn, no figure re-seed.
        if (tiles === cell.tiles) return cell
        return { ...cell, tiles }
      })))
    }
    case 'SET_EDITOR_WRAP_BOUNDARY': {
      if (!state.editor) return state
      // Per-active-Cell wrap. Toggling on must take effect immediately —
      // otherwise the toggle does nothing visible until the next mutation.
      const next = updateActiveCell(state, cell => ({ ...cell, wrapBoundary: action.payload }))
      return action.payload ? applyWrap(next) : next
    }
    case 'SET_EDITOR_SYMMETRY_MODE': {
      if (!state.editor) return state
      return updateActiveCell(state, cell => {
        // Triangle has no horizontal mirror — coerce the request defensively.
        const mode = action.payload === 'horizontal' && cell.shape === 'triangle'
          ? 'none'
          : action.payload
        return { ...cell, symmetryMode: mode }
      })
    }
    case 'SET_EDITOR_BOUNDARY_CONFIGURATION': {
      // Switch the Patch between single-cell and a multi-cell Configuration.
      // Destructive — discards the current Cells (single → multi-cell seeds
      // fresh; multi-cell → single returns to defaults).
      if (action.payload === '4.8.8') {
        const next = createDefault488EditorConfig()
        return seedFigures({
          ...state,
          tiling: { ...state.tiling, type: 'editor' },
          editor: next,
        })
      }
      // payload === null → leave Configuration, fresh single-cell Patch.
      const next = createDefaultEditorConfig()
      return seedFigures({
        ...state,
        tiling: { ...state.tiling, type: 'editor' },
        editor: next,
      })
    }
    case 'SET_ACTIVE_BOUNDARY_TILE': {
      if (!state.editor) return state
      const { tileId } = action.payload
      if (!state.editor.cells.some(c => c.id === tileId)) return state
      // Pure UI pane swap — excluded from the undo stack (see
      // history.ts DESIGN_MODE_ACTIONS). If the new active Cell has wrap on,
      // refit so the lattice tracks the user's selection.
      const swapped: PatternConfig = {
        ...state,
        editor: { ...state.editor, activeCellId: tileId },
      }
      return applyWrap(swapped)
    }
    case 'EDITOR_RESTORE_SNAPSHOT': {
      // Step 17.9 — undo/redo. Snapshot already has its own per-Cell
      // boundarySizes, so we don't run applyWrap (the snapshot represents
      // the post-wrap state at the time it was captured). seedFigures keeps
      // figure-map coverage consistent with the restored Tile types.
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

/**
 * Immutable update: replace the active Cell via `fn(currentCell)`. If `fn`
 * returns the same Cell (reference equality), state is unchanged. Otherwise
 * returns a fresh `PatternConfig` with the updated Cell in place.
 */
function updateActiveCell(
  state: PatternConfig,
  fn: (cell: EditorCell) => EditorCell,
): PatternConfig {
  if (!state.editor) return state
  const current = activeCell(state.editor)
  const next = fn(current)
  if (next === current) return state
  return { ...state, editor: { ...withActiveCell(state.editor, next), version: state.editor.version } }
}

/**
 * Cross-Cell completion router. Tries each Cell (active first) by handing it
 * to the supplied factory; the factory returns the new Cell or `null` if the
 * picks don't fit. The first Cell that yields a non-null result wins; the
 * returned `PatternConfig` has that Cell updated in `state.editor.cells`.
 * Picks that match nothing in any Cell leave state untouched.
 */
function completeAcrossCells(
  state: PatternConfig,
  apply: (cell: EditorCell) => EditorCell | null,
): PatternConfig {
  if (!state.editor) return state
  const order = [
    ...state.editor.cells.filter(c => c.id === state.editor!.activeCellId),
    ...state.editor.cells.filter(c => c.id !== state.editor!.activeCellId),
  ]
  for (const cell of order) {
    const nextCell = apply(cell)
    if (!nextCell || nextCell === cell) continue
    const cells = state.editor.cells.map(c => (c.id === cell.id ? nextCell : c))
    const after: PatternConfig = {
      ...state,
      editor: { ...state.editor, cells },
    }
    return applyWrap(seedFigures(after))
  }
  return state
}

/**
 * Inverse of a Cell's transform: takes a point in Patch-local coords and
 * returns the equivalent in the Cell's local coords. Used by Complete-mode
 * handlers in multi-cell Configurations: vertex picks come in Patch-local
 * from the canvas overlay, but `completeGap` / `placePolygonsOnOrbit` expect
 * Cell-local picks to match the Cell's cycle vertices.
 */
function inverseCellTransform(p: Vec2, cell: EditorCell): Vec2 {
  const dx = p.x - cell.center.x
  const dy = p.y - cell.center.y
  if (cell.rotation === 0) return { x: dx, y: dy }
  // Inverse rotation = transpose for orthogonal matrix.
  const c = Math.cos(cell.rotation), s = Math.sin(cell.rotation)
  return { x: dx * c + dy * s, y: -dx * s + dy * c }
}

/**
 * Q15 — after any editor mutation, ensure every distinct `tileTypeId` across
 * every Cell of the Patch has a `figures` entry. `seedFiguresForEditor`
 * already walks `patch.cells` itself, so this is just a thin wrapper that
 * skips the noop case.
 */
function seedFigures(state: PatternConfig): PatternConfig {
  if (!state.editor) return state
  void allCells // imported for parity with the v2 reducer; the walker lives inside seedFiguresForEditor now
  const figures = seedFiguresForEditor(state.figures, state.editor)
  return figures === state.figures ? state : { ...state, figures }
}

/**
 * If the active Cell's `wrapBoundary` is on, recompute its boundarySize so
 * the Boundary polygon hugs its Tiles. No-op otherwise. Called after every
 * Tile-mutating action so the Boundary stays fitted as the user builds.
 *
 * Multi-cell: when the active Cell's wrap fires, propagate the new size to
 * every sibling Cell (and to `patch.edgeLength`), with all Cell centres
 * scaling proportionally. This preserves the v2 4.8.8 invariant — every
 * Cell's Boundary edge matches the lattice edge.
 */
function applyWrap(state: PatternConfig): PatternConfig {
  if (!state.editor) return state
  const cell = activeCell(state.editor)
  if (!cell.wrapBoundary) return state
  const fit = fitBoundarySize(cell, state.editor.edgeLength)
  if (!Number.isFinite(fit) || fit <= 0) return state

  if (state.editor.cells.length > 1) {
    if (fit === state.editor.edgeLength) return state
    const k = state.editor.edgeLength === 0 ? 1 : fit / state.editor.edgeLength
    const cells = state.editor.cells.map(c => ({
      ...c,
      center: { x: c.center.x * k, y: c.center.y * k },
      boundarySize: fit,
    }))
    return {
      ...state,
      editor: { ...state.editor, cells, edgeLength: fit },
    }
  }
  if (fit === cell.boundarySize) return state
  return updateActiveCell(state, c => ({ ...c, boundarySize: fit }))
}

export { DEFAULT_CONFIG }
