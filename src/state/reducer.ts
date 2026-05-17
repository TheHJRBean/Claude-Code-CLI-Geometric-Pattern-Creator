import type { CurvePoint, FigureConfig, PatternConfig } from '../types/pattern'
import type { EditorCell, EditorPatch, EditorTile } from '../types/editor'
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
import { orbitTileIds, placeTilesOnOrbit } from '../editor/orbit'
import { completeGap } from '../editor/complete'
import { completeNGap } from '../editor/completeN'
import { boundarySymmetries, applySym } from '../editor/symmetry'
import { autoCompleteCell, fitBoundarySize } from '../editor/autoComplete'
import { seedFiguresForEditor } from '../editor/tileTypes'
import { activeCell, allCells, withActiveCell } from '../editor/active'
import {
  applyCellTransform,
  inverseCellTransform,
  inverseRotateTranslate,
  isSelectable,
  patchNeighbourStamps,
  patchSelectableVertices,
  retargetTile,
} from '../editor/patchSelectable'
import { overlapsExisting } from '../editor/tileOverlap'
import { tileVertices } from '../editor/exposedEdges'
import type { LatticeStamp } from '../editor/lattice'
import { pointsEqual } from '../utils/math'
import { EDITOR_EPS } from '../editor/exposedEdges'

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
    case 'SET_STRAND_STYLE':
      return { ...state, strand: { ...state.strand, ...action.payload } }
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
    case 'SET_CELL_SHAPE': {
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
    case 'SET_CELL_BOUNDARY_SIZE': {
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
    case 'SET_CELL_SEED_SIDES': {
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
      const patchEdgeLength = state.editor.edgeLength
      return applyWrap(seedFigures(updateActiveCell(state, cell => {
        const edges = computeExposedEdges(cell, patchEdgeLength)
        const edge = edges.find(e => e.tileId === tileId && e.edgeIndex === edgeIndex)
        if (!edge) return cell
        // Size the new Tile to the source edge's actual length, not
        // patch.edgeLength — keeps the new Tile flush with the source even
        // when the Patch's lattice scale has drifted from the seed Tile's
        // edge length (multi-cell slider workflow).
        const placementEdge = edge.length
        const mode = cell.symmetryMode ?? 'none'
        if (mode === 'none') {
          if (!isPlacementViable(edge, sides, cell, placementEdge)) return cell
          const id = `placed-${cell.tiles.length}-${Date.now()}`
          const tile = placeRegularNGonOnEdge(sides, placementEdge, edge.p1, edge.p2, edge.sourceCenter, id)
          return { ...cell, tiles: [...cell.tiles, tile] }
        }
        const idPrefix = `placed-${cell.tiles.length}-${Date.now()}`
        const placements = placeTilesOnOrbit(cell, placementEdge, edge, sides, idPrefix)
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
      return chordCompleteAcrossPatch(state, pA, pB)
    }
    case 'EDITOR_COMPLETE_N_GAP': {
      if (!state.editor) return state
      const { picks } = action.payload
      return multiPickCompleteAcrossPatch(state, picks)
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
    case 'SET_BUILDER_CONFIGURATION': {
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
    case 'SET_ACTIVE_CELL': {
      if (!state.editor) return state
      const { cellId } = action.payload
      if (!state.editor.cells.some(c => c.id === cellId)) return state
      // Pure UI pane swap — excluded from the undo stack (see
      // history.ts DESIGN_MODE_ACTIONS). If the new active Cell has wrap on,
      // refit so the lattice tracks the user's selection.
      const swapped: PatternConfig = {
        ...state,
        editor: { ...state.editor, activeCellId: cellId },
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
 * Chord-mode Complete router across the whole Patch.
 *
 * Iterates (Cell, stamp) pairs — active Cell first, then siblings, then each
 * one-ring neighbour stamp × each Cell. For each pair the picks are mapped
 * into source-Cell-local (undoing the optional stamp first), and the
 * existing `completeGap` is called with its native outer / boundary / mixed
 * disambiguation. The first non-null result wins.
 *
 * Tile hosting:
 *   - `stamp == null` → tile lives in the source Cell (within-Cell Complete,
 *     same as the legacy per-Cell behaviour).
 *   - `stamp != null` → tile lives in the active Cell (cross-stamp picks
 *     land at the stamp position but are stored as active-Cell-local tile
 *     vertices that poke outside its Boundary per Decision 5).
 */
function chordCompleteAcrossPatch(state: PatternConfig, pA: Vec2, pB: Vec2): PatternConfig {
  if (!state.editor) return state
  const patch = state.editor
  const active = activeCell(patch)
  const ordered = [
    ...patch.cells.filter(c => c.id === patch.activeCellId),
    ...patch.cells.filter(c => c.id !== patch.activeCellId),
  ]
  const stamps: (LatticeStamp | null)[] = [null, ...patchNeighbourStamps(patch)]
  for (const stamp of stamps) {
    for (const cell of ordered) {
      const undo = (p: Vec2) =>
        inverseCellTransform(stamp ? inverseRotateTranslate(p, stamp) : p, cell)
      const localA = undo(pA)
      const localB = undo(pB)
      const host = stamp === null ? cell : active
      const id = `completed-${host.tiles.length}-${Date.now()}`
      const sourceTile = completeGap(cell, localA, localB, id)
      if (!sourceTile) continue
      const newTile = retargetTile(sourceTile, cell, stamp, host)
      const candidate = tileVertices(newTile)
      // Overlap guard: a chord whose arc spans far enough to enclose existing
      // Tiles produces a gap polygon that overlaps them. Reject those — the
      // user expected a single-edge first-layer fill, not a wraparound.
      if (overlapsExisting(candidate, existingTilesInHostFrame(patch, host))) continue
      const updatedHost = { ...host, tiles: [...host.tiles, newTile] }
      const cells = patch.cells.map(c => (c.id === host.id ? updatedHost : c))
      return applyWrap(seedFigures({ ...state, editor: { ...patch, cells } }))
    }
  }
  return state
}

/**
 * Multi-vertex Complete router. Validates every pick against the
 * Patch-frame selectable set (matches the canvas's pick-target build), then
 * routes all picks into the active Cell's local frame. Symmetry orbit
 * propagation uses the active Cell's subgroup — orbit images whose
 * Patch-local position isn't in the selectable set are silently dropped
 * (per existing asymmetric-Cell convention).
 *
 * Tile always lives in the active Cell (locked design decision — vertices
 * may poke outside its Boundary per Decision 5).
 */
function multiPickCompleteAcrossPatch(state: PatternConfig, picks: Vec2[]): PatternConfig {
  if (!state.editor) return state
  const patch = state.editor
  const active = activeCell(patch)
  const selectable = patchSelectableVertices(patch, true)
  // eslint-disable-next-line no-console
  console.log('[multiPick] start', { picks: picks.length, active: active.id, patchCells: patch.cells.length, selectableCount: selectable.length, symmetryMode: active.symmetryMode ?? 'none' })
  if (!picks.every(p => isSelectable(p, selectable))) {
    // eslint-disable-next-line no-console
    console.log('[multiPick] REJECT — pick not in selectable', picks.map(p => ({ p, in: isSelectable(p, selectable) })))
    return state
  }
  const realVerts = patchSelectableVertices(patch, false)
  if (!picks.some(p => isSelectable(p, realVerts))) {
    // eslint-disable-next-line no-console
    console.log('[multiPick] REJECT — no pick on a real Cell vertex')
    return state
  }

  const localPicks = picks.map(p => inverseCellTransform(p, active))
  const syms = boundarySymmetries(active.shape, active.symmetryMode ?? 'none')
  const seenCentroids: Vec2[] = []
  const placements: EditorTile[] = []
  let working: EditorCell = active
  const idPrefix = `completed-n-${active.tiles.length}-${Date.now()}`
  // Adjacency reference: only the user's pre-existing Tiles count. Orbit
  // images placed inside this loop don't satisfy adjacency for their siblings
  // — otherwise a chain of mutually-adjacent orbit images could drift away
  // from any real Tile.
  const userTiles = existingTilesInHostFrame(patch, active)
  for (let i = 0; i < syms.length; i++) {
    const transformed = localPicks.map(p => applySym(syms[i], p))
    const patchLocal = transformed.map(p => applyCellTransform(p, active))
    if (!patchLocal.every(p => isSelectable(p, selectable))) {
      // eslint-disable-next-line no-console
      console.log('[multiPick] orbit', i, 'SKIP — orbit image picks not in selectable')
      continue
    }
    const c = centroidOf(transformed)
    if (seenCentroids.some(q => pointsEqual(c, q, EDITOR_EPS))) {
      // eslint-disable-next-line no-console
      console.log('[multiPick] orbit', i, 'SKIP — centroid dedup')
      continue
    }
    seenCentroids.push(c)
    const tile = completeNGap(working, transformed, `${idPrefix}-${i}`)
    if (!tile) {
      // eslint-disable-next-line no-console
      console.log('[multiPick] orbit', i, 'REJECT — completeNGap returned null (likely centroid-inside-tile or self-intersecting)')
      return state
    }
    const candidate = tileVertices(tile)
    if (overlapsExisting(candidate, userTiles)) {
      // eslint-disable-next-line no-console
      console.log('[multiPick] orbit', i, 'REJECT — candidate overlaps user tiles')
      return state
    }
    // eslint-disable-next-line no-console
    console.log('[multiPick] orbit', i, 'PLACED tile.kind=', tile.kind)
    placements.push(tile)
    working = { ...working, tiles: [...working.tiles, tile] }
  }
  // eslint-disable-next-line no-console
  console.log('[multiPick] done — placements:', placements.length)
  if (placements.length === 0) return state
  return applyWrap(seedFigures(updateActiveCell(state, _ => working)))
}

function centroidOf(verts: Vec2[]): Vec2 {
  let x = 0, y = 0
  for (const v of verts) { x += v.x; y += v.y }
  return { x: x / verts.length, y: y / verts.length }
}

/**
 * Existing-tile vertex arrays from every Cell in the Patch, expressed in
 * `host`'s local frame. Sibling Cells get their tiles forward-transformed
 * through their own cellTransform then inverse-transformed through `host`'s,
 * so overlap / adjacency checks can compare the candidate tile (in `host`-
 * local) against the entire Patch's tiles uniformly.
 */
function existingTilesInHostFrame(patch: EditorPatch, host: EditorCell): Vec2[][] {
  const out: Vec2[][] = []
  for (const cell of patch.cells) {
    for (const tile of cell.tiles) {
      const local = tileVertices(tile)
      if (cell.id === host.id) {
        out.push(local)
        continue
      }
      const patchLocal = local.map(v => applyCellTransform(v, cell))
      out.push(patchLocal.map(v => inverseCellTransform(v, host)))
    }
  }
  return out
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
