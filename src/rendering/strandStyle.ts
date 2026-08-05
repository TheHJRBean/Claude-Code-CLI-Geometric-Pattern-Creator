import type { GapFillMode, StrandLineStyle } from '../types/pattern'

/**
 * Resolved SVG stroke attributes for a Strand `lineStyle` at width `w`
 * (thermo-nuclear review Chunk 10). Extracted from `StrandLayer` so the
 * style→attribute mapping is unit-testable. `FrameBorder` (`PatternSVG`)
 * renders the same vocabulary and shares this resolver.
 *
 * `'lines'` splits the stroke into `lineCount` parallel lines by cutting the
 * gaps out of it with a mask, so Void fills / background show through between
 * them (an overdraw would paint over whatever the stroke straddles).
 */
export interface StrandStyleAttrs {
  masked: boolean
  /**
   * Concentric mask bands for `'lines'`, **widest first**, alternating
   * cut / restore: paint each in turn over a white mask and the strokes'
   * decreasing widths carve the gaps and re-expose the inner lines. Empty
   * unless `masked`.
   *
   * Doing the inner lines in the mask rather than as separate coloured
   * overdraws (the old `triple` centre line) keeps per-Strand colours,
   * gradients and weave breaks correct for free — the one masked stroke is
   * still the only thing painting ink.
   */
  maskBands: number[]
  /**
   * Stroke width for the `innerFill` underlay — everything inside the two
   * outermost lines, so one underlay colours every gap at once.
   */
  innerFillWidth: number
  /**
   * Underlay stroke width per **gap ring**, outermost first — the even-index
   * `maskBands`. A ring is one radial gap *position*, which for every ring but
   * an even count's centre one is a symmetric **pair** of gaps: a stroke is
   * centred on its path, so the gap left of the centreline and the gap right
   * of it are the same ring and cannot take different colours.
   */
  gapRingWidths: number[]
}

/** The gap-fill fields, as carried by `StrandStyle` and `FrameStroke`. */
export interface GapFillStyle {
  innerFill?: string
  /** One entry per **gap**, `n − 1` of them, ordered across the stroke: for a
   * Frame border that is outermost → innermost. */
  gapFills?: (string | null)[]
  gapFillMode?: GapFillMode
}

/** Number of gaps an `n`-line stroke has. */
export function gapCount(lineCount: number): number {
  return clampLineCount(lineCount) - 1
}

/**
 * Number of gap **rings** — the `'matching'` mode's unit. A ring is a radial
 * gap position measured from the stroke's centreline, so it covers a gap and
 * its mirror on the far side; only an even line count's centre gap is alone.
 */
export function gapRingCount(lineCount: number): number {
  return Math.floor(clampLineCount(lineCount) / 2)
}

/** The two gap indices that make up ring `r` of an `n`-line stroke (equal at a lone centre gap). */
export function ringGapIndices(r: number, lineCount: number): [number, number] {
  const last = gapCount(lineCount) - 1
  return [r, last - r]
}

/**
 * Resolve what each gap ring is painted with, outermost first. `null` = left
 * unfilled (whatever is behind the stroke shows through).
 *
 * Rings paint as concentric underlay strokes beneath the masked ink, each
 * narrower than the last, so an inner ring's colour overwrites the outer
 * ring's stroke exactly where the mask will reveal it. An unfilled ring can't
 * be expressed that way — an outer ring's stroke covers it — so a *mixed* set
 * needs the second mask `gapFillMaskBands` describes.
 *
 * This is the `'all'` and `'matching'` path. Truly per-gap fills can't be
 * drawn concentrically at all (a stroke is centred on its path, so any band
 * cut at `+x` is also cut at `−x`) — see `gapCrossSections`.
 */
export function gapRingFills(
  attrs: StrandStyleAttrs,
  style: GapFillStyle,
  lineCount: number = DEFAULT_LINE_COUNT,
): { width: number; colour: string | null }[] {
  const perGap = style.gapFillMode === 'matching' || style.gapFillMode === 'individual'
  return attrs.gapRingWidths.map((width, r) => {
    if (!perGap) return { width, colour: style.innerFill ?? null }
    // A ring shows one colour, so an asymmetric pair (only reachable by
    // authoring in `'individual'` then rendering somewhere that can't do it)
    // resolves to the outer gap's.
    const [a, b] = ringGapIndices(r, lineCount)
    return { width, colour: style.gapFills?.[a] ?? style.gapFills?.[b] ?? null }
  })
}

/**
 * Mask bands that reveal only the **filled** gap rings, black-backed (paint a
 * black rect first, then these in order). Needed only when some rings are
 * filled and others are not; `null` when the plain underlay stack suffices.
 */
export function gapFillMaskBands(
  attrs: StrandStyleAttrs,
  fills: { colour: string | null }[],
): { width: number; colour: 'white' | 'black' }[] | null {
  const filled = fills.filter(f => f.colour !== null).length
  if (filled === 0 || filled === fills.length) return null
  return attrs.maskBands.map((width, b) => ({
    width,
    // Even band = the cut into gap ring b/2; odd band = back to a line, which
    // the ink covers anyway, so it stays hidden.
    colour: (b % 2 === 0 && fills[b / 2]?.colour !== null ? 'white' : 'black') as 'white' | 'black',
  }))
}

/**
 * Where each gap sits **across** the stroke: the distance from the stroke's
 * FIRST edge to that gap's centre, plus its thickness. Gap 0 is the one
 * adjacent to that edge — the Frame border reads the first edge as the outer
 * one, so its gap 0 is the outermost, matching the ring order. This is what `'individual'`
 * mode paints against: a fill drawn on the stroke's path offset by `centre`,
 * stroked `width` thick, lands in exactly one gap — no mirror.
 *
 * Only geometry that can be offset sideways can use it. A closed Frame outline
 * can (`offsetPolygonOutward`), which is why `'individual'` is a border mode:
 * "outward" and "inward" are real, fixed directions there. A Strand's two
 * sides are set by the direction its Rays happened to chain, so the same
 * control would colour one strand's left and its neighbour's right.
 */
export function gapCrossSections(
  w: number,
  lineCount: number = DEFAULT_LINE_COUNT,
  ratio: number = DEFAULT_STYLE_RATIO,
): { centre: number; width: number }[] {
  const n = clampLineCount(lineCount)
  const { line, gap } = lineBandWidths(w, n, ratio)
  return Array.from({ length: n - 1 }, (_, g) => ({
    centre: (g + 1) * line + (g + 0.5) * gap,
    width: gap,
  }))
}

/** Number of parallel lines a `'lines'` stroke is divided into. */
export const DEFAULT_LINE_COUNT = 2
export const LINE_COUNT_MIN = 2
export const LINE_COUNT_MAX = 10

/**
 * **Line/gap ratio** — one line's thickness divided by one gap's, for the
 * `'lines'` style. `1` = lines and gaps equally thick; higher = thicker
 * lines and tighter gaps. The pre-2026-08-05 hard-coded `double` was 0.5
 * (quarter–half–quarter), which is what legacy saves migrate to.
 */
export const DEFAULT_STYLE_RATIO = 1
export const STYLE_RATIO_MIN = 0.25
export const STYLE_RATIO_MAX = 4

/** Clamp a persisted / user ratio into the supported band. */
export function clampStyleRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_STYLE_RATIO
  return Math.min(STYLE_RATIO_MAX, Math.max(STYLE_RATIO_MIN, ratio))
}

/** Clamp a persisted / user line count into the supported band. */
export function clampLineCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_LINE_COUNT
  return Math.min(LINE_COUNT_MAX, Math.max(LINE_COUNT_MIN, Math.round(count)))
}

/**
 * Line and gap thickness for `n` lines filling stroke width `w` at ratio `r`:
 * `w = n·line + (n−1)·gap` with `line / gap = r`.
 */
export function lineBandWidths(w: number, count: number, ratio: number): { line: number; gap: number } {
  const n = clampLineCount(count)
  const r = clampStyleRatio(ratio)
  const line = w / (n + (n - 1) / r)
  return { line, gap: line / r }
}

/** Line/gap ratios that reproduce the withdrawn hard-coded looks exactly. */
const LEGACY_DOUBLE_RATIO = 0.5    // 0.25w line · 0.5w gap · 0.25w line
const LEGACY_TRIPLE_RATIO = 0.745  // 0.175w lines · 0.235w gaps

/**
 * Read the persisted stroke-style fields off a raw `strand` / `frame.stroke`
 * object — the line-style trio plus the gap-fill pair — translating the
 * withdrawn vocabulary.
 *
 * Both load paths (`state/configValidation.ts` and `editor/migrations.ts`)
 * share this so a save reads the same on either — the legacy `'double'` /
 * `'triple'` become `'lines'` at the count and classic ratio they drew at,
 * and the withdrawn `'dashed'` / `'dotted'` fall back to `'solid'` rather
 * than silently rendering as something they never were.
 */
export function readLineStyleFields(raw: Record<string, unknown>): {
  lineStyle?: StrandLineStyle
  lineCount?: number
  styleRatio?: number
  gapFills?: (string | null)[]
  gapFillMode?: GapFillMode
} {
  // NOTE: `lineCount` must be resolved before the gap-fill block below reads
  // it — the legacy ring→gap expansion is sized off it.
  const out: {
    lineStyle?: StrandLineStyle
    lineCount?: number
    styleRatio?: number
    gapFills?: (string | null)[]
    gapFillMode?: GapFillMode
  } = {}
  const style = raw.lineStyle
  if (style === 'solid' || style === 'dashed' || style === 'dotted') {
    out.lineStyle = 'solid'
  } else if (style === 'lines' || style === 'double' || style === 'triple') {
    out.lineStyle = 'lines'
    out.lineCount = style === 'triple' ? 3 : style === 'double' ? 2 : DEFAULT_LINE_COUNT
    if (style === 'double') out.styleRatio = LEGACY_DOUBLE_RATIO
    if (style === 'triple') out.styleRatio = LEGACY_TRIPLE_RATIO
  } else {
    return out
  }
  if (out.lineStyle === 'lines' && typeof raw.lineCount === 'number') {
    out.lineCount = clampLineCount(raw.lineCount)
  }
  if (out.lineStyle === 'lines' && typeof raw.styleRatio === 'number') {
    out.styleRatio = clampStyleRatio(raw.styleRatio)
  }
  if (out.lineStyle === 'lines' && Array.isArray(raw.gapFills)) {
    // Entries are colours or `null` (gap left unfilled); anything else is
    // read as unfilled rather than dropping the whole array — one bad entry
    // shouldn't cost the user the other gaps.
    out.gapFills = raw.gapFills
      .slice(0, LINE_COUNT_MAX)
      .map(c => (typeof c === 'string' && c.length > 0 ? c : null))
  }
  if (out.lineStyle === 'lines' && GAP_FILL_MODES.has(raw.gapFillMode as GapFillMode)) {
    out.gapFillMode = raw.gapFillMode as GapFillMode
  }
  if (out.gapFillMode === 'individual' && out.gapFills) {
    // Pre-2026-08-05 `'individual'` WAS today's `'matching'`, and stored one
    // entry per ring. Length is the discriminator: a current array always
    // carries one entry per gap. (At 2 lines the two agree and mirroring is
    // the identity, so there is nothing to tell apart.)
    const gaps = gapCount(out.lineCount ?? DEFAULT_LINE_COUNT)
    if (out.gapFills.length !== gaps) {
      const rings = out.gapFills
      out.gapFillMode = 'matching'
      out.gapFills = Array.from({ length: gaps }, (_, g) =>
        rings[Math.min(g, gaps - 1 - g)] ?? null)
    }
  }
  return out
}

const GAP_FILL_MODES = new Set<GapFillMode>(['all', 'matching', 'individual'])

export function strandStyleAttrs(
  lineStyle: StrandLineStyle,
  w: number,
  ratio: number = DEFAULT_STYLE_RATIO,
  lineCount: number = DEFAULT_LINE_COUNT,
): StrandStyleAttrs {
  if (lineStyle !== 'lines') {
    return { masked: false, maskBands: [], innerFillWidth: 0, gapRingWidths: [] }
  }
  const n = clampLineCount(lineCount)
  const { line, gap } = lineBandWidths(w, n, ratio)

  // Band j (1-based) cuts everything inside the outermost j lines and j−1
  // gaps; the next band restores the line just inside it. Widths shrink by
  // 2·(line + gap) per pair, so the alternation walks inward to the centre.
  const bands: number[] = []
  for (let j = 1; j <= n; j++) {
    const cut = w - 2 * (j * line + (j - 1) * gap)
    if (cut <= 1e-9) break
    bands.push(cut)
    const restore = cut - 2 * gap
    if (restore <= 1e-9) break
    bands.push(restore)
  }

  return {
    masked: bands.length > 0,
    maskBands: bands,
    innerFillWidth: bands.length > 0 ? bands[0] : 0,
    gapRingWidths: bands.filter((_, i) => i % 2 === 0),
  }
}
