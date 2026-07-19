import type { CurveConfig, CurvePoint, FigureConfig, FigureLineSet, PatternConfig } from '../types/pattern'
import type { CurveTarget } from './actions'
import type { EditorCell, EditorConfig, EditorGuide, EditorGuidePatch, EditorRegularTile, EditorTile } from '../types/editor'
import type { Vec2 } from '../utils/math'
import type { Action } from './actions'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from './defaults'
import {
  createDefault31212EditorConfig,
  createDefault33336EditorConfig,
  createDefault33344EditorConfig,
  createDefault33434EditorConfig,
  createDefault3464EditorConfig,
  createDefault3636EditorConfig,
  createDefault4612EditorConfig,
  createDefault488EditorConfig,
  createDefaultEditorConfig,
  createSeedTile,
  DEFAULT_BOUNDARY_SIZE_BY_SHAPE,
} from '../editor/createDefault'
import { computeExposedEdges } from '../editor/exposedEdges'
import { BOUNDARY_ROTATION, BOUNDARY_SIDES } from '../editor/buildEditorPolygons'
import { isPlacementViable, placeRegularNGonOnEdge } from '../editor/placement'
import { orbitTileIds, placeTilesOnOrbit, placeTilesOnVertexOrbit, transformVertexRotation } from '../editor/orbit'
import {
  computeExposedVertices,
  isVertexPlacementViable,
  makeAnchorVertex,
  placeRegularNGonOnVertex,
} from '../editor/vertexPlacement'
import { completeGap } from '../editor/complete'
import { completeNGap } from '../editor/completeN'
import { boundarySymmetries, applySym } from '../editor/symmetry'
import { autoCompleteCell, fitBoundarySize } from '../editor/autoComplete'
import { computeBoundarySections, isBoundarySectionPlacementViable, placeRegularNGonOnBoundarySection, placeTilesOnBoundarySectionOrbit } from '../editor/boundaryInward'
import { DEFAULT_EDITOR_FIGURE, seedFiguresForEditor } from '../editor/tileTypes'
import { buildMorphBoundary, createDefaultMorph, insertMorphBoundary } from '../editor/morph'
import { activeCell, allCells, cellPlacementEdgeLength } from '../editor/active'
import { clearMaskingRecords } from '../decoration/scopes'
import {
  applyCellTransform,
  existingTilesInHostFrame,
  frameSelectablePoints,
  inverseCellTransform,
  inverseRotateTranslate,
  isPatchSelectableVertex,
  isSelectable,
  neighbourStampsNear,
  retargetTile,
  worldProbeCell,
  worldTileVertexArrays,
} from '../editor/patchSelectable'
import { patchRotation } from '../editor/compositionLattice'
import { overlapsExisting } from '../editor/tileOverlap'
import { tileVertices } from '../editor/exposedEdges'
import type { LatticeStamp } from '../editor/lattice'
import { centroid, pointsEqual } from '../utils/math'
import { EDITOR_EPS } from '../editor/exposedEdges'
import { collectGuideAnchors, type GuideAnchor } from '../editor/guides'

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

/**
 * Drop `config.morph` — used by the structural Patch swaps (fresh Cell set:
 * EDITOR_NEW / EDITOR_CLEAR / SET_BUILDER_CONFIGURATION / multi→single
 * SET_CELL_SHAPE). A Morph's Boundary overlays are keyed by the OLD Patch's
 * tileTypeIds and its stop positions are world-space distances tuned to the
 * old composition, so carrying it across renders stale settings.
 */
function dropMorph(state: PatternConfig): PatternConfig {
  if (!state.morph) return state
  const { morph: _drop, ...rest } = state
  return rest
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

/** Which FigureConfig field a curve mutation writes to. */
function curveField(target: CurveTarget | undefined): 'curve' | 'vertexCurve' {
  return target === 'vertex' ? 'vertexCurve' : 'curve'
}

/** Read the targeted curve config, falling back to a fresh one. */
function curveBase(fig: FigureConfig, target: CurveTarget | undefined, defaultEnabled: boolean): CurveConfig {
  const existing = target === 'vertex' ? fig.vertexCurve : fig.curve
  return existing ?? { enabled: defaultEnabled, points: [{ position: 0.5, offset: 0.2 }] }
}

/** Apply a mutation to the targeted curve config and write it back. */
function updateCurve(
  state: PatternConfig,
  tileTypeId: string,
  target: CurveTarget | undefined,
  defaultEnabled: boolean,
  mutate: (c: CurveConfig) => CurveConfig,
): PatternConfig {
  const fig = getFigure(state, tileTypeId)
  const base = curveBase(fig, target, defaultEnabled)
  return updateFigure(state, tileTypeId, { [curveField(target)]: mutate(base) })
}

/** Max extra line sets per Figure recipe (ticket #42) — enforced here so the
 *  UI cap is authoritative even if a hand-edited config exceeds it. */
const MAX_FIGURE_SETS = 4

/** A collision-free set id within one figure's existing `extraSets`. */
function nextSetId(fig: FigureConfig): string {
  const existing = new Set((fig.extraSets ?? []).map(s => s.id))
  let n = (fig.extraSets?.length ?? 0) + 1
  while (existing.has(`set-${n}`)) n++
  return `set-${n}`
}

/** Merge a patch into a line set, re-pinning `id`/`kind` so a patch can never
 *  rewrite the identity or the emission family (mirrors `mergeGuide`). */
function mergeFigureSet(s: FigureLineSet, patch: Partial<FigureLineSet>): FigureLineSet {
  return { ...s, ...patch, id: s.id, kind: s.kind }
}

/** Apply a Guide popup/drag patch, re-pinning `id`/`kind` so the discriminant
 *  can't be widened and the patch's cross-kind optional fields drop out. */
function mergeGuide(g: EditorGuide, patch: EditorGuidePatch): EditorGuide {
  if (g.kind === 'circle') {
    return { ...g, ...patch, id: g.id, kind: 'circle' }
  }
  return { ...g, ...patch, id: g.id, kind: 'line' }
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
          // Seed the vertex curve from the current (coupled) curve so the
          // switch is seamless and the user can then diverge it.
          vertexCurve: existing.vertexCurve ?? (existing.curve
            ? { ...existing.curve, points: existing.curve.points.map(p => ({ ...p })) }
            : undefined),
        } : {}),
      })
    }
    case 'SET_VERTEX_CONTACT_ANGLE':
      return updateFigure(state, action.payload.tileTypeId, { vertexContactAngle: action.payload.angle })
    case 'SET_VERTEX_LINE_LENGTH':
      return updateFigure(state, action.payload.tileTypeId, { vertexLineLength: action.payload.lineLength })
    case 'SET_VERTEX_AUTO_LINE_LENGTH':
      return updateFigure(state, action.payload.tileTypeId, { vertexAutoLineLength: action.payload.auto })
    case 'SET_CURVE_ENABLED':
      return updateCurve(state, action.payload.tileTypeId, action.payload.target, false,
        curve => ({ ...curve, enabled: action.payload.enabled }))
    case 'SET_CURVE_POINT_COUNT':
      return updateCurve(state, action.payload.tileTypeId, action.payload.target, true, curve => {
        const count = Math.max(1, Math.min(3, action.payload.count))
        const existing = curve.points
        const points: CurvePoint[] = []
        for (let i = 0; i < count; i++) {
          points.push(existing[i] ?? { position: (i + 1) / (count + 1), offset: 0.2 })
        }
        return { ...curve, points }
      })
    case 'SET_CURVE_POINT':
      return updateCurve(state, action.payload.tileTypeId, action.payload.target, true, curve => ({
        ...curve,
        points: curve.points.map((p, i) => (i === action.payload.index ? { ...p, ...action.payload.point } : p)),
      }))
    case 'SET_CURVE_ALTERNATING':
      return updateCurve(state, action.payload.tileTypeId, action.payload.target, true,
        curve => ({ ...curve, alternating: action.payload.alternating }))
    case 'SET_CURVE_DIRECTION':
      return updateCurve(state, action.payload.tileTypeId, action.payload.target, true,
        curve => ({ ...curve, direction: action.payload.direction }))
    case 'ADD_FIGURE_SET': {
      const fig = getFigure(state, action.payload.tileTypeId)
      const existing = fig.extraSets ?? []
      if (existing.length >= MAX_FIGURE_SETS) return state
      // Seed from the primary figure's current θ/length so a fresh set starts
      // as a twin of the primary edge figure; the user then diverges θ. Copy
      // the curve too so a curved primary yields a curved (seamless) twin.
      const seed: FigureLineSet = {
        id: nextSetId(fig),
        kind: action.payload.kind,
        contactAngle: fig.contactAngle,
        lineLength: fig.lineLength,
        autoLineLength: fig.autoLineLength,
      }
      if (fig.curve) seed.curve = { ...fig.curve, points: fig.curve.points.map(p => ({ ...p })) }
      return updateFigure(state, action.payload.tileTypeId, { extraSets: [...existing, seed] })
    }
    case 'UPDATE_FIGURE_SET': {
      const fig = getFigure(state, action.payload.tileTypeId)
      if (!fig.extraSets) return state
      const next = fig.extraSets.map(s =>
        s.id === action.payload.setId ? mergeFigureSet(s, action.payload.patch) : s)
      return updateFigure(state, action.payload.tileTypeId, { extraSets: next })
    }
    case 'REMOVE_FIGURE_SET': {
      const fig = getFigure(state, action.payload.tileTypeId)
      if (!fig.extraSets) return state
      const next = fig.extraSets.filter(s => s.id !== action.payload.setId)
      // Drop the array entirely when empty so the config returns to the
      // byte-identical setless shape.
      return updateFigure(state, action.payload.tileTypeId, { extraSets: next.length ? next : undefined })
    }
    case 'SET_SMOOTH_TRANSITIONS':
      return { ...state, smoothTransitions: action.payload }
    case 'LOAD_CONFIG': {
      // Clean up already-polluted saves on load: drop figure keys that
      // aren't tile types of the loaded tiling. No-op for Builder configs.
      const cfg = action.payload
      return { ...cfg, figures: pruneFigures(cfg.figures, cfg.tiling.type) }
    }
    case 'EDITOR_NEW': {
      const editor = createDefaultEditorConfig()
      return seedFigures({
        ...dropMorph(state),
        tiling: { ...state.tiling, type: 'editor' },
        editor,
      })
    }
    case 'EDITOR_CLEAR': {
      const { editor: _drop, ...rest } = dropMorph(state)
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
        return seedFigures({ ...dropMorph(state), editor: fresh })
      }
      // Single-cell: Tiles are preserved across boundary-shape changes
      // (single-edge placements remain valid under any Boundary). The Cell's
      // boundarySize snaps to the new shape's default.
      return applyWrap(seedFigures(updateCell(state, undefined, cell => ({
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
      // Multi-cell: the slider scales the LATTICE only — the Tiles stay fixed,
      // so dragging it changes the tile-to-lattice ratio (user decision
      // 2026-06-17). All Cell centres scale proportionally, every Cell's
      // boundarySize updates, and `patch.edgeLength` (which drives
      // `compositionCellBasis`) follows, so the lattice constant grows/shrinks
      // while the authored polygons keep their size. A ratio ≠ the flush value
      // deliberately opens gaps (ratio < 1) or overlaps (ratio > 1); shared-edge
      // Strands only cross where edges still meet flush — that gap/overlap is
      // the intended effect of this control, not a bug. (Earlier this scaled
      // the Tiles too, which made the slider a pure zoom — pointless; see
      // `e1beea9`, reverted here.)
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
      return updateCell(state, undefined, cell => ({
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
      const sides = Math.max(3, Math.floor(action.payload.sides))
      // Changing Seed sides invalidates any placed/completed Tiles built on
      // the previous Seed Tile's edges. Reset the target Cell to the new
      // Seed Tile only. With `noSeed` on, the Cell stays empty — the field
      // still tracks `seedSides` so toggling no-Seed back off restores the
      // user's preferred Seed shape.
      return applyWrap(seedFigures(updateCell(state, action.payload.cellId, cell => {
        if (cell.noSeed) return { ...cell, seedSides: sides, tiles: [] }
        // Preserve the current Seed Tile's own edge length + rotation rather
        // than snapping to `patch.edgeLength`. In a composite Patch the
        // boundary-size slider rescales `patch.edgeLength` while leaving each
        // Cell's Seed Tile size untouched (see SET_CELL_BOUNDARY_SIZE), so the
        // two drift apart; reading `patch.edgeLength` here would resize the
        // Seed on a sides change. Fall back to `patch.edgeLength` only when
        // there's no existing Seed to read from.
        const prevSeed = cell.tiles.find(
          (t): t is EditorRegularTile => t.kind === 'regular' && t.source === 'seed',
        )
        const seed = createSeedTile(sides, prevSeed?.edgeLength ?? state.editor!.edgeLength)
        return {
          ...cell,
          seedSides: sides,
          tiles: [{ ...seed, rotation: prevSeed?.rotation ?? seed.rotation }],
        }
      })))
    }
    case 'EDITOR_PLACE_TILE_ON_EDGE': {
      if (!state.editor) return state
      const { tileId, edgeIndex, sides, force, hostCellId } = action.payload
      const patchEdgeLength = state.editor.edgeLength
      return applyWrap(seedFigures(updateCell(state, hostCellId, cell => {
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
          // `force` (flexible-placement): user accepted the overlap warning.
          if (!force && !isPlacementViable(edge, sides, cell, placementEdge)) return cell
          const id = `placed-${cell.tiles.length}-${Date.now()}`
          const tile = placeRegularNGonOnEdge(sides, placementEdge, edge.p1, edge.p2, edge.sourceCenter, id)
          return { ...cell, tiles: [...cell.tiles, tile] }
        }
        const idPrefix = `placed-${cell.tiles.length}-${Date.now()}`
        const placements = placeTilesOnOrbit(cell, placementEdge, edge, sides, idPrefix, force)
        if (!placements) return cell
        return { ...cell, tiles: [...cell.tiles, ...placements] }
      })))
    }
    case 'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION': {
      // Step 17.12 — boundary-inward placement. Standard part of Design Phase,
      // works on any Cell of a single-cell Patch OR a multi-cell Configuration
      // (`hostCellId` routes to the Cell the picked section belongs to).
      //
      // The placed Tile is sized to the Patch's shared seed/lattice edge length
      // so every placement method (vertex / edge / section) stays one uniform
      // size (user decision 2026-05-31). Placement no longer rescales
      // `patch.edgeLength` — that earlier "first tile dictates edge length"
      // reset is what made later vertex/edge placements drift from the seed.
      if (!state.editor) return state
      const { edgeIndex, sectionIndex, sides, force, hostCellId } = action.payload
      const latticeEdgeLength = state.editor.edgeLength
      return applyWrap(seedFigures(updateCell(state, hostCellId, cell => {
        // Size to the Cell's own Tiles, not `patch.edgeLength` — in a multi-cell
        // Patch the latter is the lattice constant after the boundary-size slider,
        // which would make placements far too large (mirrors vertex placement).
        const patchEdgeLength = cellPlacementEdgeLength(cell, latticeEdgeLength, state.editor!.cells)
        const sections = computeBoundarySections(cell)
        const section = sections.find(s => s.edgeIndex === edgeIndex && s.sectionIndex === sectionIndex)
        if (!section) return cell
        const mode = cell.symmetryMode ?? 'none'
        const idPrefix = `placed-${cell.tiles.length}-${Date.now()}`
        if (mode === 'none') {
          // `force` (flexible-placement): user accepted the overlap warning.
          if (!force && !isBoundarySectionPlacementViable(sides, section, cell, patchEdgeLength)) return cell
          const tile = placeRegularNGonOnBoundarySection(sides, section, `${idPrefix}-0`, patchEdgeLength)
          return { ...cell, tiles: [...cell.tiles, tile] }
        }
        const placements = placeTilesOnBoundarySectionOrbit(cell, section, sides, idPrefix, patchEdgeLength, force)
        if (!placements) return cell
        return { ...cell, tiles: [...cell.tiles, ...placements] }
      })))
    }
    case 'EDITOR_PLACE_TILE_ON_VERTEX': {
      // Step 17.13b — vertex-anchored placement. Anchors one corner of a
      // regular n-gon at an exposed Cell corner (or an inward-only Boundary
      // corner) at the rotation the picker resolved from
      // `vertexPlacementOrientations`. Single-cell AND multi-cell: like
      // boundary-inward (17.12) the geometry + orbit are cell-local and
      // cell-scoped, so routing to the host Cell (`hostCellId`) places into the
      // right Cell of a multi-cell Patch without any Patch-level transform.
      if (!state.editor) return state
      const { vertexKey, sides, rotation, force, hostCellId } = action.payload
      const patchEdgeLength = state.editor.edgeLength
      return applyWrap(seedFigures(updateCell(state, hostCellId, cell => {
        // Size to the Cell's own Tiles, not `patch.edgeLength` — in a
        // multi-cell Patch the latter is the lattice constant after the
        // boundary-size slider, which would make placements far too large.
        const placeEdge = cellPlacementEdgeLength(cell, patchEdgeLength, state.editor!.cells)
        const vertices = computeExposedVertices(cell)
        const vertex = vertices.find(v => v.key === vertexKey)
        if (!vertex) return cell
        const mode = cell.symmetryMode ?? 'none'
        const idPrefix = `placed-${cell.tiles.length}-${Date.now()}`
        if (mode === 'none') {
          // `force` (flexible-placement): user accepted the overlap warning.
          if (!force && !isVertexPlacementViable(vertex, sides, rotation, placeEdge, cell)) return cell
          const tile = placeRegularNGonOnVertex(sides, placeEdge, vertex, rotation, `${idPrefix}-0`)
          return { ...cell, tiles: [...cell.tiles, tile] }
        }
        const placements = placeTilesOnVertexOrbit(cell, placeEdge, vertex, sides, rotation, idPrefix, force)
        if (!placements) return cell
        return { ...cell, tiles: [...cell.tiles, ...placements] }
      })))
    }
    case 'EDITOR_PLACE_TILE_ON_ANCHOR': {
      // Guides slice 3 / #33 — place a single regular n-gon at a Guide Anchor
      // (Patch-world coords, full-2π sector). Mirrors `guideCompleteWorldSpace`:
      // non-stamping Anchor → world-space `patch.guideTiles`; stamping Anchor →
      // ordinary Cell Tile in the active Cell.
      if (!state.editor) return state
      const { anchor, sides, rotation, force } = action.payload
      return placeTileOnGuideAnchor(state, anchor, sides, rotation, force ?? false)
    }
    case 'SET_CELL_NO_SEED': {
      // Toggle the Seed Tile on/off for the target Cell. Always allowed (user
      // decision 2026-07-08 — removing the Seed must never be locked): turning
      // on wipes the Cell to empty `tiles: []`, discarding any placed/completed
      // Tiles; turning off re-adds a Seed at the current `seedSides` + Patch
      // `edgeLength`, replacing whatever the Cell held. Undoable
      // (SET_CELL_NO_SEED is in DESIGN_MODE_ACTIONS).
      if (!state.editor) return state
      const { value: next, cellId } = action.payload
      const cell = (cellId && state.editor.cells.find(c => c.id === cellId)) || activeCell(state.editor)
      if (next === !!cell.noSeed) return state
      if (next) {
        return seedFigures(updateCell(state, cellId, c => ({ ...c, noSeed: true, tiles: [] })))
      }
      const patch = state.editor
      return seedFigures(updateCell(state, cellId, c => {
        // Restore a Seed consistent with the Cell's construction. Sizing:
        // the Cell is empty, so read the Patch's true Tile scale off the
        // sibling Cells (the b3a4c09/a171058 convention) — `patch.edgeLength`
        // is the lattice constant, which the boundary-size slider grows away
        // from the Tiles. Rotation: multi-cell Cells carry boundary-matching
        // Seeds (Strands emerge cleanly from the Cell edges), so when the
        // seed shape matches the Boundary use its canonical rotation;
        // single-cell Seeds are created at rotation 0.
        const edgeLength = cellPlacementEdgeLength(c, patch.edgeLength, patch.cells)
        const seed = createSeedTile(c.seedSides, edgeLength)
        const boundaryMatching = patch.cells.length > 1 && c.seedSides === BOUNDARY_SIDES[c.shape]
        return {
          ...c,
          noSeed: false,
          tiles: [boundaryMatching ? { ...seed, rotation: BOUNDARY_ROTATION[c.shape] } : seed],
        }
      }))
    }
    case 'EDITOR_DELETE_TILE': {
      if (!state.editor) return state
      const { tileId } = action.payload
      return applyWrap(updateCell(state, undefined, cell => {
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
    case 'EDITOR_ADD_GUIDE': {
      if (!state.editor) return state
      const guides = [...(state.editor.guides ?? []), action.payload.guide]
      return { ...state, editor: { ...state.editor, guides } }
    }
    case 'EDITOR_UPDATE_GUIDE': {
      // Patch one Guide's fields by id. Fails closed on an unknown id (stale
      // popup / drag against a since-replaced Patch), mirroring updateCell.
      const guides = state.editor?.guides
      if (!state.editor || !guides) return state
      const { guideId, patch } = action.payload
      const idx = guides.findIndex(g => g.id === guideId)
      if (idx === -1) return state
      const next = guides.map(g => (g.id === guideId ? mergeGuide(g, patch) : g))
      return { ...state, editor: { ...state.editor, guides: next } }
    }
    case 'EDITOR_DELETE_GUIDE': {
      const guides = state.editor?.guides
      if (!state.editor || !guides) return state
      const next = guides.filter(g => g.id !== action.payload.guideId)
      if (next.length === guides.length) return state
      // The last delete drops the block entirely (matches migration semantics).
      if (next.length === 0) {
        const { guides: _drop, ...rest } = state.editor
        void _drop
        return { ...state, editor: rest }
      }
      return { ...state, editor: { ...state.editor, guides: next } }
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
    case 'SET_MORPH_ENABLED': {
      // Absent + enabling → create fresh; otherwise just flip the flag
      // without discarding Boundaries (the "keep authoring while previewing
      // off" model — mirrors how Frame stays configured while hidden by
      // nothing in particular; here it's explicit via `enabled`).
      const morph = state.morph ?? createDefaultMorph()
      return { ...state, morph: { ...morph, enabled: action.payload } }
    }
    case 'SET_MORPH_MODE': {
      if (!state.morph) return state
      return { ...state, morph: { ...state.morph, mode: action.payload } }
    }
    case 'SET_MORPH_ORIGIN': {
      if (!state.morph) return state
      return { ...state, morph: { ...state.morph, origin: action.payload } }
    }
    case 'SET_MORPH_DIRECTION': {
      if (!state.morph) return state
      const { x, y } = action.payload
      const len = Math.hypot(x, y)
      if (len < 1e-9) return state
      return { ...state, morph: { ...state.morph, direction: { x: x / len, y: y / len } } }
    }
    case 'ADD_MORPH_BOUNDARY': {
      if (!state.morph) return state
      const boundary = buildMorphBoundary(state, action.payload.position)
      return {
        ...state,
        morph: { ...state.morph, boundaries: insertMorphBoundary(state.morph.boundaries, boundary) },
      }
    }
    case 'SET_MORPH_BOUNDARY_POSITION': {
      if (!state.morph) return state
      const { boundaryId, position } = action.payload
      if (!state.morph.boundaries.some(b => b.id === boundaryId)) return state
      const boundaries = state.morph.boundaries
        .map(b => (b.id === boundaryId ? { ...b, position } : b))
        .sort((a, b) => a.position - b.position)
      return { ...state, morph: { ...state.morph, boundaries } }
    }
    case 'SET_MORPH_BOUNDARY_ANGLE': {
      if (!state.morph) return state
      const { boundaryId, tileTypeId, field, angle } = action.payload
      const idx = state.morph.boundaries.findIndex(b => b.id === boundaryId)
      if (idx === -1) return state
      const boundaries = [...state.morph.boundaries]
      const b = boundaries[idx]
      boundaries[idx] = { ...b, figures: { ...b.figures, [tileTypeId]: { ...b.figures[tileTypeId], [field]: angle } } }
      return { ...state, morph: { ...state.morph, boundaries } }
    }
    case 'DELETE_MORPH_BOUNDARY': {
      if (!state.morph) return state
      const boundaries = state.morph.boundaries.filter(b => b.id !== action.payload.boundaryId)
      if (boundaries.length === state.morph.boundaries.length) return state
      return { ...state, morph: { ...state.morph, boundaries } }
    }
    case 'REMOVE_MORPH': {
      if (!state.morph) return state
      const { morph: _drop, ...rest } = state
      return rest
    }
    case 'SET_DECORATION_VOID_FILL': {
      // Scoped Void Fill (Stage 2): "paint what you see" — clear finer-scope
      // records masking the clicked Void (else, e.g., an instance red keeps
      // winning over a fresh congruent blue and the click looks dead), then
      // upsert by (scope, key). Re-painting a key with its current colour
      // toggles the record off — but only when nothing was unmasked, so a
      // visible change never doubles as a deselect.
      if (!state.editor) return state
      const deco = state.editor.decoration ?? { version: 1 as const, strandColours: [], voidFills: [] }
      const { scope, key, colour, clicked } = action.payload
      const { records: unmasked, removedAny } = clearMaskingRecords(deco.voidFills, scope, key, clicked)
      const existing = unmasked.find(r => r.scope === scope && r.key === key)
      const voidFills = unmasked.filter(r => !(r.scope === scope && r.key === key))
      if (removedAny || !existing || existing.colour.toLowerCase() !== colour.toLowerCase()) {
        voidFills.push({ scope, key, colour })
      }
      return { ...state, editor: { ...state.editor, decoration: { ...deco, voidFills } } }
    }
    case 'SET_DECORATION_STRAND_COLOR': {
      // Scoped Strand colour (Stage 2): same unmask-then-upsert + guarded
      // same-colour toggle as Void fills. `colour: null` removes the record
      // explicitly (panel "Restore strands" path — back to the global strand
      // colour). The colour string `'none'` is the hidden-strand sentinel
      // (panel "Remove strand colour"): it persists as an ordinary record and
      // renders as no stroke, so the Void fills meet underneath it.
      if (!state.editor) return state
      const deco = state.editor.decoration ?? { version: 1 as const, strandColours: [], voidFills: [] }
      const { scope, key, colour, clicked } = action.payload
      const { records: unmasked, removedAny } = clearMaskingRecords(deco.strandColours, scope, key, clicked)
      const existing = unmasked.find(r => r.scope === scope && r.key === key)
      const strandColours = unmasked.filter(r => !(r.scope === scope && r.key === key))
      if (colour !== null && (removedAny || !existing || existing.colour.toLowerCase() !== colour.toLowerCase())) {
        strandColours.push({ scope, key, colour })
      }
      return { ...state, editor: { ...state.editor, decoration: { ...deco, strandColours } } }
    }
    case 'SET_DECORATION_VOID_STAMP': {
      // Void Stamp upsert by (scope, key) — one image per Void group. No
      // masking ladder yet (v1 is congruent-only); re-stamping a key just
      // replaces its image.
      if (!state.editor) return state
      const deco = state.editor.decoration ?? { version: 1 as const, strandColours: [], voidFills: [] }
      const { scope, key } = action.payload
      const voidStamps = (deco.voidStamps ?? []).filter(r => !(r.scope === scope && r.key === key))
      voidStamps.push(action.payload)
      return { ...state, editor: { ...state.editor, decoration: { ...deco, voidStamps } } }
    }
    case 'REMOVE_DECORATION_VOID_STAMP': {
      const deco = state.editor?.decoration
      if (!deco?.voidStamps) return state
      const { scope, key } = action.payload
      const voidStamps = deco.voidStamps.filter(r => !(r.scope === scope && r.key === key))
      if (voidStamps.length === deco.voidStamps.length) return state
      const next = { ...deco }
      if (voidStamps.length > 0) next.voidStamps = voidStamps
      else delete next.voidStamps
      return { ...state, editor: { ...state.editor!, decoration: next } }
    }
    case 'CLEAR_DECORATION': {
      if (!state.editor || !state.editor.decoration) return state
      const { decoration: _drop, ...rest } = state.editor
      return { ...state, editor: rest }
    }
    case 'EDITOR_RUN_AUTO_COMPLETE': {
      if (!state.editor) return state
      return applyWrap(seedFigures(updateCell(state, undefined, cell => {
        const { tiles } = autoCompleteCell(cell)
        // Idempotent on already-convex Cells: reference-equal tiles → no
        // state churn, no figure re-seed.
        if (tiles === cell.tiles) return cell
        return { ...cell, tiles }
      })))
    }
    case 'SET_EDITOR_WRAP_BOUNDARY': {
      if (!state.editor) return state
      // Per-Cell wrap. Toggling on must take effect immediately — otherwise
      // the toggle does nothing visible until the next mutation.
      const { value, cellId } = action.payload
      const next = updateCell(state, cellId, cell => ({ ...cell, wrapBoundary: value }))
      return value ? applyWrap(next) : next
    }
    case 'SET_EDITOR_SYMMETRY_MODE': {
      if (!state.editor) return state
      const { mode: requested, cellId } = action.payload
      return updateCell(state, cellId, cell => {
        // Triangle has no horizontal mirror — coerce the request defensively.
        const mode = requested === 'horizontal' && cell.shape === 'triangle'
          ? 'none'
          : requested
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
        case '3.3.3.4.4':
          next = createDefault33344EditorConfig()
          break
        case '3.3.4.3.4':
          next = createDefault33434EditorConfig()
          break
        case '3.3.3.3.6':
          next = createDefault33336EditorConfig()
          break
        default:
          // payload === null → leave Configuration, fresh single-cell Patch.
          next = createDefaultEditorConfig()
      }
      return seedFigures({
        ...dropMorph(state),
        tiling: { ...state.tiling, type: 'editor' },
        editor: next,
      })
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
 * Update a specific Cell by id (the panel shows a per-Cell control group and
 * placement selections carry their host Cell, so per-Cell mutations carry an
 * explicit `cellId`/`hostCellId`). Falls back to the active Cell when `cellId`
 * is absent — single-cell Patches and back-compat callers.
 *
 * Also focuses the mutated Cell as `activeCellId`. There is no user-facing
 * active-Cell selector any more, but `activeCellId` survives as an internal
 * "representative Cell" pointer that `applyWrap` (boundary fit), the n-ring
 * Frame, and `patchSelectable` still read — so a per-Cell mutation must point
 * it at the Cell being edited or those would target the wrong Cell.
 */
function updateCell(
  state: PatternConfig,
  cellId: string | undefined,
  fn: (cell: EditorCell) => EditorCell,
): PatternConfig {
  if (!state.editor) return state
  let current: EditorCell
  if (cellId) {
    const found = state.editor.cells.find(c => c.id === cellId)
    // Fail closed on a stale/unknown id: mutating the active Cell instead
    // would land the edit in a Cell the user never targeted (e.g. an action
    // carrying a Cell id from a Patch that was since replaced).
    if (!found) return state
    current = found
  } else {
    current = activeCell(state.editor)
  }
  const next = fn(current)
  if (next === current) return state
  return {
    ...state,
    editor: {
      ...state.editor,
      activeCellId: current.id,
      cells: state.editor.cells.map(c => (c.id === current.id ? next : c)),
      version: state.editor.version,
    },
  }
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
  // Frame completion is multi-pick only in v1: a 2-pick chord touching a Frame
  // node has no sensible Cell host (the tile would repeat under the Lattice),
  // so reject it. The user encloses a frame gap with a ≥3-pick polygon instead.
  const framePoints = frameSelectablePoints(patch)
  if (isSelectable(pA, framePoints) || isSelectable(pB, framePoints)) return state
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
  const patchRot = patchRotation(patch)

  // Guide Anchors (slice 3) join the pickable set. A pick is legitimate if it
  // matches a Cell / neighbour / Frame point (existing) OR a Guide Anchor.
  const guideAnchors = collectGuideAnchors(patch, patchRot)
  const guideAnchorAt = (p: Vec2): GuideAnchor | undefined =>
    guideAnchors.find(a => pointsEqual(p, a.p, EDITOR_EPS))
  if (!picks.every(p => isPatchSelectableVertex(patch, p, true) || guideAnchorAt(p))) return state
  // Grounding rule (spec Decision 4 relaxes it): at least one pick must be a
  // real Patch vertex OR a Guide Anchor — so free-standing Anchor-only Completes
  // are allowed, while polygons built purely from neighbour ghosts / Frame
  // nodes are still rejected.
  if (!picks.some(p => isPatchSelectableVertex(patch, p, false) || guideAnchorAt(p))) return state

  // World-space Guide completion: any pick sits on a **non-stamping** Guide
  // Anchor that isn't also a real Cell vertex ⇒ the Tile is world-space and
  // must not repeat under the Lattice. Stored on `patch.guideTiles` (the
  // `frame.completedTiles` model). Stamping-Guide Anchors stay Patch-relative
  // and fall through to the ordinary Cell path below.
  const worldSpaceGuide = picks.some(p => {
    const a = guideAnchorAt(p)
    return a && !a.stamp && !isPatchSelectableVertex(patch, p, false)
  })
  if (worldSpaceGuide && !(patch.frame && picks.some(p => isSelectable(p, frameSelectablePoints(patch))))) {
    return guideCompleteWorldSpace(state, picks, force)
  }

  // Frame-scoped completion: if any pick is a Frame node, the completed Tile
  // sits at the frame edge in world space and must NOT repeat under the Lattice
  // — store it on `frame.completedTiles`, not in a Cell. No symmetry orbit in
  // v1 (frame symmetry-orbit is deferred). Picks are already Patch-world, so
  // the Tile is built directly in world coords.
  if (patch.frame && picks.some(p => isSelectable(p, frameSelectablePoints(patch)))) {
    // World-space vertex arrays of every existing Tile (all Cells) + prior
    // world-space completions (frame + guide), for completeNGap's
    // centroid-inside check and the overlap guard.
    const worldTiles = worldTileVertexArrays(patch, patchRot)
    const probeCell = worldProbeCell(patch, patchRot, worldTiles)
    const id = `frame-${(patch.frame.completedTiles?.length ?? 0)}-${Date.now()}`
    const tile = completeNGap(probeCell, picks, id, force)
    if (!tile) return state
    if (!force && overlapsExisting(tileVertices(tile), worldTiles)) return state
    const completedTiles = [...(patch.frame.completedTiles ?? []), tile]
    return seedFigures({ ...state, editor: { ...patch, frame: { ...patch.frame, completedTiles } } })
  }

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
    // Orbit image must also land on selectable vertices (or Guide Anchors) —
    // drop silently for asymmetric setups where the orbit branch has no real
    // pick targets.
    const patchLocal = transformed.map(p => applyCellTransform(p, active, patchRot))
    if (!patchLocal.every(p => isPatchSelectableVertex(patch, p, true) || guideAnchorAt(p))) continue
    const c = centroid(transformed)
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
  return applyWrap(seedFigures(updateCell(state, undefined, _ => working)))
}

/**
 * World-space Guide completion (slice 3, spec Decision 4). The picks include a
 * non-stamping Guide Anchor, so the completed Tile lives in world coords and
 * must not repeat under the Lattice — stored on `patch.guideTiles`, mirroring
 * the frame-scoped completion path. Free-standing (Anchor-only, touching no
 * existing Tile) is allowed. No symmetry orbit (world-space Guides draw as
 * singles); overlap rides the flexible-placement `force` gate.
 */
function guideCompleteWorldSpace(state: PatternConfig, picks: Vec2[], force: boolean): PatternConfig {
  if (!state.editor) return state
  const patch = state.editor
  const patchRot = patchRotation(patch)
  // World-space vertex arrays of every existing Tile (all Cells) + prior
  // world-space completions (frame + guide), for the centroid-inside check and
  // the overlap guard.
  const worldTiles = worldTileVertexArrays(patch, patchRot)
  const probeCell = worldProbeCell(patch, patchRot, worldTiles)
  const id = `guide-${(patch.guideTiles?.length ?? 0)}-${Date.now()}`
  const tile = completeNGap(probeCell, picks, id, force)
  if (!tile) return state
  if (!force && overlapsExisting(tileVertices(tile), worldTiles)) return state
  const guideTiles = [...(patch.guideTiles ?? []), tile]
  return seedFigures({ ...state, editor: { ...patch, guideTiles } })
}

/**
 * Place a single regular n-gon at a Guide Anchor (Guides slice 3 / #33). The
 * `anchor` point is Patch-world coords; the reducer re-derives the Anchor from
 * `collectGuideAnchors` (fails closed on a stale pick) to read its stamp flag.
 * Non-stamping Anchor → world-space `patch.guideTiles` (never repeats under the
 * Lattice — the frame-completion model); stamping Anchor → an ordinary Cell
 * Tile in the active Cell (converted from the world-frame placement). Overlap
 * against every world Tile rides the flexible-placement `force` gate.
 */
function placeTileOnGuideAnchor(
  state: PatternConfig,
  anchor: Vec2,
  sides: number,
  rotation: number,
  force: boolean,
): PatternConfig {
  if (!state.editor) return state
  const patch = state.editor
  const patchRot = patchRotation(patch)
  const guideAnchor = collectGuideAnchors(patch, patchRot).find(a => pointsEqual(anchor, a.p, EDITOR_EPS))
  if (!guideAnchor) return state
  const active = activeCell(patch)
  // World-space vertex arrays of every existing Tile (all Cells) + prior
  // world-space completions (frame + guide), for the overlap probe.
  const probeCell = worldProbeCell(patch, patchRot)
  // Size to the active Cell's own Tiles, not `patch.edgeLength` — in a
  // multi-cell Patch the latter is the lattice constant after the
  // boundary-size slider, which would make placements far too large (mirrors
  // vertex placement).
  const placeEdge = cellPlacementEdgeLength(active, patch.edgeLength, patch.cells)
  // The Anchor is a free point (no boundary corner), so the full-2π sector +
  // body-overlap probe in `isVertexPlacementViable` is the whole gate.
  const anchorVertex = makeAnchorVertex(guideAnchor.p)
  if (!force && !isVertexPlacementViable(anchorVertex, sides, rotation, placeEdge, probeCell)) return state

  if (guideAnchor.stamp) {
    // Patch-relative Anchor → ordinary Cell Tile(s). Mirrors
    // `EDITOR_PLACE_TILE_ON_VERTEX`'s symmetry-orbit propagation: the orbit
    // runs in the active Cell's local frame (the Anchor is world-space, so
    // convert first), each image is overlap-probed back in world space
    // against the cumulative probe, and placement is all-or-nothing (`force`
    // overrides — symmetry must never partially break). `placeTilesOnVertexOrbit`
    // can't be reused directly: it only accepts orbit images landing on real
    // exposed Cell vertices, and an Anchor is a free point.
    const localAnchor = inverseCellTransform(guideAnchor.p, active, patchRot)
    const localRotation = rotation - active.rotation - patchRot
    const syms = boundarySymmetries(active.shape, active.symmetryMode ?? 'none')
    const idPrefix = `guide-stamp-${active.tiles.length}-${Date.now()}`
    const placements: EditorTile[] = []
    const seenCenters: Vec2[] = []
    let workingProbe = probeCell
    for (let i = 0; i < syms.length; i++) {
      const pLocal = applySym(syms[i], localAnchor)
      const rLocal = transformVertexRotation(syms[i], localRotation, sides)
      const imageVertex = makeAnchorVertex(applyCellTransform(pLocal, active, patchRot))
      const rWorld = rLocal + active.rotation + patchRot
      const candidate = placeRegularNGonOnVertex(sides, placeEdge, imageVertex, rWorld, '__probe__')
      // Axis-fixed orbit images collapse to one Tile (centroid dedupe).
      if (seenCenters.some(c => pointsEqual(c, candidate.center, EDITOR_EPS))) continue
      if (!force && !isVertexPlacementViable(imageVertex, sides, rWorld, placeEdge, workingProbe)) return state
      const worldTile = placeRegularNGonOnVertex(sides, placeEdge, imageVertex, rWorld, `${idPrefix}-${i}`)
      // World → Cell-local convert (inverse of `applyCellTransform`): centre
      // inverse-transforms, rotation subtracts the Cell + Patch rotations.
      placements.push({
        ...worldTile,
        center: inverseCellTransform(worldTile.center, active, patchRot),
        rotation: worldTile.rotation - active.rotation - patchRot,
      })
      seenCenters.push(candidate.center)
      workingProbe = { ...workingProbe, tiles: [...workingProbe.tiles, worldTile] }
    }
    if (placements.length === 0) return state
    return applyWrap(seedFigures(updateCell(state, active.id, cell => ({ ...cell, tiles: [...cell.tiles, ...placements] }))))
  }

  // Non-stamping Anchor → world-space one-off Tile.
  const tile = placeRegularNGonOnVertex(
    sides, placeEdge, anchorVertex, rotation,
    `guide-${(patch.guideTiles?.length ?? 0)}-${Date.now()}`,
  )
  const guideTiles = [...(patch.guideTiles ?? []), tile]
  return seedFigures({ ...state, editor: { ...patch, guideTiles } })
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
  const extraTiles = [
    ...(state.editor.frame?.completedTiles ?? []),
    ...(state.editor.guideTiles ?? []),
  ]
  const figures = seedFiguresForEditor(state.figures, state.editor, extraTiles)
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
  return updateCell(state, undefined, c => ({ ...c, boundarySize: fit }))
}

export { DEFAULT_CONFIG }
