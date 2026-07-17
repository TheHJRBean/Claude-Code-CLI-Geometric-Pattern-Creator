import type { FigureConfig, MorphBoundary, MorphConfig, PatternConfig, StrandLineStyle, StrandStyle, TilingConfig } from '../types/pattern'
import type { FrameConfig, FrameShape } from '../types/editor'
import { migrateEditorConfig } from '../editor/migrations'
import { MIN_FRAME_SIZE, MAX_FRAME_SIZE, DEFAULT_FRAME_SIZE } from '../editor/frame'

/**
 * Step 17.8 — load-time validation for `PatternConfig`. Used by `loadJSON`
 * (file import) and the config library (localStorage) so malformed or
 * future-shape input rejects with a clear error rather than crashing the
 * render pipeline.
 *
 * Editor patches are validated through `migrateEditorConfig` (the version
 * dispatch hook). All other categories pass through as-is — they were
 * already serialised wholesale and the live tree's reducer treats them
 * permissively.
 */

const RETIRED_TILING_TYPES = new Set(['layered-mandala', 'composition'])

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

function isTilingConfig(v: unknown): v is TilingConfig {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return typeof t.type === 'string' && typeof t.scale === 'number'
}

function isFiguresMap(v: unknown): v is Record<string, FigureConfig> {
  if (typeof v !== 'object' || v === null) return false
  return Object.values(v as Record<string, unknown>).every(f =>
    typeof f === 'object' && f !== null && typeof (f as { contactAngle?: unknown }).contactAngle === 'number',
  )
}

/**
 * Coerce legacy rosette figure entries to star. The rosette figure type was
 * removed in 2026-05-11; old saved configs may still carry `type: 'rosette'`
 * along with `rosetteQ` / `rosetteS` fields. Drop the petal fields and force
 * `type` back to 'star' so PIC renders them as plain stars.
 */
function coerceLegacyFigures(figures: Record<string, FigureConfig>): Record<string, FigureConfig> {
  const out: Record<string, FigureConfig> = {}
  for (const [key, fig] of Object.entries(figures)) {
    const { rosetteQ: _q, rosetteS: _s, ...rest } = fig as FigureConfig & { rosetteQ?: number; rosetteS?: number }
    out[key] = { ...rest, type: 'star' }
  }
  return out
}

/**
 * Read a `StrandStyle` from raw JSON.
 *
 * Accepts two shapes:
 *   - Current: `{ width, color, background, weave?, weaveGap? }` keyed
 *     under `strand`.
 *   - Legacy `lacing`: `{ strandWidth, strandColor, gapColor, enabled,
 *     gapWidth }` — migrated to the current shape; `enabled`/`gapWidth`
 *     map onto the reintroduced weave fields.
 *
 * Returns `null` if neither shape parses.
 */
const STRAND_LINE_STYLES = new Set<StrandLineStyle>(['solid', 'double', 'triple', 'dashed', 'dotted'])

function readStrandStyle(r: Record<string, unknown>): StrandStyle | null {
  const direct = r.strand as Record<string, unknown> | undefined
  if (direct && typeof direct === 'object') {
    if (typeof direct.width === 'number'
      && typeof direct.color === 'string'
      && typeof direct.background === 'string') {
      const out: StrandStyle = { width: direct.width, color: direct.color, background: direct.background }
      if (typeof direct.weave === 'boolean') out.weave = direct.weave
      if (typeof direct.weaveGap === 'number') out.weaveGap = direct.weaveGap
      if (STRAND_LINE_STYLES.has(direct.lineStyle as StrandLineStyle)) {
        out.lineStyle = direct.lineStyle as StrandLineStyle
      }
      return out
    }
  }
  const legacy = r.lacing as Record<string, unknown> | undefined
  if (legacy && typeof legacy === 'object') {
    if (typeof legacy.strandWidth === 'number'
      && typeof legacy.strandColor === 'string'
      && typeof legacy.gapColor === 'string') {
      const out: StrandStyle = {
        width: legacy.strandWidth,
        color: legacy.strandColor,
        background: legacy.gapColor,
      }
      if (typeof legacy.enabled === 'boolean') out.weave = legacy.enabled
      if (typeof legacy.gapWidth === 'number') out.weaveGap = legacy.gapWidth
      return out
    }
  }
  return null
}

const FRAME_SHAPES = new Set<FrameShape>(['square', 'pentagon', 'hexagon', 'octagon'])

/**
 * Read the top-level Gallery `frame`. Only clip-only **Shape Frames** are
 * valid here — n-ring / unknown shapes are dropped silently (unlike the
 * editor patch, a missing Gallery Frame is harmless, so we degrade rather
 * than throw). Fields are clamped/defaulted so a hand-edited save can't feed
 * a degenerate outline into the clip path.
 */
function readGalleryFrame(v: unknown): FrameConfig | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const f = v as Record<string, unknown>
  if (f.type !== 'shape') return undefined
  if (typeof f.shape !== 'string' || !FRAME_SHAPES.has(f.shape as FrameShape)) return undefined
  const rawSize = typeof f.size === 'number' ? f.size : DEFAULT_FRAME_SIZE
  const out: FrameConfig = {
    type: 'shape',
    shape: f.shape as FrameShape,
    size: Math.min(MAX_FRAME_SIZE, Math.max(MIN_FRAME_SIZE, rawSize)),
    aspect: typeof f.aspect === 'number' && f.aspect > 0 ? f.aspect : 1,
    rotation: typeof f.rotation === 'number' ? f.rotation : 0,
  }
  if (f.origin && typeof f.origin === 'object') {
    const o = f.origin as Record<string, unknown>
    if (typeof o.x === 'number' && typeof o.y === 'number') out.origin = { x: o.x, y: o.y }
  }
  if (f.stroke && typeof f.stroke === 'object') {
    const s = f.stroke as Record<string, unknown>
    if (typeof s.enabled === 'boolean' && typeof s.colour === 'string' && s.colour.length > 0
      && typeof s.width === 'number' && s.width > 0) {
      out.stroke = { enabled: s.enabled, colour: s.colour, width: s.width }
    }
  }
  return out
}

/**
 * Read the top-level `morph` (Step 20). Mirrors the Gallery-frame policy:
 * degrade rather than throw — a dropped morph renders the base pattern, which
 * is harmless next to a failed load. Fields are normalised so a hand-edited
 * save can't feed a degenerate field into the per-edge θ evaluation:
 * unknown mode ⇒ drop; non-finite origin/positions ⇒ drop the config/stop;
 * linear direction defaulted to +x and normalised; easing forced 'linear';
 * stop overlays must be objects of objects (contents stay permissive, like
 * `figures`); stops sorted ascending by position (the evaluator's contract).
 */
function readMorphConfig(v: unknown): MorphConfig | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const m = v as Record<string, unknown>
  if (m.mode !== 'linear' && m.mode !== 'radial') return undefined
  const o = m.origin as Record<string, unknown> | undefined
  if (!o || typeof o !== 'object' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return undefined
  if (!Array.isArray(m.boundaries)) return undefined

  const boundaries: MorphBoundary[] = []
  for (const raw of m.boundaries as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue
    const b = raw as Record<string, unknown>
    if (!Number.isFinite(b.position)) continue
    if (typeof b.figures !== 'object' || b.figures === null) continue
    const figures: Record<string, Partial<FigureConfig>> = {}
    for (const [key, overlay] of Object.entries(b.figures as Record<string, unknown>)) {
      if (typeof overlay === 'object' && overlay !== null) {
        figures[key] = overlay as Partial<FigureConfig>
      }
    }
    boundaries.push({
      id: typeof b.id === 'string' && b.id.length > 0 ? b.id : `morph-${boundaries.length}`,
      position: b.position as number,
      figures,
    })
  }
  boundaries.sort((a, b) => a.position - b.position)

  const out: MorphConfig = {
    enabled: m.enabled === true,
    mode: m.mode,
    origin: { x: o.x as number, y: o.y as number },
    easing: 'linear',
    boundaries,
  }
  if (m.mode === 'linear') {
    const d = m.direction as Record<string, unknown> | undefined
    let dir = { x: 1, y: 0 }
    if (d && typeof d === 'object' && Number.isFinite(d.x) && Number.isFinite(d.y)) {
      const len = Math.hypot(d.x as number, d.y as number)
      if (len > 1e-9) dir = { x: (d.x as number) / len, y: (d.y as number) / len }
    }
    out.direction = dir
  }
  return out
}

/**
 * Validate an unvalidated value as a `PatternConfig`. Throws
 * `ConfigValidationError` with a human-readable message on failure.
 *
 * Editor configs are migrated via `migrateEditorConfig`; if the editor field
 * is present but invalid, the load fails (we don't strip it silently — the
 * user expected to load an editor patch and getting a stripped non-editor
 * config back would be more confusing than an error).
 */
export function loadPatternConfig(raw: unknown): PatternConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigValidationError('File is not a JSON object.')
  }
  const r = raw as Record<string, unknown>

  if (!isTilingConfig(r.tiling)) {
    throw new ConfigValidationError('Missing or malformed `tiling` field.')
  }
  if (RETIRED_TILING_TYPES.has(r.tiling.type)) {
    throw new ConfigValidationError(
      `Tiling type "${r.tiling.type}" was retired in the 2026-05-03 cleanup.`,
    )
  }
  if (!isFiguresMap(r.figures)) {
    throw new ConfigValidationError('Missing or malformed `figures` map.')
  }
  const strand = readStrandStyle(r)
  if (!strand) {
    throw new ConfigValidationError('Missing or malformed `strand` (or legacy `lacing`) style.')
  }

  const out: PatternConfig = {
    tiling: r.tiling,
    figures: coerceLegacyFigures(r.figures),
    strand,
  }
  if (r.edgeAngles && typeof r.edgeAngles === 'object') {
    out.edgeAngles = r.edgeAngles as Record<string, number>
  }
  if (typeof r.smoothTransitions === 'boolean') {
    out.smoothTransitions = r.smoothTransitions
  }
  if (r.editor !== undefined) {
    const editor = migrateEditorConfig(r.editor)
    if (!editor) {
      throw new ConfigValidationError('Editor patch is malformed or from an unsupported schema version.')
    }
    out.editor = editor
  }
  // An editor-typed tiling without an editor field is unrecoverable.
  if (r.tiling.type === 'editor' && !out.editor) {
    throw new ConfigValidationError('Editor tiling missing `editor` payload.')
  }
  const frame = readGalleryFrame(r.frame)
  if (frame) out.frame = frame
  const morph = readMorphConfig(r.morph)
  if (morph) out.morph = morph
  return out
}
