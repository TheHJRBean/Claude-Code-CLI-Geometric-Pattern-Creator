import type { CurvePoint, FigureConfig, PatternConfig } from '../types/pattern'
import type { EditorCell, EditorConfig, EditorTile } from '../types/editor'
import type { Vec2 } from '../utils/math'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'
import {
  createDefault31212EditorConfig,
  createDefault3464EditorConfig,
  createDefault3636EditorConfig,
  createDefault4612EditorConfig,
  createDefault488EditorConfig,
  createDefaultEditorConfig,
  createSeedTile,
  DEFAULT_BOUNDARY_SIZE_BY_SHAPE,
} from '../editor/createDefault'
import { computeExposedEdges } from '../editor/exposedEdges'
import { isPlacementViable, placeRegularNGonOnEdge } from '../editor/placement'
import { orbitTileIds, placeTilesOnOrbit, placeTilesOnVertexOrbit } from '../editor/orbit'
import {
  computeExposedVertices,
  isVertexPlacementViable,
  placeRegularNGonOnVertex,
} from '../editor/vertexPlacement'
import { completeGap } from '../editor/complete'
import { completeNGap } from '../editor/completeN'
import { boundarySymmetries, applySym } from '../editor/symmetry'
import { autoCompleteCell, fitBoundarySize } from '../editor/autoComplete'
import { computeBoundarySections, isBoundarySectionPlacementViable, placeRegularNGonOnBoundarySection, placeTilesOnBoundarySectionOrbit } from '../editor/boundaryInward'
import { frameOutlinePolygon, computeFrameSections, placeRegularNGonOnFrameSection, frameCornerStubTiles } from '../editor/frame'
import { DEFAULT_EDITOR_FIGURE, seedFiguresForEditor } from '../editor/tileTypes'
import { activeCell, allCells, withActiveCell } from '../editor/active'
import {
  applyCellTransform,
  existingTilesInHostFrame,
  inverseCellTransform,
  inverseRotateTranslate,
  isPatchSelectableVertex,
  neighbourStampsNear,
  retargetTile,
} from '../editor/patchSelectable'
import { patchRotation } from '../editor/compositionLattice'
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

/**
 * The figure-map keys legitimate for a given gallery tiling: its tile-type
 * ids (explicit `tileTypes`, else derived from `vertexConfig`) plus any keys
 * its default figures ship with. Returns null for tilings not in TILINGS
 * (e.g. Builder/editor configs, `tiling.type === 'editor'`) — that signals
 * "don't prune", since Builder tile-type ids come from the Patch, not here.
 */
function validFigureKeys(tilingType: string): Set<string> | null {
  const def = TILINGS[tilingType]
  if (!def) return null
  const ids = def.tileTypes
    ? def.tileTypes.map(t => t.id)
    : [...new Set(def.vertexConfig)].map(String)
  const keys = new Set(ids)
  for (const k of Object.keys(def.defaultConfig.figures ?? {})) keys.add(k)
  return keys
}

/**
 * Drop figure entries whose key isn't a tile type of `tilingType`. Stops
 * stale per-tile figures from a previously-selected tiling leaking into the
 * current one (e.g. a "5"/"4.1" figure surviving a switch to 3.3.4.3.4),
 * which otherwise renders / toggles on tile types the user never intended.
 * No-op for Builder/editor configs (validFigureKeys → null).
 */
function pruneFigures(figures: Record<string, FigureConfig>, tilingType: string): Record<string, FigureConfig> {
  const valid = validFigureKeys(tilingType)
  if (!valid) return figures
  const next: Record<string, FigureConfig> = {}
  for (const [k, v] of Object.entries(figures)) if (valid.has(k)) next[k] = v
  return next
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
      // Re-selecting the current tiling is a no-op so the user keeps their
      // tweaks. Switching to a *different* tiling resets `figures` to that
      // tiling's own defaults — no carryover. The old code merged the
      // previous tiling's figures in, which both accumulated stale keys
      // (e.g. a "5" surviving onto a snub square) AND leaked shared-id
      // settings across tilings (vertex strands enabled on a `square`'s "4"
      // bleeding onto 3.3.4.3.4's squares). Both are the reported bug.
      if (action.payload === state.tiling.type) return state
      return {
        ...state,
        tiling: { ...state.tiling, type: action.payload },
        figures: { ...(def.defaultConfig.figures ?? {}) },
      }
    }
    case 'RESET_FIGURES': {
      // Resets every entry in `state.figures` to its default. For Gallery
      // tilings, the per-Tile-type default lives on `TILINGS[type].defaultConfig.figures`
      // (entries not present in that map fall through to DEFAULT_EDITOR_FIGURE).
      // For Builder Patches (`tiling.type === 'editor'`) there's no per-tiling
      // default — every entry resets to DEFAULT_EDITOR_FIGURE.
      const def = TILINGS[state.tiling.type]
      const tilingDefaults = def?.defaultConfig.figures ?? {}
      const next: Record<string, FigureConfig> = {}
      for (const id of Object.keys(state.figures)) {
        next[id] = tilingDefaults[id]
          ? { ...tilingDefaults[id] }
          : { ...DEFAULT_EDITOR_FIGURE }
      }
      return { ...state, figures: next }
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
    case 'SET_FIGURE_ROUTING':
      return { ...state, figureRouting: action.payload }
    case 'LOAD_CONFIG': {
      // Clean up already-polluted saves on load: drop figure keys that
      // aren't tile types of the loaded tiling. No-op for Builder configs.
      const cfg = action.payload
      return { ...cfg, figures: pruneFigures(cfg.figures, cfg.tiling.type) }
    }
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
    case 'SET_EDITOR_ALTERNATE_BOUNDARY': {
      // Single-cell: flip the sole Cell's Boundary by π/n (`alternateBoundary`)
      // — the Cell + its lattice rotate together (see `lattice.ts`).
      //
      // Multi-cell: a per-Cell flip would spin each Cell on the spot by its own
      // π/n, breaking the shared lattice. Instead set a Patch-level flag and
      // rotate the whole composite rigidly by one Configuration angle
      // (`patchRotation`). Clear any stale per-Cell flags so the two mechanisms
      // don't compound.
      if (!state.editor) return state
      if (state.editor.cells.length > 1) {
        const cells = state.editor.cells.map(c => ({ ...c, alternateBoundary: false }))
        return applyWrap({
          ...state,
          editor: { ...state.editor, cells, alternateOrientation: action.payload },
        })
      }
      const cells = state.editor.cells.map(c => ({ ...c, alternateBoundary: action.payload }))
      return applyWrap({
        ...state,
        editor: { ...state.editor, cells },
      })
    }
    case 'SET_CELL_SEED_SIDES': {
      if (!state.editor) return state
      const sides = Math.max(3, Math.floor(action.payload))
      // Changing Seed sides invalidates any placed/completed Tiles built on
      // the previous Seed Tile's edges. Reset the active Cell to the new
      // Seed Tile only. With `noSeed` on, the Cell stays empty — the field
      // still tracks `seedSides` so toggling no-Seed back off restores the
      // user's preferred Seed shape.
      const edgeLength = state.editor.edgeLength
      return applyWrap(seedFigures(updateActiveCell(state, cell => ({
        ...cell,
        seedSides: sides,
        tiles: cell.noSeed ? [] : [createSeedTile(sides, edgeLength)],
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
    case 'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION': {
      // Step 17.12 — boundary-inward placement. Standard part of Design Phase,
      // works on the active Cell of a single-cell Patch OR a multi-cell
      // Configuration (the active-Cell pane swap picks which Cell is edited).
      //
      // The placed Tile is sized to the Patch's shared seed/lattice edge length
      // so every placement method (vertex / edge / section) stays one uniform
      // size (user decision 2026-05-31). Placement no longer rescales
      // `patch.edgeLength` — that earlier "first tile dictates edge length"
      // reset is what made later vertex/edge placements drift from the seed.
      if (!state.editor) return state
      const { edgeIndex, sectionIndex, sides } = action.payload
      const patch = state.editor
      const cell = activeCell(patch)
      const patchEdgeLength = patch.edgeLength
      const sections = computeBoundarySections(cell)
      const section = sections.find(s => s.edgeIndex === edgeIndex && s.sectionIndex === sectionIndex)
      if (!section) return state
      const mode = cell.symmetryMode ?? 'none'
      const idPrefix = `placed-${cell.tiles.length}-${Date.now()}`
      let nextTiles: EditorTile[]
      if (mode === 'none') {
        if (!isBoundarySectionPlacementViable(sides, section, cell, patchEdgeLength)) return state
        const tile = placeRegularNGonOnBoundarySection(sides, section, `${idPrefix}-0`, patchEdgeLength)
        nextTiles = [...cell.tiles, tile]
      } else {
        const placements = placeTilesOnBoundarySectionOrbit(cell, section, sides, idPrefix, patchEdgeLength)
        if (!placements) return state
        nextTiles = [...cell.tiles, ...placements]
      }
      const nextCell: EditorCell = { ...cell, tiles: nextTiles }
      const nextEditor = { ...withActiveCell(patch, nextCell), version: patch.version }
      return applyWrap(seedFigures({ ...state, editor: nextEditor }))
    }
    case 'EDITOR_PLACE_TILE_ON_VERTEX': {
      // Step 17.13b — vertex-anchored placement. Anchors one corner of a
      // regular n-gon at an exposed Cell corner (or an inward-only Boundary
      // corner) at the rotation the picker resolved from
      // `vertexPlacementOrientations`. Single-cell only in v1 to mirror
      // boundary-inward (17.12) — multi-Cell composition support deferred.
      if (!state.editor) return state
      if (state.editor.cells.length > 1) return state
      const { vertexKey, sides, rotation } = action.payload
      const patchEdgeLength = state.editor.edgeLength
      return applyWrap(seedFigures(updateActiveCell(state, cell => {
        const vertices = computeExposedVertices(cell)
        const vertex = vertices.find(v => v.key === vertexKey)
        if (!vertex) return cell
        const mode = cell.symmetryMode ?? 'none'
        const idPrefix = `placed-${cell.tiles.length}-${Date.now()}`
        if (mode === 'none') {
          if (!isVertexPlacementViable(vertex, sides, rotation, patchEdgeLength, cell)) return cell
          const tile = placeRegularNGonOnVertex(sides, patchEdgeLength, vertex, rotation, `${idPrefix}-0`)
          return { ...cell, tiles: [...cell.tiles, tile] }
        }
        const placements = placeTilesOnVertexOrbit(cell, patchEdgeLength, vertex, sides, rotation, idPrefix)
        if (!placements) return cell
        return { ...cell, tiles: [...cell.tiles, ...placements] }
      })))
    }
    case 'SET_CELL_NO_SEED': {
      // Toggle the Seed Tile on/off for the active Cell. Refuse if the Cell
      // holds any non-Seed Tile — mirrors the existing Seed-sides lock
      // pattern (see SET_CELL_SEED_SIDES). Turning on wipes the Seed Tile to
      // empty `tiles: []`; turning off re-adds a Seed at the current
      // `seedSides` + Patch `edgeLength`.
      if (!state.editor) return state
      const cell = activeCell(state.editor)
      const hasNonSeed = cell.tiles.some(t => t.source !== 'seed')
      if (hasNonSeed) return state
      const next = action.payload
      if (next === !!cell.noSeed) return state
      if (next) {
        return seedFigures(updateActiveCell(state, c => ({ ...c, noSeed: true, tiles: [] })))
      }
      const edgeLength = state.editor.edgeLength
      return seedFigures(updateActiveCell(state, c => ({
        ...c,
        noSeed: false,
        tiles: [createSeedTile(c.seedSides, edgeLength)],
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
      const { picks, force } = action.payload
      return multiPickCompleteAcrossPatch(state, picks, force ?? false)
    }
    case 'SET_EDITOR_AUTO_COMPLETE_ENABLED': {
      if (!state.editor) return state
      const prev = state.editor.autoComplete ?? { enabled: false }
      return {
        ...state,
        editor: { ...state.editor, autoComplete: { ...prev, enabled: action.payload } },
      }
    }
    case 'SET_FRAME': {
      if (!state.editor) return state
      // `null` clears the Frame. Setting / replacing stores it on the Patch.
      const frame = action.payload ?? undefined
      return {
        ...state,
        editor: { ...state.editor, frame },
      }
    }
    case 'SET_GALLERY_FRAME': {
      // Gallery clip-only Frame on the top-level `config.frame`. `null` clears
      // it. Independent of the Builder's `editor.frame`.
      const frame = action.payload ?? undefined
      return { ...state, frame }
    }
    case 'EDITOR_PLACE_TILE_ON_FRAME_SECTION': {
      // Step 17 Framing slice 5 — place a regular n-gon flush to a Frame
      // section, tiling the pattern OUT to the frame edge. The Tile is
      // frame-scoped (world space, stored on `frame.completedTiles`) — NOT a
      // Cell Tile, since it doesn't repeat under the Lattice. Stub sections
      // (the < edgeLength remainder) are reserved for the irregular fallback.
      if (!state.editor) return state
      const frame = state.editor.frame
      if (!frame) return state
      const outline = frameOutlinePolygon(frame)
      if (!outline) return state
      const { edgeIndex, sectionIndex, sides } = action.payload
      const sections = computeFrameSections(outline, state.editor.edgeLength)
      const section = sections.find(s => s.edgeIndex === edgeIndex && s.sectionIndex === sectionIndex)
      if (!section || section.isStub) return state
      const existing = frame.completedTiles ?? []
      const tile = placeRegularNGonOnFrameSection(sides, section, `frame-${existing.length}-${Date.now()}`)
      return {
        ...state,
        editor: { ...state.editor, frame: { ...frame, completedTiles: [...existing, tile] } },
      }
    }
    case 'EDITOR_COMPLETE_TO_FRAME': {
      // Step 17 Framing — auto-fill: place the chosen n-gon flush to EVERY full
      // Frame section in one gesture (a clean ring hugging the frame edge),
      // replacing any prior completion Tiles (idempotent / re-runnable). The
      // < edgeLength corner remainders are then closed by the irregular stub
      // fallback (slice 9), so the pattern reaches every corner cleanly.
      if (!state.editor) return state
      const frame = state.editor.frame
      if (!frame) return state
      const outline = frameOutlinePolygon(frame)
      if (!outline) return state
      const { sides } = action.payload
      const stamp = Date.now()
      const tiles = computeFrameSections(outline, state.editor.edgeLength)
        .filter(s => !s.isStub)
        .map((s, i) => placeRegularNGonOnFrameSection(sides, s, `frame-${i}-${stamp}`))
      const stubTiles = frameCornerStubTiles(outline, state.editor.edgeLength, `frame-stub-${stamp}`)
      return {
        ...state,
        editor: { ...state.editor, frame: { ...frame, completedTiles: [...tiles, ...stubTiles] } },
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
      let next: EditorConfig
      switch (action.payload) {
        case '4.8.8':
          next = createDefault488EditorConfig()
          break
        case '3.12.12':
          next = createDefault31212EditorConfig()
          break
        case '4.6.12':
          next = createDefault4612EditorConfig()
          break
        case '3.6.3.6':
          next = createDefault3636EditorConfig()
          break
        case '3.4.6.4':
          next = createDefault3464EditorConfig()
          break
        default:
          // payload === null → leave Configuration, fresh single-cell Patch.
          next = createDefaultEditorConfig()
      }
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
  const patchRot = patchRotation(patch)
  const stamps: (LatticeStamp | null)[] = [null, ...neighbourStampsNear(patch, [pA, pB])]
  for (const stamp of stamps) {
    for (const cell of ordered) {
      const undo = (p: Vec2) =>
        inverseCellTransform(stamp ? inverseRotateTranslate(p, stamp) : p, cell, patchRot)
      const localA = undo(pA)
      const localB = undo(pB)
      const host = stamp === null ? cell : active
      const id = `completed-${host.tiles.length}-${Date.now()}`
      const sourceTile = completeGap(cell, localA, localB, id)
      if (!sourceTile) continue
      const newTile = retargetTile(sourceTile, cell, stamp, host, patchRot)
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
function multiPickCompleteAcrossPatch(state: PatternConfig, picks: Vec2[], force = false): PatternConfig {
  if (!state.editor) return state
  const patch = state.editor
  const active = activeCell(patch)
  if (!picks.every(p => isPatchSelectableVertex(patch, p, true))) return state
  // Non-floating rule: at least one pick must be on a vertex from the user's
  // actual Patch (no neighbour stamps). Rejects polygons built entirely on
  // ghost-stamp vertices.
  if (!picks.some(p => isPatchSelectableVertex(patch, p, false))) return state

  const patchRot = patchRotation(patch)
  const localPicks = picks.map(p => inverseCellTransform(p, active, patchRot))
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
    // Orbit image must also land on selectable vertices — drop silently for
    // asymmetric setups where the orbit branch has no real pick targets.
    const patchLocal = transformed.map(p => applyCellTransform(p, active, patchRot))
    if (!patchLocal.every(p => isPatchSelectableVertex(patch, p, true))) continue
    const c = centroidOf(transformed)
    if (seenCentroids.some(q => pointsEqual(c, q, EDITOR_EPS))) continue
    seenCentroids.push(c)
    const tile = completeNGap(working, transformed, `${idPrefix}-${i}`, force)
    if (!tile) return state
    // Overlap guard against the user's pre-existing Tiles. Sibling orbit
    // placements are intentionally excluded — under non-trivial symmetry
    // modes the orbit images often touch one another at the symmetry axis
    // and the user's intent is that all of them place atomically.
    // `force` bypasses this guard so the user can override false-positives.
    const candidate = tileVertices(tile)
    if (!force && overlapsExisting(candidate, userTiles)) return state
    placements.push(tile)
    working = { ...working, tiles: [...working.tiles, tile] }
  }
  if (placements.length === 0) return state
  return applyWrap(seedFigures(updateActiveCell(state, _ => working)))
}

function centroidOf(verts: Vec2[]): Vec2 {
  let x = 0, y = 0
  for (const v of verts) { x += v.x; y += v.y }
  return { x: x / verts.length, y: y / verts.length }
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
  // With no Tiles to hug, wrap has nothing to compute — skip rather than
  // collapse the boundary to the edgeLength floor (which would shrink the
  // section picker targets along with it).
  if (cell.tiles.length === 0) return state
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
