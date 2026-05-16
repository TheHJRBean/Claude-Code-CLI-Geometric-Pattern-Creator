import type {
  BoundaryComposition,
  BoundaryShape,
  BoundaryTile,
  EditorConfig,
  EditorIrregularTile,
  EditorPatch,
  EditorRegularTile,
  EditorTile,
  SymmetryMode,
} from '../types/editor'

const SYMMETRY_MODES = new Set<SymmetryMode>(['full', 'rotation', 'vertical', 'horizontal', 'none'])

/**
 * Step 17.8 — load-time validation + migration scaffold for `EditorConfig`.
 *
 * `migrateEditorConfig` takes an unvalidated value (from JSON / localStorage),
 * checks shape, and returns a clean `EditorConfig` or `null` if the input is
 * unrecoverable. Versions:
 *   - v1 (legacy): single-shape patches, no composition.
 *   - v2: adds the optional `composition` field for multi-tile boundary
 *     configurations (4.8.8 etc.). v1 patches load unchanged into v2 with
 *     `composition` absent.
 */

/** Allowed top-level boundary shapes (single-shape patches). Octagon is
 * intentionally excluded — it only appears inside a multi-tile composition. */
const TOP_LEVEL_BOUNDARY_SHAPES = new Set<BoundaryShape>(['triangle', 'square', 'hexagon'])
/** Boundary shapes that can appear inside a `BoundaryTile`. Octagon allowed. */
const BOUNDARY_TILE_SHAPES = new Set<BoundaryShape>(['triangle', 'square', 'hexagon', 'octagon'])
/** Configuration ids supported by v2. Extend when adding 3.12.12, 4.6.12, … */
const COMPOSITION_IDS = new Set<BoundaryComposition['configurationId']>(['4.8.8'])

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

/**
 * Validate the per-patch fields shared by both single-shape patches and
 * inner `BoundaryTile.patch` patches. Returns the valid patch or `null`.
 *
 * `allowOctagon` controls whether `'octagon'` is accepted for `boundaryShape`
 * — true inside a composition's BoundaryTile, false at the top level.
 */
function migratePatchFields(
  r: Record<string, unknown>,
  allowOctagon: boolean,
): EditorPatch | null {
  const allowedShapes = allowOctagon ? BOUNDARY_TILE_SHAPES : TOP_LEVEL_BOUNDARY_SHAPES
  if (typeof r.boundaryShape !== 'string' || !allowedShapes.has(r.boundaryShape as BoundaryShape)) {
    return null
  }
  if (typeof r.boundarySize !== 'number' || r.boundarySize <= 0) return null
  // Accept legacy `originSides` and current `seedSides`.
  const seedSidesRaw = (r.seedSides !== undefined ? r.seedSides : r.originSides)
  if (typeof seedSidesRaw !== 'number' || seedSidesRaw < 3) return null
  if (typeof r.edgeLength !== 'number' || r.edgeLength <= 0) return null
  if (!Array.isArray(r.tiles) || r.tiles.length === 0) return null

  const tiles: EditorTile[] = []
  for (const rawTile of r.tiles) {
    const tile = migrateTile(rawTile)
    if (!tile) return null
    tiles.push(tile)
  }
  // The first tile must be the auto-placed Seed Tile (Decision 6).
  if (tiles[0].source !== 'seed') return null

  const out: EditorPatch = {
    boundaryShape: r.boundaryShape as BoundaryShape,
    boundarySize: r.boundarySize,
    seedSides: seedSidesRaw,
    edgeLength: r.edgeLength,
    tiles,
  }
  if (typeof r.alternateBoundary === 'boolean') out.alternateBoundary = r.alternateBoundary
  if (typeof r.wrapBoundary === 'boolean') out.wrapBoundary = r.wrapBoundary
  if (typeof r.autoComplete === 'object' && r.autoComplete !== null) {
    const ac = r.autoComplete as Record<string, unknown>
    if (typeof ac.enabled === 'boolean') {
      out.autoComplete = { enabled: ac.enabled }
    }
  }
  if (typeof r.symmetryMode === 'string' && SYMMETRY_MODES.has(r.symmetryMode as SymmetryMode)) {
    out.symmetryMode = r.symmetryMode as SymmetryMode
  }
  if (typeof r.boundaryInward === 'boolean') out.boundaryInward = r.boundaryInward
  return out
}

function migrateBoundaryTile(raw: unknown): BoundaryTile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.length === 0) return null
  if (typeof r.shape !== 'string' || !BOUNDARY_TILE_SHAPES.has(r.shape as BoundaryShape)) return null
  if (typeof r.center !== 'object' || r.center === null) return null
  const c = r.center as Record<string, unknown>
  if (typeof c.x !== 'number' || typeof c.y !== 'number') return null
  if (typeof r.rotation !== 'number') return null
  if (typeof r.patch !== 'object' || r.patch === null) return null
  const patch = migratePatchFields(r.patch as Record<string, unknown>, true)
  if (!patch) return null
  return {
    id: r.id,
    shape: r.shape as BoundaryShape,
    center: { x: c.x, y: c.y },
    rotation: r.rotation,
    patch,
  }
}

function migrateBoundaryComposition(raw: unknown): BoundaryComposition | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.configurationId !== 'string'
    || !COMPOSITION_IDS.has(r.configurationId as BoundaryComposition['configurationId'])) return null
  if (typeof r.edgeLength !== 'number' || r.edgeLength <= 0) return null
  if (typeof r.activeTileId !== 'string') return null
  if (!Array.isArray(r.tiles) || r.tiles.length === 0) return null

  const tiles: BoundaryTile[] = []
  for (const rawTile of r.tiles) {
    const t = migrateBoundaryTile(rawTile)
    if (!t) return null
    tiles.push(t)
  }
  if (!tiles.some(t => t.id === r.activeTileId)) return null

  return {
    configurationId: r.configurationId as BoundaryComposition['configurationId'],
    edgeLength: r.edgeLength,
    activeTileId: r.activeTileId,
    tiles,
  }
}

export function migrateEditorConfig(raw: unknown): EditorConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  // Accept legacy v1 (single-shape only, no composition) and current v2
  // (single-shape OR multi-tile composition). Returning null for an unknown
  // older version would silently break loads — be explicit about each case.
  if (r.version !== 1 && r.version !== 2) return null

  const patch = migratePatchFields(r, false)
  if (!patch) return null

  const out: EditorConfig = {
    version: 2,
    ...patch,
  }

  // Composition is v2-only. v1 patches load as single-shape (composition
  // absent); the wrapper bumps to v2 silently.
  if (r.version === 2 && r.composition !== undefined) {
    const composition = migrateBoundaryComposition(r.composition)
    if (!composition) return null
    out.composition = composition
  }

  return out
}
