import type {
  CellShape,
  ColourRecord,
  ConfigurationId,
  DecorationConfig,
  EditorAutoCompleteSettings,
  EditorCell,
  EditorConfig,
  EditorIrregularTile,
  EditorRegularTile,
  EditorTile,
  FrameConfig,
  FrameShape,
  FrameType,
  GroupingScope,
  SymmetryMode,
  VoidStampRecord,
} from '../types/editor'
import type { StrandLineStyle } from '../types/pattern'

const SYMMETRY_MODES = new Set<SymmetryMode>(['full', 'rotation', 'vertical', 'horizontal', 'none'])
const FRAME_TYPES = new Set<FrameType>(['shape', 'n-ring'])
const FRAME_SHAPES = new Set<FrameShape>(['square', 'pentagon', 'hexagon', 'octagon'])
const FRAME_STROKE_STYLES = new Set<StrandLineStyle>(['solid', 'double', 'triple', 'dashed', 'dotted'])
const GROUPING_SCOPES = new Set<GroupingScope>(['congruent', 'patch', 'cell', 'instance'])

/**
 * Step 17.8 — load-time validation + migration for `EditorConfig`.
 *
 * `migrateEditorConfig` takes an unvalidated value (from JSON / localStorage),
 * validates shape, and returns a clean v3 `EditorConfig` or `null` if the
 * input is unrecoverable. Versions handled:
 *
 *   - v1 (legacy): single-shape Patches with `tiles[]` directly on the
 *     Patch. Wraps into a single Cell with id `'main'`.
 *   - v2 (legacy): adds optional `composition` field with `BoundaryTile[]`.
 *     Single-shape v2 patches wrap like v1. Multi-shape v2 patches collapse
 *     each `BoundaryTile` into one `EditorCell`, lifting the composition's
 *     `configurationId` / `edgeLength` / `activeTileId` onto the Patch.
 *   - v3 (current, ADR-0001): every Patch carries `cells: EditorCell[]`.
 *     Validated and returned as-is.
 */

/** Cell shapes that can appear in a single-cell Patch (excludes octagon). */
const SINGLE_CELL_SHAPES = new Set<CellShape>(['triangle', 'square', 'hexagon'])
/** Cell shapes allowed in any Cell of a multi-cell Patch (octagon + dodecagon included). */
const ANY_CELL_SHAPES = new Set<CellShape>(['triangle', 'square', 'hexagon', 'octagon', 'dodecagon'])
/** Configuration ids supported. */
const CONFIGURATION_IDS = new Set<ConfigurationId>([
  '4.8.8', '3.12.12', '4.6.12', '3.6.3.6', '3.4.6.4', '3.3.3.4.4', '3.3.4.3.4', '3.3.3.3.6',
])

function isVec2(v: unknown): v is { x: number; y: number } {
  return typeof v === 'object' && v !== null
    && typeof (v as { x?: unknown }).x === 'number'
    && typeof (v as { y?: unknown }).y === 'number'
}

/**
 * Read the Tile source. Accepts legacy `origin` field (with `'origin'`
 * value) and current `source` field (with `'seed'` value), so saved data
 * from before the 2026-05-16 vocabulary alignment still loads cleanly.
 */
function readTileSource(t: Record<string, unknown>): 'seed' | 'placed' | 'completed' | null {
  const raw = t.source !== undefined ? t.source : t.origin
  if (raw === 'seed' || raw === 'origin') return 'seed'
  if (raw === 'placed') return 'placed'
  if (raw === 'completed') return 'completed'
  return null
}

/** Tile ids are user-opaque. Normalise the legacy id 'origin' to 'seed' so
 * id comparisons match the new vocabulary. */
function normaliseTileId(id: string): string {
  return id === 'origin' ? 'seed' : id
}

function migrateRegularTile(t: Record<string, unknown>): EditorRegularTile | null {
  const sides = t.sides
  const center = t.center
  const edgeLength = t.edgeLength
  const rotation = t.rotation
  const source = readTileSource(t)
  if (typeof t.id !== 'string') return null
  if (typeof sides !== 'number' || sides < 3) return null
  if (!isVec2(center)) return null
  if (typeof edgeLength !== 'number' || edgeLength <= 0) return null
  if (typeof rotation !== 'number') return null
  if (source === null) return null
  return {
    id: normaliseTileId(t.id),
    kind: 'regular',
    sides,
    center,
    edgeLength,
    rotation,
    source,
  }
}

function migrateIrregularTile(t: Record<string, unknown>): EditorIrregularTile | null {
  if (typeof t.id !== 'string') return null
  if (!Array.isArray(t.vertices) || t.vertices.length < 3) return null
  const vertices = t.vertices.filter(isVec2)
  if (vertices.length !== t.vertices.length) return null
  const source = readTileSource(t)
  if (source !== 'completed') return null
  return {
    id: normaliseTileId(t.id),
    kind: 'irregular',
    vertices,
    source: 'completed',
  }
}

function migrateTile(raw: unknown): EditorTile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const t = raw as Record<string, unknown>
  if (t.kind === 'regular') return migrateRegularTile(t)
  if (t.kind === 'irregular') return migrateIrregularTile(t)
  return null
}

function migrateAutoComplete(raw: unknown): EditorAutoCompleteSettings | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const ac = raw as Record<string, unknown>
  if (typeof ac.enabled !== 'boolean') return undefined
  return { enabled: ac.enabled }
}

/** Step 17 Framing — validate a persisted `FrameConfig`. Unknown / malformed
 * frames drop to `undefined` (no Frame), never crash the load. */
function migrateFrame(raw: unknown): FrameConfig | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (!FRAME_TYPES.has(r.type as FrameType)) return undefined
  const out: FrameConfig = { type: r.type as FrameType }
  if (isVec2(r.origin)) out.origin = { x: r.origin.x, y: r.origin.y }
  if (FRAME_SHAPES.has(r.shape as FrameShape)) out.shape = r.shape as FrameShape
  if (typeof r.size === 'number' && r.size > 0) out.size = r.size
  if (typeof r.aspect === 'number' && r.aspect > 0) out.aspect = r.aspect
  if (typeof r.rotation === 'number') out.rotation = r.rotation
  if (r.boundaryTreatment === 'complete' || r.boundaryTreatment === 'clip') {
    out.boundaryTreatment = r.boundaryTreatment
  }
  // 0 rings = the centre Patch alone (a single-Patch clip), still valid.
  if (typeof r.rings === 'number' && r.rings >= 0) out.rings = Math.floor(r.rings)
  if (Array.isArray(r.completedTiles)) {
    const tiles: EditorTile[] = []
    for (const t of r.completedTiles) {
      const tile = migrateTile(t)
      if (tile) tiles.push(tile)
    }
    if (tiles.length) out.completedTiles = tiles
  }
  if (typeof r.stroke === 'object' && r.stroke !== null) {
    const s = r.stroke as Record<string, unknown>
    if (typeof s.enabled === 'boolean' && typeof s.colour === 'string' && s.colour.length > 0
      && typeof s.width === 'number' && s.width > 0) {
      out.stroke = { enabled: s.enabled, colour: s.colour, width: s.width }
      if (FRAME_STROKE_STYLES.has(s.lineStyle as StrandLineStyle)) {
        out.stroke.lineStyle = s.lineStyle as StrandLineStyle
      }
    }
  }
  return out
}

/** Step 19 — validate one persisted `ColourRecord`. Invalid records are
 * dropped (returns null), never crash the load. */
function migrateColourRecord(raw: unknown): ColourRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!GROUPING_SCOPES.has(r.scope as GroupingScope)) return null
  if (typeof r.key !== 'string' || r.key.length === 0) return null
  if (typeof r.colour !== 'string' || r.colour.length === 0) return null
  return { scope: r.scope as GroupingScope, key: r.key, colour: r.colour }
}

/** Step 19 — validate a persisted `DecorationConfig` (ADR-0005). Malformed
 * decoration drops to `undefined` (no decoration), never crashes the load.
 * Individual bad colour records are filtered out rather than failing the
 * whole block. */
function migrateDecoration(raw: unknown): DecorationConfig | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return undefined
  const readRecords = (v: unknown): ColourRecord[] => {
    if (!Array.isArray(v)) return []
    const out: ColourRecord[] = []
    for (const rec of v) {
      const record = migrateColourRecord(rec)
      if (record) out.push(record)
    }
    return out
  }
  const out: DecorationConfig = {
    version: 1,
    strandColours: readRecords(r.strandColours),
    voidFills: readRecords(r.voidFills),
  }
  if (Array.isArray(r.voidStamps)) {
    const stamps: VoidStampRecord[] = []
    for (const rec of r.voidStamps) {
      const stamp = migrateVoidStamp(rec)
      if (stamp) stamps.push(stamp)
    }
    if (stamps.length > 0) out.voidStamps = stamps
  }
  return out
}

/** Validate one persisted `VoidStampRecord`; invalid records are dropped. */
function migrateVoidStamp(raw: unknown): VoidStampRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!GROUPING_SCOPES.has(r.scope as GroupingScope)) return null
  if (typeof r.key !== 'string' || r.key.length === 0) return null
  if (typeof r.image !== 'string' || !r.image.startsWith('data:image/')) return null
  if (typeof r.width !== 'number' || !(r.width > 0)) return null
  if (typeof r.height !== 'number' || !(r.height > 0)) return null
  if (r.fit !== 'cover' && r.fit !== 'contain') return null
  const out: VoidStampRecord = { scope: r.scope as GroupingScope, key: r.key, image: r.image, width: r.width, height: r.height, fit: r.fit }
  // Optional Focus-mode adjustment — a malformed transform is stripped (the
  // stamp survives at its base fit) rather than dropping the whole record.
  if (typeof r.transform === 'object' && r.transform !== null) {
    const t = r.transform as Record<string, unknown>
    if (
      typeof t.offsetX === 'number' && Number.isFinite(t.offsetX)
      && typeof t.offsetY === 'number' && Number.isFinite(t.offsetY)
      && typeof t.scale === 'number' && Number.isFinite(t.scale) && t.scale > 0
      && typeof t.rotation === 'number' && Number.isFinite(t.rotation)
    ) {
      out.transform = { offsetX: t.offsetX, offsetY: t.offsetY, scale: t.scale, rotation: t.rotation }
    }
  }
  return out
}

/**
 * v3 Cell validator. Used both for top-level v3 patches (where
 * `allowOctagon` follows whether the Patch is multi-cell) and for v2-tile →
 * Cell collapse during migration.
 */
function migrateCell(raw: unknown, allowOctagon: boolean): EditorCell | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const allowedShapes = allowOctagon ? ANY_CELL_SHAPES : SINGLE_CELL_SHAPES
  if (typeof r.id !== 'string' || r.id.length === 0) return null
  if (typeof r.shape !== 'string' || !allowedShapes.has(r.shape as CellShape)) return null
  if (!isVec2(r.center)) return null
  if (typeof r.rotation !== 'number') return null
  if (typeof r.boundarySize !== 'number' || r.boundarySize <= 0) return null
  if (typeof r.seedSides !== 'number' || r.seedSides < 3) return null
  // `noSeed === true` allows an empty Cell. Otherwise the first Tile must be
  // the auto-placed Seed Tile (Decision 6, relaxed under noSeed).
  const noSeed = r.noSeed === true
  if (!Array.isArray(r.tiles)) return null
  if (!noSeed && r.tiles.length === 0) return null

  const tiles: EditorTile[] = []
  for (const rawTile of r.tiles) {
    const tile = migrateTile(rawTile)
    if (!tile) return null
    tiles.push(tile)
  }
  if (!noSeed && tiles[0].source !== 'seed') return null

  const cell: EditorCell = {
    id: r.id,
    shape: r.shape as CellShape,
    center: { x: (r.center as { x: number; y: number }).x, y: (r.center as { x: number; y: number }).y },
    rotation: r.rotation,
    boundarySize: r.boundarySize,
    seedSides: r.seedSides,
    tiles,
  }
  if (typeof r.alternateBoundary === 'boolean') cell.alternateBoundary = r.alternateBoundary
  if (typeof r.wrapBoundary === 'boolean') cell.wrapBoundary = r.wrapBoundary
  if (typeof r.symmetryMode === 'string' && SYMMETRY_MODES.has(r.symmetryMode as SymmetryMode)) {
    cell.symmetryMode = r.symmetryMode as SymmetryMode
  }
  if (noSeed) cell.noSeed = true
  return cell
}

/**
 * Build an `EditorCell` from a v1 / v2 single-shape Patch's flat field set.
 * Legacy field names are honoured: `boundaryShape`, `boundarySize`,
 * `seedSides` (or `originSides`), `alternateBoundary`, `wrapBoundary`,
 * `symmetryMode`, `noSeed`. The Cell sits at the Patch origin with
 * rotation 0 and id `'main'`.
 */
function legacyPatchFieldsToCell(r: Record<string, unknown>, allowOctagon: boolean): EditorCell | null {
  const allowedShapes = allowOctagon ? ANY_CELL_SHAPES : SINGLE_CELL_SHAPES
  if (typeof r.boundaryShape !== 'string' || !allowedShapes.has(r.boundaryShape as CellShape)) return null
  if (typeof r.boundarySize !== 'number' || r.boundarySize <= 0) return null
  const seedSidesRaw = r.seedSides !== undefined ? r.seedSides : r.originSides
  if (typeof seedSidesRaw !== 'number' || seedSidesRaw < 3) return null
  const noSeed = r.noSeed === true
  if (!Array.isArray(r.tiles)) return null
  if (!noSeed && r.tiles.length === 0) return null

  const tiles: EditorTile[] = []
  for (const rawTile of r.tiles) {
    const tile = migrateTile(rawTile)
    if (!tile) return null
    tiles.push(tile)
  }
  if (!noSeed && tiles[0].source !== 'seed') return null

  const cell: EditorCell = {
    id: 'main',
    shape: r.boundaryShape as CellShape,
    center: { x: 0, y: 0 },
    rotation: 0,
    boundarySize: r.boundarySize,
    seedSides: seedSidesRaw,
    tiles,
  }
  if (typeof r.alternateBoundary === 'boolean') cell.alternateBoundary = r.alternateBoundary
  if (typeof r.wrapBoundary === 'boolean') cell.wrapBoundary = r.wrapBoundary
  if (typeof r.symmetryMode === 'string' && SYMMETRY_MODES.has(r.symmetryMode as SymmetryMode)) {
    cell.symmetryMode = r.symmetryMode as SymmetryMode
  }
  if (noSeed) cell.noSeed = true
  return cell
}

/**
 * Build an `EditorCell` from a v2 `BoundaryTile` (one entry in
 * `composition.tiles`). Reuses the inner patch's legacy field set, but the
 * Cell adopts the BoundaryTile's `id`, `center`, `rotation`, and shape.
 */
function v2BoundaryTileToCell(raw: unknown): EditorCell | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.length === 0) return null
  if (typeof r.shape !== 'string' || !ANY_CELL_SHAPES.has(r.shape as CellShape)) return null
  if (!isVec2(r.center)) return null
  if (typeof r.rotation !== 'number') return null
  if (typeof r.patch !== 'object' || r.patch === null) return null

  const innerCell = legacyPatchFieldsToCell(r.patch as Record<string, unknown>, true)
  if (!innerCell) return null

  // Override the synthesised default fields with the BoundaryTile's own
  // identity / placement; the inner patch's `boundaryShape` is irrelevant
  // (the BoundaryTile's `shape` is authoritative).
  return {
    ...innerCell,
    id: r.id,
    shape: r.shape as CellShape,
    center: { x: (r.center as { x: number; y: number }).x, y: (r.center as { x: number; y: number }).y },
    rotation: r.rotation,
  }
}

function isConfigurationId(s: unknown): s is ConfigurationId {
  return typeof s === 'string' && CONFIGURATION_IDS.has(s as ConfigurationId)
}

function migrateV3(r: Record<string, unknown>): EditorConfig | null {
  if (!Array.isArray(r.cells) || r.cells.length === 0) return null
  if (typeof r.activeCellId !== 'string') return null
  if (typeof r.edgeLength !== 'number' || r.edgeLength <= 0) return null

  const allowOctagon = r.cells.length > 1
  const cells: EditorCell[] = []
  for (const rawCell of r.cells) {
    const cell = migrateCell(rawCell, allowOctagon)
    if (!cell) return null
    cells.push(cell)
  }
  if (!cells.some(c => c.id === r.activeCellId)) return null

  const out: EditorConfig = {
    version: 3,
    cells,
    activeCellId: r.activeCellId,
    edgeLength: r.edgeLength,
  }
  if (isConfigurationId(r.configuration)) out.configuration = r.configuration
  if (typeof r.presetId === 'string' && r.presetId.length > 0) out.presetId = r.presetId
  const ac = migrateAutoComplete(r.autoComplete)
  if (ac) out.autoComplete = ac
  const frame = migrateFrame(r.frame)
  if (frame) out.frame = frame
  const decoration = migrateDecoration(r.decoration)
  if (decoration) out.decoration = decoration
  // Multi-cell alternate moved from per-Cell `alternateBoundary` to the
  // Patch-level `alternateOrientation` (rigid whole-Patch rotation). Convert
  // legacy multi-cell patches that still carry the per-Cell flag, and clear it
  // so the two mechanisms don't compound.
  if (cells.length > 1) {
    const legacyAlternate = cells.some(c => c.alternateBoundary)
    if (r.alternateOrientation === true || legacyAlternate) {
      out.alternateOrientation = true
      out.cells = cells.map(c => ({ ...c, alternateBoundary: false }))
    }
  }
  return out
}

function migrateV2Composition(r: Record<string, unknown>): EditorConfig | null {
  const composition = r.composition as Record<string, unknown>
  if (!isConfigurationId(composition.configurationId)) return null
  if (typeof composition.edgeLength !== 'number' || composition.edgeLength <= 0) return null
  if (typeof composition.activeTileId !== 'string') return null
  if (!Array.isArray(composition.tiles) || composition.tiles.length === 0) return null

  const cells: EditorCell[] = []
  for (const rawTile of composition.tiles) {
    const cell = v2BoundaryTileToCell(rawTile)
    if (!cell) return null
    cells.push(cell)
  }
  if (!cells.some(c => c.id === composition.activeTileId)) return null

  const out: EditorConfig = {
    version: 3,
    cells,
    activeCellId: composition.activeTileId,
    edgeLength: composition.edgeLength,
    configuration: composition.configurationId,
  }
  // v2 carried autoComplete on the wrapper / inner patches; if the wrapper
  // had it, lift to Patch-level (the new home in v3).
  const ac = migrateAutoComplete(r.autoComplete)
  if (ac) out.autoComplete = ac
  return out
}

function migrateV1V2Single(r: Record<string, unknown>): EditorConfig | null {
  const cell = legacyPatchFieldsToCell(r, false)
  if (!cell) return null
  if (typeof r.edgeLength !== 'number' || r.edgeLength <= 0) return null
  const out: EditorConfig = {
    version: 3,
    cells: [cell],
    activeCellId: 'main',
    edgeLength: r.edgeLength,
  }
  const ac = migrateAutoComplete(r.autoComplete)
  if (ac) out.autoComplete = ac
  return out
}

export function migrateEditorConfig(raw: unknown): EditorConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  if (r.version === 3) return migrateV3(r)
  if (r.version === 2) {
    if (r.composition !== undefined && r.composition !== null) return migrateV2Composition(r)
    return migrateV1V2Single(r)
  }
  if (r.version === 1) return migrateV1V2Single(r)
  return null
}

