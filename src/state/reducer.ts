import type { CurvePoint, FigureConfig, PatternConfig } from '../types/pattern'
import type { EditorConfig, EditorPatch } from '../types/editor'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'
import {
  createDefault488EditorConfig,
  createDefaultEditorConfig,
  createOriginTile,
  DEFAULT_BOUNDARY_SIZE_BY_SHAPE,
} from '../editor/createDefault'
import { computeExposedEdges } from '../editor/exposedEdges'
import { isPlacementViable, placeRegularNGonOnEdge } from '../editor/placement'
import { orbitTileIds, placeTilesOnOrbit } from '../editor/orbit'
import { completeGap } from '../editor/complete'
import { placePolygonsOnOrbit } from '../editor/orbit'
import { autoCompletePatch, fitBoundarySize } from '../editor/autoComplete'
import { seedFiguresForEditor } from '../editor/tileTypes'
import { activePatch, allPatches, withActivePatch } from '../editor/active'

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
      // From a composition (e.g. 4.8.8), picking a single-shape boundary
      // exits the composition: seed a fresh patch in the requested shape.
      // The composition's authored interiors are discarded — the user can
      // undo to restore.
      if (state.editor.composition) {
        const fresh = createDefaultEditorConfig({
          boundaryShape: action.payload,
          boundarySize: DEFAULT_BOUNDARY_SIZE_BY_SHAPE[action.payload],
        })
        return seedFigures({ ...state, editor: fresh })
      }
      // Single-shape: tiles are preserved across boundary-shape changes
      // (single-edge placements remain valid under any boundary). Boundary
      // size still snaps to the new shape's default.
      const next: EditorConfig = {
        ...state.editor,
        boundaryShape: action.payload,
        boundarySize: DEFAULT_BOUNDARY_SIZE_BY_SHAPE[action.payload],
      }
      return applyWrap(seedFigures({ ...state, editor: next }))
    }
    case 'SET_EDITOR_BOUNDARY_SIZE': {
      // Q9 Option B (single-shape): only the boundary outline rescales —
      // tiles untouched. Manual slider drag implies the user wants a
      // specific size, so wrap turns off.
      // Composition: parity with single-shape — the slider only rescales
      // the cell vectors (`composition.edgeLength`) and each boundary
      // tile's outline (`patch.boundarySize` — used by
      // `editorBoundaryVertices`). The origin tile and any user-placed
      // sub-tiles keep their own size, so dragging the slider changes the
      // cell scale without resizing what's inside, exactly as the
      // single-shape boundary-size slider does. BoundaryTile.center stays
      // in cell-local coords seeded at creation; if the user wants a
      // different cell, they pick 4.8.8 again to re-seed.
      if (!state.editor) return state
      const next = action.payload
      if (next <= 0) return state
      if (state.editor.composition) {
        const c = state.editor.composition
        if (c.edgeLength === next) return state
        // Cell vectors scale with `edgeLength`, so each `BoundaryTile.center`
        // — which expresses the tile's position *within* the unit cell —
        // must scale proportionally or boundaries drift out of place
        // (octagon stays at (0,0), but the square's centre would lag at
        // the old offset and the two outlines overlap as the cell grows).
        // patch.edgeLength + the tile contents stay so the origin tile
        // keeps its own size — single-shape parity.
        // Manual slider drag clears wrap on every patch (single-shape
        // parity — explicit override of the auto-fit).
        const k = c.edgeLength === 0 ? 1 : next / c.edgeLength
        const tiles = c.tiles.map(t => ({
          ...t,
          center: { x: t.center.x * k, y: t.center.y * k },
          patch: { ...t.patch, boundarySize: next, wrapBoundary: false },
        }))
        const active = tiles.find(t => t.id === c.activeTileId) ?? tiles[0]
        return {
          ...state,
          editor: {
            version: state.editor.version,
            ...active.patch,
            composition: { ...c, edgeLength: next, tiles },
          },
        }
      }
      return updateEditor(state, { boundarySize: next, wrapBoundary: false })
    }
    case 'SET_EDITOR_ALTERNATE_BOUNDARY':
      // Pure visual flip on single-shape patches. No-op when composition is
      // set — the cell's orientation is fixed by the configuration.
      if (!state.editor) return state
      if (state.editor.composition) return state
      return applyWrap(updateEditor(state, { alternateBoundary: action.payload }))
    case 'SET_EDITOR_ORIGIN_SIDES': {
      if (!state.editor) return state
      const sides = Math.max(3, Math.floor(action.payload))
      // Changing origin sides invalidates any placed/completed tiles built on
      // the previous origin's edges. Reset to the new origin tile only.
      // Routes via activePatch so composition's active boundary tile is the
      // mutation target.
      return updatePatch(state, patch => ({
        ...patch,
        originSides: sides,
        tiles: [createOriginTile(sides, patch.edgeLength)],
      }), { wrap: true, seed: true })
    }
    case 'EDITOR_PLACE_TILE_ON_EDGE': {
      if (!state.editor) return state
      const { tileId, edgeIndex, sides } = action.payload
      return updatePatch(state, patch => {
        const edges = computeExposedEdges(patch)
        const edge = edges.find(e => e.tileId === tileId && e.edgeIndex === edgeIndex)
        if (!edge) return null
        const mode = patch.symmetryMode ?? 'none'
        // Subgroup picker — `'none'` keeps the 17.3 single-edge behaviour.
        // Other subgroups propagate the placement under the chosen orbit;
        // any orbit image that fails viability fails the whole placement.
        if (mode === 'none') {
          if (!isPlacementViable(edge, sides, patch)) return null
          const id = `placed-${patch.tiles.length}-${Date.now()}`
          const tile = placeRegularNGonOnEdge(sides, patch.edgeLength, edge.p1, edge.p2, edge.sourceCenter, id)
          return { ...patch, tiles: [...patch.tiles, tile] }
        }
        const idPrefix = `placed-${patch.tiles.length}-${Date.now()}`
        const placements = placeTilesOnOrbit(patch, edge, sides, idPrefix)
        if (!placements) return null
        return { ...patch, tiles: [...patch.tiles, ...placements] }
      }, { wrap: true, seed: true })
    }
    case 'EDITOR_DELETE_TILE': {
      if (!state.editor) return state
      const { tileId } = action.payload
      return updatePatch(state, patch => {
        const target = patch.tiles.find(t => t.id === tileId)
        // The auto-placed origin can't be deleted — it anchors the patch.
        if (!target || target.origin === 'origin') return null
        const mode = patch.symmetryMode ?? 'none'
        // Orbit-aware delete: removing one propagated tile takes its orbit
        // siblings with it, otherwise the patch's symmetry would silently
        // break. None mode = single-tile delete (17.3 behaviour). The origin
        // tile is filtered out of the orbit set defensively.
        const ids = mode === 'none'
          ? new Set([tileId])
          : new Set(orbitTileIds(patch, target).filter(id => {
              const t = patch.tiles.find(t => t.id === id)
              return t && t.origin !== 'origin'
            }))
        // Q15: orphaned figures are retained on tile removal so re-placing
        // the same shape restores the user's tuning. We only ever add to
        // figures.
        return { ...patch, tiles: patch.tiles.filter(t => !ids.has(t.id)) }
      }, { wrap: true, seed: false })
    }
    case 'EDITOR_COMPLETE_GAP': {
      if (!state.editor) return state
      const { pA, pB } = action.payload
      return updatePatch(state, patch => {
        const id = `completed-${patch.tiles.length}-${Date.now()}`
        const tile = completeGap(patch, pA, pB, id)
        if (!tile) return null
        return { ...patch, tiles: [...patch.tiles, tile] }
      }, { wrap: true, seed: true })
    }
    case 'EDITOR_COMPLETE_N_GAP': {
      if (!state.editor) return state
      const { picks } = action.payload
      // 17.11b — orbit propagation. With symmetryMode='none' this returns
      // the same single-instance tile array as 17.11; with a non-trivial
      // subgroup, all orbit images that pass the vertex-coincidence gate
      // place atomically (or none of them do, per Decision a).
      return updatePatch(state, patch => {
        const idPrefix = `completed-n-${patch.tiles.length}-${Date.now()}`
        const tiles = placePolygonsOnOrbit(patch, picks, idPrefix)
        if (!tiles || tiles.length === 0) return null
        return { ...patch, tiles: [...patch.tiles, ...tiles] }
      }, { wrap: true, seed: true })
    }
    case 'SET_EDITOR_AUTO_COMPLETE_ENABLED': {
      if (!state.editor) return state
      return updatePatch(state, patch => {
        const prev = patch.autoComplete ?? { enabled: false }
        return { ...patch, autoComplete: { ...prev, enabled: action.payload } }
      }, { wrap: false, seed: false })
    }
    case 'EDITOR_RUN_AUTO_COMPLETE': {
      if (!state.editor) return state
      return updatePatch(state, patch => {
        const { tiles } = autoCompletePatch(patch)
        // Idempotent on already-convex patches: reference-equal tiles → no
        // state churn, no figure re-seed.
        if (tiles === patch.tiles) return null
        return { ...patch, tiles }
      }, { wrap: true, seed: true })
    }
    case 'SET_EDITOR_WRAP_BOUNDARY': {
      if (!state.editor) return state
      // Composition: the toggle is per-active-patch — wrap fits the cell
      // edge to whichever boundary tile the user is currently editing.
      // Single-shape: same behaviour as before.
      if (state.editor.composition) {
        const next = updatePatch(
          state,
          patch => ({ ...patch, wrapBoundary: action.payload }),
          { wrap: false, seed: false },
        )
        return action.payload ? applyWrap(next) : next
      }
      const next = updateEditor(state, { wrapBoundary: action.payload })
      // Toggling on must take effect immediately — otherwise the toggle does
      // nothing visible until the next tile mutation.
      return action.payload ? applyWrap(next) : next
    }
    case 'SET_EDITOR_SYMMETRY_MODE': {
      if (!state.editor) return state
      return updatePatch(state, patch => {
        // Triangle has no horizontal mirror — coerce the request defensively.
        const mode = action.payload === 'horizontal' && patch.boundaryShape === 'triangle'
          ? 'none'
          : action.payload
        return { ...patch, symmetryMode: mode }
      }, { wrap: false, seed: false })
    }
    case 'SET_EDITOR_BOUNDARY_CONFIGURATION': {
      // Switch the wrapper between single-shape and a multi-tile composition.
      // Destructive — discards the current patch (single → composition seeds
      // fresh inner patches; composition → single returns to defaults).
      if (action.payload === '4.8.8') {
        const next = createDefault488EditorConfig()
        return seedFigures({
          ...state,
          tiling: { ...state.tiling, type: 'editor' },
          editor: next,
        })
      }
      // payload === null → leave composition, fresh single-shape patch.
      const next = createDefaultEditorConfig()
      return seedFigures({
        ...state,
        tiling: { ...state.tiling, type: 'editor' },
        editor: next,
      })
    }
    case 'SET_ACTIVE_BOUNDARY_TILE': {
      if (!state.editor || !state.editor.composition) return state
      const { tileId } = action.payload
      const composition = state.editor.composition
      if (!composition.tiles.some(t => t.id === tileId)) return state
      // Pure UI pane swap. Mirror the new active tile's per-patch fields up
      // to the wrapper so legacy single-shape readers (that haven't migrated
      // through activePatch yet) see the active tile's view. Excluded from
      // the undo stack — see history.ts DESIGN_MODE_ACTIONS. If the new
      // active patch has wrap on, refit the cell to it (wrap follows the
      // selected boundary tile per the v1 contract).
      const nextComposition = { ...composition, activeTileId: tileId }
      const active = nextComposition.tiles.find(t => t.id === tileId)!
      const swapped: PatternConfig = {
        ...state,
        editor: {
          version: 2,
          ...active.patch,
          composition: nextComposition,
        },
      }
      return applyWrap(swapped)
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
 * Route a per-patch mutation through the active-patch adapter so single-shape
 * and composition-active editors share one code path. The mutation function
 * receives the active `EditorPatch`, returns either the next patch or `null`
 * to signal "no change". Optionally runs `applyWrap` and `seedFigures` after.
 */
function updatePatch(
  state: PatternConfig,
  fn: (patch: EditorPatch) => EditorPatch | null,
  opts: { wrap: boolean; seed: boolean },
): PatternConfig {
  if (!state.editor) return state
  const current = activePatch(state.editor)
  const next = fn(current)
  if (!next || next === current) return state
  let after: PatternConfig = { ...state, editor: withActivePatch(state.editor, next) }
  if (opts.seed) after = seedFigures(after)
  if (opts.wrap) after = applyWrap(after)
  return after
}

/**
 * Q15 — after any editor mutation, ensure every distinct `tileTypeId` in the
 * patch has a `figures` entry. Walks all patches under composition so each
 * boundary tile's interior tile types get seed figures (octagon AND square
 * inner-tile types both get strand cards).
 */
function seedFigures(state: PatternConfig): PatternConfig {
  if (!state.editor) return state
  let figures = state.figures
  for (const patch of allPatches(state.editor)) {
    figures = seedFiguresForEditor(figures, patch)
  }
  return figures === state.figures ? state : { ...state, figures }
}

/**
 * If `wrapBoundary` is on, recompute `boundarySize` so the boundary polygon
 * hugs the patch. No-op otherwise. Called after every tile-mutating action so
 * the boundary stays fitted as the user builds.
 *
 * Composition: per-active-patch wrap. When the active boundary tile's
 * `patch.wrapBoundary` is on, fit `composition.edgeLength` to the active
 * patch's tile contents and propagate to the sibling tile (so the 4.8.8
 * invariant — octagon edge = square edge = cell edge — holds). Tile
 * centres scale proportionally, same way the slider scales them.
 */
function applyWrap(state: PatternConfig): PatternConfig {
  if (!state.editor) return state
  if (state.editor.composition) {
    const c = state.editor.composition
    const active = c.tiles.find(t => t.id === c.activeTileId)
    if (!active || !active.patch.wrapBoundary) return state
    const fit = fitBoundarySize(active.patch)
    if (!Number.isFinite(fit) || fit <= 0 || fit === c.edgeLength) return state
    const k = c.edgeLength === 0 ? 1 : fit / c.edgeLength
    const tiles = c.tiles.map(t => ({
      ...t,
      center: { x: t.center.x * k, y: t.center.y * k },
      patch: { ...t.patch, boundarySize: fit },
    }))
    const activeAfter = tiles.find(t => t.id === c.activeTileId) ?? tiles[0]
    return {
      ...state,
      editor: {
        version: state.editor.version,
        ...activeAfter.patch,
        composition: { ...c, edgeLength: fit, tiles },
      },
    }
  }
  if (!state.editor.wrapBoundary) return state
  const fit = fitBoundarySize(state.editor)
  if (!Number.isFinite(fit) || fit <= 0 || fit === state.editor.boundarySize) return state
  return { ...state, editor: { ...state.editor, boundarySize: fit } }
}

export { DEFAULT_CONFIG }
