import type {
  BoundaryShape,
  EditorConfig,
  EditorIrregularTile,
  EditorRegularTile,
  EditorTile,
} from '../types/editor'

/**
 * Step 17.8 — load-time validation + migration scaffold for `EditorConfig`.
 *
 * `migrateEditorConfig` takes an unvalidated value (from JSON / localStorage),
 * checks shape, and returns a clean `EditorConfig` or `null` if the input is
 * unrecoverable. Currently the only valid version is `1`, so migration is
 * shape validation only — but the central function is the intended hook for
 * future version bumps.
 */

const BOUNDARY_SHAPES = new Set<BoundaryShape>(['triangle', 'square', 'hexagon'])

function isVec2(v: unknown): v is { x: number; y: number } {
  return typeof v === 'object' && v !== null
    && typeof (v as { x?: unknown }).x === 'number'
    && typeof (v as { y?: unknown }).y === 'number'
}

function migrateRegularTile(t: Record<string, unknown>): EditorRegularTile | null {
  const sides = t.sides
  const center = t.center
  const edgeLength = t.edgeLength
  const rotation = t.rotation
  const origin = t.origin
  if (typeof t.id !== 'string') return null
  if (typeof sides !== 'number' || sides < 3) return null
  if (!isVec2(center)) return null
  if (typeof edgeLength !== 'number' || edgeLength <= 0) return null
  if (typeof rotation !== 'number') return null
  if (origin !== 'origin' && origin !== 'placed' && origin !== 'completed') return null
  return {
    id: t.id,
    kind: 'regular',
    sides,
    center,
    edgeLength,
    rotation,
    origin,
  }
}

function migrateIrregularTile(t: Record<string, unknown>): EditorIrregularTile | null {
  if (typeof t.id !== 'string') return null
  if (!Array.isArray(t.vertices) || t.vertices.length < 3) return null
  const vertices = t.vertices.filter(isVec2)
  if (vertices.length !== t.vertices.length) return null
  if (t.origin !== 'completed') return null
  return {
    id: t.id,
    kind: 'irregular',
    vertices,
    origin: 'completed',
  }
}

function migrateTile(raw: unknown): EditorTile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const t = raw as Record<string, unknown>
  if (t.kind === 'regular') return migrateRegularTile(t)
  if (t.kind === 'irregular') return migrateIrregularTile(t)
  return null
}

export function migrateEditorConfig(raw: unknown): EditorConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  // Future version bumps would dispatch here; for now only v1 is valid.
  if (r.version !== 1) return null

  if (typeof r.boundaryShape !== 'string' || !BOUNDARY_SHAPES.has(r.boundaryShape as BoundaryShape)) {
    return null
  }
  if (typeof r.boundarySize !== 'number' || r.boundarySize <= 0) return null
  if (typeof r.originSides !== 'number' || r.originSides < 3) return null
  if (typeof r.edgeLength !== 'number' || r.edgeLength <= 0) return null
  if (!Array.isArray(r.tiles) || r.tiles.length === 0) return null

  const tiles: EditorTile[] = []
  for (const raw of r.tiles) {
    const tile = migrateTile(raw)
    if (!tile) return null
    tiles.push(tile)
  }
  // The first tile must be the auto-placed origin (Decision 6).
  if (tiles[0].origin !== 'origin') return null

  const out: EditorConfig = {
    version: 1,
    boundaryShape: r.boundaryShape as BoundaryShape,
    boundarySize: r.boundarySize,
    originSides: r.originSides,
    edgeLength: r.edgeLength,
    tiles,
  }
  // Optional fields — keep when valid, drop silently otherwise.
  if (typeof r.alternateBoundary === 'boolean') out.alternateBoundary = r.alternateBoundary
  if (typeof r.wrapBoundary === 'boolean') out.wrapBoundary = r.wrapBoundary
  if (typeof r.autoComplete === 'object' && r.autoComplete !== null) {
    const ac = r.autoComplete as Record<string, unknown>
    if (typeof ac.enabled === 'boolean') {
      out.autoComplete = { enabled: ac.enabled }
    }
  }
  return out
}
