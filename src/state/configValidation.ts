import type { FigureConfig, MorphConfig, MorphOrigin, PatternConfig, StrandLineStyle, StrandStyle, TilingConfig } from '../types/pattern'
import type { FrameConfig, FrameShape } from '../types/editor'
import { migrateDecoration, migrateEditorConfig } from '../editor/migrations'
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
 *
 * `PatternConfig` carries its own `version` (roadmap #6) and this module owns
 * the dispatch — one reader per schema generation, mirroring
 * `editor/migrations.ts`. See `CURRENT_PATTERN_CONFIG_VERSION`.
 */

const RETIRED_TILING_TYPES = new Set(['layered-mandala', 'composition'])

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

/**
 * The `PatternConfig` schema generation this build writes and understands.
 *
 * Generation history:
 * - **0** — pre-versioning: no `version` field at all. Every save written
 *   before 2026-07-30. Identified by *absence*, migrated by the generation-0
 *   branch of `readConfig`: legacy `lacing` → `strand`, the pre-#48
 *   `{ origin, boundaries }` morph → Origins, and the removed rosette figure
 *   type → star.
 * - **1** — current. Adds the `version` field itself; otherwise
 *   content-identical to a *modern-shape* generation-0 save, which is why
 *   slice 1 of #6 was a no-op for existing libraries.
 *
 * Bumping this: add the new number here, add a `case` to the switch in
 * `loadPatternConfig`, and write a reader for the generation you just froze.
 * Do **not** widen the newest reader to also sniff for the new shape — that
 * permanent-shape-probe habit is exactly what versioning exists to end.
 */
export const CURRENT_PATTERN_CONFIG_VERSION = 1

/** The generations `readConfig` knows how to read. */
type ConfigGeneration = 0 | 1

/**
 * Read a config's schema generation.
 *
 * **Absent ⇒ 0**, and that default is load-bearing: every save in every
 * existing library lacks the field and must keep loading byte-for-byte as it
 * did before #6. A non-integer or non-positive `version` is a hand-edit rather
 * than a generation, so it also reads as 0 — the permissive choice, since the
 * generation-0 migrations are no-ops on an already-modern shape.
 */
function readConfigVersion(r: Record<string, unknown>): number {
  const v = r.version
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return 0
  return v
}

/**
 * Every key `readConfig` carries onto its output — the allow-list, named so
 * the dev warning below can be derived from it rather than drift from it.
 */
const PATTERN_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'version', 'tiling', 'figures', 'edgeAngles', 'strand',
  'smoothTransitions', 'editor', 'frame', 'morph', 'decoration',
])

/**
 * Top-level fields `PatternConfig` used to have. A generation-0 save may
 * legitimately still carry these, so they are deliberately-retired keys rather
 * than a forgotten new field, and the warning below stays quiet about them.
 * `lacing` is *consumed* (migrated into `strand`); the rest are genuinely gone
 * with their tiling types (`layered-mandala` / `composition`).
 */
const RETIRED_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'lacing', 'mandala', 'composition', 'figureRouting',
])

/**
 * Dev-only warning naming keys the allow-list is about to drop.
 *
 * `readConfig` builds its output field by field, so a field added to
 * `PatternConfig` but forgotten here is **absent from the returned object** —
 * and because `configLibrary.list()` re-validates every entry on read while
 * the Lab re-persists on every change, one load+save cycle then destroys that
 * field across the user's entire library, silently. The allow-list itself
 * stays (junk must not reach the render path); this just makes the omission
 * loud on the very first load instead of discovered months later.
 *
 * Dev-only because in production a dropped key is either a field we retired on
 * purpose or a newer build's field this one cannot use — neither is actionable
 * by the user.
 */
function warnDroppedKeys(r: Record<string, unknown>, gen: ConfigGeneration): void {
  if (!import.meta.env.DEV) return
  const dropped = Object.keys(r).filter(k =>
    !PATTERN_CONFIG_KEYS.has(k) && !(gen === 0 && RETIRED_CONFIG_KEYS.has(k)),
  )
  if (dropped.length === 0) return
  console.warn(
    `[configValidation] dropping unrecognised PatternConfig key(s): ${dropped.join(', ')}. `
    + 'If one of these is a NEW field, add it to PATTERN_CONFIG_KEYS *and* read it in '
    + 'readConfig — otherwise the next load+save cycle deletes it library-wide.',
  )
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
 * Coerce legacy rosette figure entries to star — **generation 0 only**. The
 * rosette figure type was removed in 2026-05-11; pre-versioning saves may still
 * carry `type: 'rosette'` along with `rosetteQ` / `rosetteS` fields. Drop the
 * petal fields and force `type` back to 'star' so PIC renders them as plain
 * stars.
 *
 * The unconditional force is correct *here* and only here. It used to run on
 * every load, which was a landmine: `FigureConfig.type` is a single-member
 * union today, so it flattens nothing — but the moment a second figure type
 * exists (the rosette epic), an every-load coercion silently destroys it. The
 * version switch is what lets this stay dated instead of becoming permanent;
 * generation 1 uses `readFigures` below.
 */
function coerceLegacyFigures(figures: Record<string, FigureConfig>): Record<string, FigureConfig> {
  const out: Record<string, FigureConfig> = {}
  for (const [key, fig] of Object.entries(figures)) {
    const { rosetteQ: _q, rosetteS: _s, ...rest } = fig as FigureConfig & { rosetteQ?: number; rosetteS?: number }
    out[key] = { ...rest, type: 'star' }
  }
  return out
}

/** Figure types this build renders. Extend when a second one lands. */
const FIGURE_TYPES: ReadonlySet<string> = new Set<FigureConfig['type']>(['star'])

/**
 * Normalise a generation-1 `figures` map.
 *
 * `FigureConfig.type` is required but has only ever had one member, so a save
 * may reasonably omit it: absent or unrecognised ⇒ default to `'star'`, but a
 * **recognised** type is preserved untouched. That distinction is the whole
 * point of splitting this from `coerceLegacyFigures` — adding a member to
 * `FIGURE_TYPES` is then the only change needed to make a new figure type
 * survive a save/load round-trip.
 */
function readFigures(figures: Record<string, FigureConfig>): Record<string, FigureConfig> {
  const out: Record<string, FigureConfig> = {}
  for (const [key, fig] of Object.entries(figures)) {
    out[key] = FIGURE_TYPES.has(fig.type) ? fig : { ...fig, type: 'star' }
  }
  return out
}

/**
 * Read the current `StrandStyle` shape — `{ width, color, background, weave?,
 * weaveGap?, lineStyle?, innerFill? }` keyed under `strand`.
 *
 * Returns `null` if it doesn't parse; callers on the generation-0 path fall
 * back to `readLegacyLacing`.
 */
const STRAND_LINE_STYLES = new Set<StrandLineStyle>(['solid', 'double', 'triple', 'dashed', 'dotted'])

export function readStrandStyle(r: Record<string, unknown>): StrandStyle | null {
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
      if (typeof direct.innerFill === 'string' && direct.innerFill.length > 0) {
        out.innerFill = direct.innerFill
      }
      return out
    }
  }
  return null
}

/**
 * **Generation 0 only** — the pre-`strand` `lacing` block:
 * `{ strandWidth, strandColor, gapColor, enabled, gapWidth }`. Migrated to the
 * current shape, with `enabled`/`gapWidth` mapping onto the reintroduced weave
 * fields.
 */
function readLegacyLacing(r: Record<string, unknown>): StrandStyle | null {
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

/**
 * Strand style for a given generation. Generation 0 accepts the modern shape
 * *or* legacy `lacing` — modern first, because almost every existing save is a
 * modern-shape generation-0 save.
 */
function readStrandForGeneration(r: Record<string, unknown>, gen: ConfigGeneration): StrandStyle | null {
  const direct = readStrandStyle(r)
  if (direct || gen !== 0) return direct
  return readLegacyLacing(r)
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
      if (STRAND_LINE_STYLES.has(s.lineStyle as StrandLineStyle)) {
        out.stroke.lineStyle = s.lineStyle as StrandLineStyle
      }
      if (typeof s.innerFill === 'string' && s.innerFill.length > 0) {
        out.stroke.innerFill = s.innerFill
      }
    }
  }
  return out
}

/**
 * Convert a pre-#48 `boundaries` stop chain into the Origin model.
 *
 * The old field was one sorted stop sequence sharing an IMPLICIT base stop at
 * position 0; each boundary blended from its predecessor. The new model gives
 * every Origin its own base→target ramp. So boundary `i` at `P_i`, whose
 * predecessor sat at `P_{i-1}` (`P_0 = 0`, the implicit stop), becomes an
 * Origin anchored at `P_{i-1}` reaching `|P_i − P_{i-1}|` toward it.
 *
 * **Exact for a single boundary** — by far the common case, and the shape the
 * old UI nudged users into. **Approximate for chains of 2+**: each converted
 * Origin restarts from the live base recipe, where the old chain accumulated
 * stop to stop, so interior segments that ramped target→target now ramp
 * base→target. Deliberate: blending between Origins was explicitly ruled out
 * (nearest-Origin-wins), so an exact chain conversion isn't expressible.
 */
function originsFromLegacyBoundaries(
  boundaries: Array<{ id: string; position: number; figures: Record<string, Partial<FigureConfig>> }>,
): MorphOrigin[] {
  const out: MorphOrigin[] = []
  let prev = 0
  for (const b of boundaries) {
    const step = b.position - prev
    out.push({
      id: b.id,
      position: prev,
      reach: Math.abs(step),
      sides: step < 0 ? 'negative' : 'positive',
      figures: b.figures,
    })
    prev = b.position
  }
  return out.sort((a, b) => a.position - b.position)
}

/**
 * Normalise a raw stop array into `MorphOrigin`s, sorted ascending by position.
 *
 * Shared by the current and pre-#48 morph readers: the two schemas differ in
 * their *key names* and in how `reach`/`sides` are derived, not in how an
 * individual stop is validated. A hand-edited save can't feed a degenerate
 * field into the per-edge θ evaluation — non-finite positions drop the stop,
 * and overlays must be objects of objects (contents stay permissive, like
 * `figures`).
 */
function readMorphStops(rawStops: unknown[]): MorphOrigin[] {
  const stops: MorphOrigin[] = []
  for (const raw of rawStops) {
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
    // Legacy stops carry neither field; `originsFromLegacyBoundaries` derives
    // both, so the defaults here only ever backstop a hand-edited save.
    const sides = b.sides === 'both' || b.sides === 'negative' || b.sides === 'positive' ? b.sides : 'both'
    const stop: MorphOrigin = {
      id: typeof b.id === 'string' && b.id.length > 0 ? b.id : `morph-${stops.length}`,
      position: b.position as number,
      reach: Number.isFinite(b.reach) ? Math.max(0, b.reach as number) : 0,
      sides,
      figures,
    }
    // Additive (#49); absent ⇒ manual, so pre-#49 saves render unchanged.
    if (b.autoReach === true) stop.autoReach = true
    stops.push(stop)
  }
  stops.sort((a, b) => a.position - b.position)
  return stops
}

/** Assemble the non-stop morph fields. `easing` is forced 'linear' (the only
 *  member); a linear direction is defaulted to +x and normalised. */
function buildMorphConfig(
  m: Record<string, unknown>,
  axisOrigin: { x: number; y: number },
  origins: MorphOrigin[],
): MorphConfig {
  const out: MorphConfig = {
    enabled: m.enabled === true,
    mode: m.mode as 'linear' | 'radial',
    axisOrigin,
    easing: 'linear',
    origins,
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
 * Read the top-level `morph` (Step 20) in its **current** shape —
 * `{ mode, axisOrigin, origins }`.
 *
 * Mirrors the Gallery-frame policy: degrade rather than throw — a dropped morph
 * renders the base pattern, which is harmless next to a failed load. Unknown
 * mode or a non-finite axis origin ⇒ drop the whole config.
 */
export function readMorphConfig(v: unknown): MorphConfig | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const m = v as Record<string, unknown>
  if (m.mode !== 'linear' && m.mode !== 'radial') return undefined
  const o = m.axisOrigin as Record<string, unknown> | undefined
  if (!o || typeof o !== 'object' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return undefined
  if (!Array.isArray(m.origins)) return undefined
  return buildMorphConfig(m, { x: o.x as number, y: o.y as number }, readMorphStops(m.origins))
}

/**
 * **Generation 0 only** — the pre-#48 morph, which named the axis point
 * `origin` and the stop chain `boundaries`. Boundaries are converted to the
 * Origin model by `originsFromLegacyBoundaries`.
 *
 * Deliberately tolerant of half-renamed saves (`origin` + `origins`, or
 * `axisOrigin` + `boundaries`): the pre-#6 reader accepted every mix of the two
 * key generations, and a stricter split here would silently drop a morph that
 * used to load. Generation 1 gets the strict reader above instead.
 */
function readLegacyMorphConfig(v: unknown): MorphConfig | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const m = v as Record<string, unknown>
  if (m.mode !== 'linear' && m.mode !== 'radial') return undefined
  const o = (m.axisOrigin ?? m.origin) as Record<string, unknown> | undefined
  if (!o || typeof o !== 'object' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return undefined
  const legacyStops = !Array.isArray(m.origins) && Array.isArray(m.boundaries)
  const rawStops = Array.isArray(m.origins) ? m.origins : legacyStops ? m.boundaries : null
  if (!rawStops) return undefined
  const stops = readMorphStops(rawStops as unknown[])
  return buildMorphConfig(
    m,
    { x: o.x as number, y: o.y as number },
    legacyStops ? originsFromLegacyBoundaries(stops) : stops,
  )
}

/** Morph for a given generation — current shape first, since almost every
 *  existing save is a modern-shape generation-0 save. */
function readMorphForGeneration(v: unknown, gen: ConfigGeneration): MorphConfig | undefined {
  const direct = readMorphConfig(v)
  if (direct || gen !== 0) return direct
  return readLegacyMorphConfig(v)
}

/**
 * Read a `PatternConfig` field by field, at a given schema generation.
 *
 * `gen` selects which **input** shapes are accepted. Generation 0
 * (pre-versioning) additionally accepts the legacy `lacing` strand block, the
 * pre-#48 `{ origin, boundaries }` morph, and the removed rosette figure type.
 * Generation 1 accepts only the current shape, and that narrowing is the point
 * of #6: the legacy readers become dated migrations instead of permanent shape
 * probes that every future save keeps paying for.
 *
 * The output is always current-generation and stamped with
 * `CURRENT_PATTERN_CONFIG_VERSION`.
 *
 * Editor configs are migrated via `migrateEditorConfig`; if the editor field
 * is present but invalid, the load fails (we don't strip it silently — the
 * user expected to load an editor patch and getting a stripped non-editor
 * config back would be more confusing than an error).
 */
function readConfig(r: Record<string, unknown>, gen: ConfigGeneration): PatternConfig {
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
  const strand = readStrandForGeneration(r, gen)
  if (!strand) {
    throw new ConfigValidationError(
      gen === 0
        ? 'Missing or malformed `strand` (or legacy `lacing`) style.'
        : 'Missing or malformed `strand` style.',
    )
  }

  const out: PatternConfig = {
    version: CURRENT_PATTERN_CONFIG_VERSION,
    tiling: r.tiling,
    figures: gen === 0 ? coerceLegacyFigures(r.figures) : readFigures(r.figures),
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
  const morph = readMorphForGeneration(r.morph, gen)
  if (morph) out.morph = morph
  // Legacy-substrate decoration. Same validator the Patch's own decoration
  // goes through, so both homes accept exactly the same block; malformed
  // decoration drops to undefined rather than failing the load. Only
  // meaningful without a Patch (`decoration/store.ts` owns that rule), but it
  // is read back unconditionally — silently dropping a field because of a
  // sibling's value is how a library-wide deletion starts.
  const decoration = migrateDecoration(r.decoration)
  if (decoration) out.decoration = decoration
  return out
}

/**
 * Validate an unvalidated value as a `PatternConfig`. Throws
 * `ConfigValidationError` with a human-readable message on failure.
 *
 * The **strict** gate, used by file import and the config library. A config
 * from a newer schema generation is refused rather than half-read: the honest
 * answer on a path the user explicitly initiated. The lenient sibling
 * `readPatternConfig` makes the opposite call for background restores.
 */
export function loadPatternConfig(raw: unknown): PatternConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigValidationError('File is not a JSON object.')
  }
  const r = raw as Record<string, unknown>

  const version = readConfigVersion(r)
  if (version > CURRENT_PATTERN_CONFIG_VERSION) {
    throw new ConfigValidationError(
      `This pattern was saved by a newer version of the app (schema version ${version}; `
      + `this build reads up to ${CURRENT_PATTERN_CONFIG_VERSION}). Update the app to open it.`,
    )
  }
  const gen = version as ConfigGeneration
  warnDroppedKeys(r, gen)

  // One reader per schema generation, mirroring `migrateEditorConfig`. When
  // generation 2 lands this becomes a switch: generation 1 gets its own frozen
  // reader and the new one is added here.
  return readConfig(r, gen)
}

/**
 * Lenient sibling of `loadPatternConfig`, for **auto-persisted working state**
 * — the Lab's `lab-state-v1`, which is restored on every boot without the user
 * asking for it. There, throwing means a white screen with no way back in
 * (ticket #50), so this repairs instead of rejecting and returns null only when
 * nothing is salvageable.
 *
 * It repairs the raw blob into a shape the strict loader accepts and then
 * **delegates to `loadPatternConfig`**, so every migration — figure coercion,
 * strand / legacy `lacing`, editor schema version, Gallery Frame clamping,
 * morph Origins — is inherited rather than reimplemented. That delegation is
 * the point: the Lab boot path used to be a second, weaker schema gate with its
 * own hand-written per-field branches, so every `PatternConfig` change had to be
 * migrated in two places and only one of them was discoverable. Keep the pair
 * here, together, and a new field is handled once.
 *
 * Each repair below is a case the strict loader treats as **fatal** but a
 * background restore should survive by keeping as much of the session as it can.
 * Anything the strict loader merely *drops* (an unreadable morph, an n-ring
 * top-level `frame`) needs no repair — it already degrades.
 */
export function readPatternConfig(raw: unknown, fallbackStrand: StrandStyle): PatternConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = { ...(raw as Record<string, unknown>) }

  // A generation this build doesn't know → read it as the current one and keep
  // what parses, instead of the strict loader's refusal. Downgrading a *file
  // import* would be dishonest, but this is the session the user left open:
  // refusing it is a blank Lab with no way back to their work, and the fields
  // this build understands are still worth restoring.
  const version = readConfigVersion(r)
  const gen: ConfigGeneration = version > CURRENT_PATTERN_CONFIG_VERSION
    ? CURRENT_PATTERN_CONFIG_VERSION
    : version as ConfigGeneration
  r.version = gen

  // No readable tiling ⇒ nothing worth restoring.
  if (!isTilingConfig(r.tiling)) return null
  let tiling: TilingConfig = r.tiling

  // Retired type → blank rather than fatal: the figures and strand style are
  // still worth keeping, and a blank tiling is a state the Lab starts in
  // anyway.
  if (RETIRED_TILING_TYPES.has(tiling.type)) tiling = { ...tiling, type: '' }
  if (!isFiguresMap(r.figures)) r.figures = {}
  // Generation-aware: a pre-versioning blob carrying only `lacing` has a
  // perfectly good strand style, and clobbering it with the fallback would
  // discard the user's colours on every boot.
  if (!readStrandForGeneration(r, gen)) r.strand = fallbackStrand

  // An editor patch that won't migrate is dropped (taking an editor tiling type
  // with it) — booting into a blank Lab beats failing the whole restore. Note
  // `loadPatternConfig` migrates again; the second pass runs on already-v3 data
  // and is cheap, and paying it keeps this function free of its own schema
  // knowledge.
  if (r.editor !== undefined) {
    const migrated = migrateEditorConfig(r.editor)
    if (migrated) r.editor = migrated
    else delete r.editor
  }
  if (tiling.type === 'editor' && r.editor === undefined) tiling = { ...tiling, type: '' }
  r.tiling = tiling

  try {
    return loadPatternConfig(r)
  } catch {
    // A repair we didn't anticipate. Losing the session is bad; booting into a
    // crash is worse.
    return null
  }
}
