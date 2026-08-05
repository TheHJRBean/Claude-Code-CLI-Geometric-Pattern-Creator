import type { StrandLineStyle } from '../types/pattern'

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
 * Read the persisted stroke-style trio off a raw `strand` / `frame.stroke`
 * object, translating the withdrawn vocabulary.
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
} {
  const out: { lineStyle?: StrandLineStyle; lineCount?: number; styleRatio?: number } = {}
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
  return out
}

export function strandStyleAttrs(
  lineStyle: StrandLineStyle,
  w: number,
  ratio: number = DEFAULT_STYLE_RATIO,
  lineCount: number = DEFAULT_LINE_COUNT,
): StrandStyleAttrs {
  if (lineStyle !== 'lines') {
    return { masked: false, maskBands: [], innerFillWidth: 0 }
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
  }
}
