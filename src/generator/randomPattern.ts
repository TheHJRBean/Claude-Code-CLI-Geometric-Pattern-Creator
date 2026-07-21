import type { CurveConfig, FigureConfig, FigureLineSet, PatternConfig, StrandLineStyle } from '../types/pattern'
import { TILINGS, TILING_NAMES } from '../tilings/index'

/**
 * Generator v1 sampler (ADR-0007, ticket #18).
 *
 * Pure module: seeded RNG → complete, renderable `PatternConfig`. The
 * substrate is a uniform pick over the shipped Gallery tilings; only the
 * *look* is randomised. Colour/background are frozen to one neutral pair and
 * Frame is absent so ratings measure geometry taste cleanly (see ADR-0007).
 *
 * Determinism contract: the same `(seed, GENERATOR_VERSION)` pair always
 * yields the same config. Any change to the tuning constants or sampling
 * logic below MUST bump `GENERATOR_VERSION`.
 */

/** Bump on ANY change to sampling behaviour (ranges, weights, logic).
 *  v2 (2026-07-21): figures can now carry `extraSets` — layered edge/vertex/
 *  boundary line families (#42, `multi-ray-sets`). */
export const GENERATOR_VERSION = 2

/**
 * All tunable ranges and weights in one block (ADR-0007 consequence).
 * Ranges are inclusive bands sampled uniformly unless noted. Probabilities
 * are in [0, 1].
 */
export const SAMPLER_TUNING = {
  /** `tiling.scale` band — density variance around the default 100. */
  scale: { min: 70, max: 160 },
  /** Contact angle θ band per tile type (UI slider allows 10–85; below ~30
   * most figures collapse into noise, so the sampler stays plausible). */
  contactAngle: { min: 30, max: 85 },
  /** P(autoLineLength); otherwise manual `lineLength` from the band below. */
  autoLineLengthProbability: 0.75,
  lineLength: { min: 0.4, max: 1.5 },
  /** P(edge lines on) — resampled to `true` if vertex lines also came up off. */
  edgeLinesProbability: 0.85,
  vertexLinesProbability: 0.3,
  /** P(vertex decoupling), given vertex lines are on. */
  vertexDecoupleProbability: 0.15,
  /** Curves: P(enabled), point count 1–3, per-point position/offset bands. */
  curveProbability: 0.3,
  curvePoints: { min: 1, max: 3 },
  curvePosition: { min: 0.15, max: 0.85 },
  curveOffset: { min: -0.6, max: 0.6 },
  curveAlternatingProbability: 0.5,
  /** P(smoothTransitions), given any curve is enabled. */
  smoothTransitionsProbability: 0.5,
  strandWidth: { min: 2, max: 8 },
  /** Weighted pick over all five stroke variants, biased to solid. */
  lineStyleWeights: {
    solid: 0.6,
    double: 0.1,
    triple: 0.1,
    dashed: 0.1,
    dotted: 0.1,
  } as Record<StrandLineStyle, number>,
  weaveProbability: 0.5,
  /** Extra line sets (#42, layered families) per tile-type figure. Additive
   * on top of the primary edge/vertex lines, so the primary always renders.
   * `extraSetProbability` = P(a figure carries any); then how many; then the
   * kind mix. Edge/vertex weighted over `boundary` (outline-trace, no PIC).
   * Per-set θ / length / curve reuse the primary bands so sets stay plausible. */
  extraSetProbability: 0.25,
  extraSetCount: { min: 1, max: 2 },
  extraSetKindWeights: {
    edge: 0.45,
    vertex: 0.4,
    boundary: 0.15,
  } as Record<FigureLineSet['kind'], number>,
} as const

/** Frozen presentation pair (ADR-0007: confound dimensions excluded in v1).
 * Matches the app's default neutral strand/background colours. */
export const GENERATOR_STRAND_COLOR = '#1a1a2e'
export const GENERATOR_BACKGROUND = '#f5f0e8'

export interface GeneratedPattern {
  seed: number
  generatorVersion: number
  config: PatternConfig
}

/** mulberry32 — small, fast, deterministic PRNG over a uint32 seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Band {
  min: number
  max: number
}

function uniform(rng: () => number, band: Band): number {
  return band.min + rng() * (band.max - band.min)
}

function coin(rng: () => number, probability: number): boolean {
  return rng() < probability
}

function intInclusive(rng: () => number, band: Band): number {
  return band.min + Math.floor(rng() * (band.max - band.min + 1))
}

function weightedPick<K extends string>(rng: () => number, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [key, w] of entries) {
    r -= w
    if (r <= 0) return key
  }
  return entries[entries.length - 1][0]
}

/** Tile-type ids the figure map must cover — same derivation runPIC's
 * polygon lookup relies on (explicit `tileTypes`, else unique vertexConfig). */
export function tileTypeIdsForTiling(tilingType: string): string[] {
  const def = TILINGS[tilingType]
  if (!def) return []
  return def.tileTypes
    ? def.tileTypes.map(t => t.id)
    : [...new Set(def.vertexConfig)].map(String)
}

function sampleCurve(rng: () => number): CurveConfig {
  const t = SAMPLER_TUNING
  const count = intInclusive(rng, t.curvePoints)
  const points = Array.from({ length: count }, () => ({
    position: uniform(rng, t.curvePosition),
    offset: uniform(rng, t.curveOffset),
  }))
  // Sorted by position so multi-point curves read as one coherent bend.
  points.sort((a, b) => a.position - b.position)
  return {
    enabled: true,
    points,
    alternating: coin(rng, t.curveAlternatingProbability),
    direction: coin(rng, 0.5) ? 'left' : 'right',
  }
}

/** One extra line set — additive layer over the primary figure. `boundary`
 * ignores θ/length (it traces Tile outlines, no PIC), but they're still sampled
 * so the type is complete and the RNG stream stays uniform across kinds. */
function sampleLineSet(rng: () => number, index: number): FigureLineSet {
  const t = SAMPLER_TUNING
  const autoLineLength = coin(rng, t.autoLineLengthProbability)
  const set: FigureLineSet = {
    id: `set-${index + 1}`,
    kind: weightedPick(rng, t.extraSetKindWeights),
    contactAngle: uniform(rng, t.contactAngle),
    autoLineLength,
    lineLength: autoLineLength ? 1.0 : uniform(rng, t.lineLength),
  }
  if (coin(rng, t.curveProbability)) set.curve = sampleCurve(rng)
  return set
}

/** Sometimes attach 1–2 extra line sets; `undefined` (not `[]`) when none, so
 * the config stays byte-identical to the setless shape (matches the reducer's
 * REMOVE_FIGURE_SET cleanup). */
function sampleExtraSets(rng: () => number): FigureLineSet[] | undefined {
  const t = SAMPLER_TUNING
  if (!coin(rng, t.extraSetProbability)) return undefined
  const count = intInclusive(rng, t.extraSetCount)
  return Array.from({ length: count }, (_, i) => sampleLineSet(rng, i))
}

function sampleFigure(rng: () => number): FigureConfig {
  const t = SAMPLER_TUNING
  const autoLineLength = coin(rng, t.autoLineLengthProbability)
  const edgeLinesEnabled = coin(rng, t.edgeLinesProbability)
  const vertexLinesEnabled = coin(rng, t.vertexLinesProbability)

  const figure: FigureConfig = {
    type: 'star',
    contactAngle: uniform(rng, t.contactAngle),
    autoLineLength,
    lineLength: autoLineLength ? 1.0 : uniform(rng, t.lineLength),
    // Constraint: at least one line kind on — edge wins the tie-break so the
    // draw stream stays fixed-length regardless of outcomes.
    edgeLinesEnabled: edgeLinesEnabled || !vertexLinesEnabled,
    vertexLinesEnabled,
  }

  if (vertexLinesEnabled && coin(rng, t.vertexDecoupleProbability)) {
    const vertexAuto = coin(rng, t.autoLineLengthProbability)
    figure.vertexLinesDecoupled = true
    figure.vertexContactAngle = uniform(rng, t.contactAngle)
    figure.vertexAutoLineLength = vertexAuto
    figure.vertexLineLength = vertexAuto ? 1.0 : uniform(rng, t.lineLength)
  }

  if (coin(rng, t.curveProbability)) {
    figure.curve = sampleCurve(rng)
  }

  const extraSets = sampleExtraSets(rng)
  if (extraSets) figure.extraSets = extraSets

  return figure
}

/**
 * Sample one complete random pattern. Deterministic in
 * `(seed, GENERATOR_VERSION)`; the seed is returned alongside the config as
 * provenance (records store the full config — ADR-0007).
 */
export function sampleRandomPattern(seed: number): GeneratedPattern {
  const t = SAMPLER_TUNING
  // Fold the version into the stream so a version bump reshuffles every seed.
  const rng = mulberry32((seed ^ Math.imul(GENERATOR_VERSION, 0x9e3779b9)) >>> 0)

  const tilingType = TILING_NAMES[Math.floor(rng() * TILING_NAMES.length)]

  const figures: Record<string, FigureConfig> = {}
  for (const id of tileTypeIdsForTiling(tilingType)) {
    figures[id] = sampleFigure(rng)
  }

  const anyCurve = Object.values(figures).some(
    f => f.curve?.enabled || f.extraSets?.some(s => s.curve?.enabled),
  )

  const config: PatternConfig = {
    tiling: {
      type: tilingType,
      scale: uniform(rng, t.scale),
    },
    figures,
    strand: {
      width: uniform(rng, t.strandWidth),
      color: GENERATOR_STRAND_COLOR,
      background: GENERATOR_BACKGROUND,
      lineStyle: weightedPick(rng, t.lineStyleWeights),
      weave: coin(rng, t.weaveProbability),
    },
    smoothTransitions: anyCurve ? coin(rng, t.smoothTransitionsProbability) : undefined,
  }

  return { seed, generatorVersion: GENERATOR_VERSION, config }
}
