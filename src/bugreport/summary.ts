import type { PatternConfig } from '../types/pattern'
import type { CurveConfig, FigureConfig } from '../types/pattern'
import type { FrameConfig } from '../types/editor'
import { patternDecoration } from '../decoration/store'
import type { CellSummary, ConfigSummary, FigureSummary } from './types'

/**
 * Pure digest of a `PatternConfig` for a bug report (`bugreport/types.ts`).
 *
 * Every branch here answers a question that has actually been asked in a bug
 * triage: which substrate is this (Patch vs legacy tiling — they take
 * different code paths through `usePattern`), how many Cells and Tiles, is a
 * Morph or Frame active, does the decoration block hold records, and what the
 * Figure recipes look like. Reading it should make the report triageable
 * *without* loading the embedded config.
 *
 * Defensive by construction: a report is filed *because* something is wrong,
 * so this must survive a malformed or partially-migrated config rather than
 * throw and lose the user's note. Everything is optional-chained and every
 * numeric is rounded rather than trusted.
 */

/** Round to at most `dp` decimals, dropping a trailing `.0`. */
function num(v: unknown, dp = 2): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function describeCurve(curve: CurveConfig | undefined): string {
  if (!curve || !curve.enabled) return 'off'
  const pts = Array.isArray(curve.points) ? curve.points.length : 0
  const bits = [`${pts} pt${pts === 1 ? '' : 's'}`]
  if (curve.alternating) bits.push('alternating')
  if (curve.direction) bits.push(curve.direction)
  return bits.join(', ')
}

function summariseFigure(tileTypeId: string, fig: FigureConfig): FigureSummary {
  return {
    tileTypeId,
    contactAngle: num(fig?.contactAngle, 1),
    lineLength: num(fig?.lineLength),
    autoLineLength: fig?.autoLineLength === true,
    // Both default to true/false respectively in the render path, so mirror
    // those defaults rather than reporting `undefined` as "off".
    edgeLines: fig?.edgeLinesEnabled !== false,
    vertexLines: fig?.vertexLinesEnabled === true,
    vertexDecoupled: fig?.vertexLinesDecoupled === true,
    curve: describeCurve(fig?.curve),
    extraSets: (fig?.extraSets ?? []).map(set => {
      const state = set?.enabled === false ? ' (off)' : ''
      // A `boundary` set traces Tile outlines and ignores θ entirely — saying
      // "θ 0°" there would read as a real angle the user had chosen.
      const angle = set?.kind === 'boundary' ? 'no θ' : `θ ${num(set?.contactAngle, 1)}°`
      return `${set?.kind ?? '?'} — ${angle}${state}`
    }),
  }
}

function summariseFrame(frame: FrameConfig | undefined): string | null {
  if (!frame) return null
  if (frame.type === 'n-ring') return `n-ring — ${frame.rings ?? 1} ring(s)`
  const bits = [`shape — ${frame.shape ?? 'square'}`, `size ${num(frame.size)}`]
  if (frame.aspect && frame.aspect !== 1) bits.push(`aspect ${num(frame.aspect)}`)
  if (frame.rotation) bits.push(`rot ${num((frame.rotation * 180) / Math.PI, 1)}°`)
  bits.push(frame.boundaryTreatment ?? 'complete')
  const completed = frame.completedTiles?.length ?? 0
  if (completed) bits.push(`${completed} completion Tile(s)`)
  if (frame.stroke?.enabled) bits.push('border stroke on')
  return bits.join(', ')
}

function summariseMorph(config: PatternConfig): string | null {
  const morph = config.morph
  if (!morph) return null
  const state = morph.enabled ? 'on' : 'off (configured)'
  const origins = morph.origins?.length ?? 0
  return `${state} — ${morph.mode}, ${origins} Origin(s)`
}

function summariseDecoration(config: PatternConfig): string | null {
  // `patternDecoration` is the only sanctioned way to pick between the Patch
  // home (`editor.decoration`) and the legacy one (`config.decoration`) —
  // reading either field directly makes the other invisible.
  const dec = patternDecoration(config)
  if (!dec) return null
  const bits = [
    `${dec.voidFills?.length ?? 0} Void fill(s)`,
    `${dec.strandColours?.length ?? 0} Strand colour(s)`,
  ]
  const stamps = dec.voidStamps?.length ?? 0
  if (stamps) bits.push(`${stamps} Stamp(s)`)
  if (dec.frameGradient) bits.push('frame gradient')
  if (dec.strandGradient) bits.push('strand gradient')
  return bits.join(', ')
}

function summariseCells(config: PatternConfig): CellSummary[] {
  return (config.editor?.cells ?? []).map(cell => ({
    id: cell?.id ?? '?',
    shape: cell?.shape ?? '?',
    tiles: cell?.tiles?.length ?? 0,
    seedSides: cell?.seedSides ?? 0,
    boundarySize: num(cell?.boundarySize),
    symmetry: cell?.symmetryMode ?? 'none',
    noSeed: cell?.noSeed === true,
    alternateBoundary: cell?.alternateBoundary === true,
    wrapBoundary: cell?.wrapBoundary === true,
  }))
}

function summariseStrand(config: PatternConfig): string {
  const s = config.strand
  if (!s) return 'none'
  const bits = [`width ${num(s.width)}`, s.color, `bg ${s.background}`, s.lineStyle ?? 'solid']
  if (s.weave) bits.push(`weave (gap ${num(s.weaveGap ?? 2)})`)
  if (s.innerFill) bits.push(`inner ${s.innerFill}`)
  return bits.join(', ')
}

export function summarisePatternConfig(config: PatternConfig | null | undefined): ConfigSummary | null {
  if (!config) return null
  const patch = config.editor
  const cells = summariseCells(config)
  // An empty `tiling.type` is the fresh-Lab state (`LAB_DEFAULT_CONFIG`) —
  // worth distinguishing from a real substrate, because "nothing renders" is a
  // legitimate report and the answer is often just that nothing was picked.
  const substrate: ConfigSummary['substrate'] = patch
    ? 'patch'
    : config.tiling?.type
      ? 'legacy'
      : 'empty'

  return {
    substrate,
    schemaVersion: typeof config.version === 'number' ? config.version : null,
    tiling: config.tiling?.type || '(none selected)',
    scale: num(config.tiling?.scale),
    configuration: patch?.configuration ?? null,
    edgeLength: patch ? num(patch.edgeLength) : null,
    cells,
    totalTiles: cells.reduce((sum, c) => sum + c.tiles, 0),
    guides: patch?.guides?.length ?? 0,
    guideTiles: patch?.guideTiles?.length ?? 0,
    // Gallery Frames live top-level, Builder Frames on the Patch. Only one is
    // ever populated for a given config, so first-non-null is unambiguous.
    frame: summariseFrame(patch?.frame ?? config.frame),
    morph: summariseMorph(config),
    decoration: summariseDecoration(config),
    figures: Object.entries(config.figures ?? {}).map(([id, fig]) => summariseFigure(id, fig)),
    strand: summariseStrand(config),
    smoothTransitions: config.smoothTransitions === true,
  }
}
