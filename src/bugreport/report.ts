import type { PatternConfig } from '../types/pattern'
import { summarisePatternConfig } from './summary'
import type {
  BugEnvironment,
  BugReport,
  BugScreenContext,
  BugSeverity,
  ConfigSummary,
  ConsoleEntry,
} from './types'
import { BUG_SEVERITY_LABELS } from './types'

/**
 * Assembling and rendering a bug report — all pure, so the whole shape of what
 * gets captured is testable without a DOM.
 *
 * The Markdown renderer is the point of the feature as much as the capture is:
 * a report is only worth filing if it can be handed to a triage session in one
 * paste. Order is deliberate — note first (what the user saw), then screen and
 * pattern state (where they were), then console, then the raw config last so
 * the readable part isn't buried under a wall of JSON.
 */

export interface BuildBugReportInput {
  title: string
  note: string
  severity: BugSeverity
  env: BugEnvironment
  screen: BugScreenContext | null
  config: PatternConfig | null
  screenshot: string | null
  console: ConsoleEntry[]
  /** Injectable for tests; defaults to now. */
  now?: Date
  /** Injectable for tests; defaults to a random suffix. */
  idSuffix?: string
}

/** ISO-8601 with the punctuation stripped — sorts lexicographically and is
 *  safe in a filename. */
function stampFor(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

export function buildBugReport(input: BuildBugReportInput): BugReport {
  const now = input.now ?? new Date()
  const suffix = input.idSuffix ?? Math.random().toString(36).slice(2, 8)
  return {
    id: `bug-${stampFor(now)}-${suffix}`,
    createdAt: now.toISOString(),
    // An untitled report is still worth keeping — the note carries it.
    title: input.title.trim() || 'Untitled report',
    note: input.note.trim(),
    severity: input.severity,
    env: input.env,
    screen: input.screen,
    config: input.config,
    configSummary: summarisePatternConfig(input.config),
    screenshot: input.screenshot,
    console: input.console,
  }
}

/** Escape a cell so a value containing `|` can't break the Markdown table. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function table(rows: [string, string][]): string[] {
  if (rows.length === 0) return []
  return [
    '| | |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`),
  ]
}

function yesNo(v: boolean): string {
  return v ? 'yes' : 'no'
}

function cellFlags(c: ConfigSummary['cells'][number]): string {
  const flags: string[] = []
  if (c.noSeed) flags.push('no-seed')
  if (c.alternateBoundary) flags.push('alternate')
  if (c.wrapBoundary) flags.push('wrap')
  return flags.length ? flags.join(', ') : '—'
}

function configSection(summary: ConfigSummary): string[] {
  const rows: [string, string][] = [
    ['Substrate', summary.substrate],
    ['Tiling', summary.tiling],
    ['Scale', String(summary.scale)],
  ]
  if (summary.configuration) rows.push(['Configuration', summary.configuration])
  if (summary.freeform) rows.push(['Freeform', 'on — no lattice, no boundary'])
  if (summary.edgeLength !== null) rows.push(['Edge length', String(summary.edgeLength)])
  if (summary.cells.length) rows.push(['Cells / Tiles', `${summary.cells.length} / ${summary.totalTiles}`])
  if (summary.guides) rows.push(['Guides', String(summary.guides)])
  if (summary.guideTiles) rows.push(['Guide Tiles (world-space)', String(summary.guideTiles)])
  if (summary.frame) rows.push(['Frame', summary.frame])
  if (summary.morph) rows.push(['Morph', summary.morph])
  if (summary.decoration) rows.push(['Decoration', summary.decoration])
  rows.push(['Strand', summary.strand])
  if (summary.smoothTransitions) rows.push(['Smooth transitions', 'on'])
  rows.push(['Config schema', summary.schemaVersion === null ? 'unversioned (gen 0)' : `v${summary.schemaVersion}`])

  const lines = ['## Pattern', '', ...table(rows)]

  if (summary.cells.length) {
    lines.push(
      '',
      '### Cells',
      '',
      '| Cell | Shape | Tiles | Seed sides | Boundary | Symmetry | Flags |',
      '|---|---|---|---|---|---|---|',
      ...summary.cells.map(c =>
        `| ${cell(c.id)} | ${c.shape} | ${c.tiles} | ${c.seedSides} | ${c.boundarySize} | ${c.symmetry} | ${cellFlags(c)} |`,
      ),
    )
  }

  if (summary.figures.length) {
    lines.push(
      '',
      '### Figure recipes',
      '',
      '| Tile type | θ | Length | Edge lines | Vertex lines | Curve | Extra sets |',
      '|---|---|---|---|---|---|---|',
      ...summary.figures.map(f => {
        const length = f.autoLineLength ? 'auto' : String(f.lineLength)
        const vertex = f.vertexLines ? (f.vertexDecoupled ? 'yes (decoupled)' : 'yes') : 'no'
        const sets = f.extraSets.length ? f.extraSets.map(cell).join('; ') : '—'
        return `| ${cell(f.tileTypeId)} | ${f.contactAngle}° | ${length} | ${yesNo(f.edgeLines)} | ${vertex} | ${cell(f.curve)} | ${sets} |`
      }),
    )
  }

  return lines
}

/**
 * Render a report as Markdown — the format meant for pasting into a triage
 * session or a GitHub issue.
 *
 * `includeConfigJson` is on by default because the embedded config is what
 * makes a report reproducible; turn it off for a short paste when the summary
 * already says enough.
 */
export function bugReportMarkdown(report: BugReport, { includeConfigJson = true } = {}): string {
  const lines: string[] = [
    `# ${report.title}`,
    '',
    ...table([
      ['Filed', `${report.createdAt} (${report.env.timeZone})`],
      ['Severity', BUG_SEVERITY_LABELS[report.severity] ?? report.severity],
      ['Build', report.env.commit],
      ['Workspace', report.screen?.screen ?? report.env.appMode],
    ]),
    '',
    '## What happened',
    '',
    report.note || '_(no note)_',
  ]

  if (report.screen && report.screen.facts.length) {
    lines.push('', `## Screen — ${report.screen.screen}`, '', ...table(
      report.screen.facts.map(f => [f.label, f.value] as [string, string]),
    ))
  }

  if (report.configSummary) lines.push('', ...configSection(report.configSummary))

  if (report.console.length) {
    lines.push('', `## Console (${report.console.length})`, '', '```')
    for (const entry of report.console) lines.push(`[${entry.level}/${entry.source}] ${entry.at} — ${entry.text}`)
    lines.push('```')
  }

  lines.push('', '## Environment', '', ...table([
    ['Viewport', `${report.env.viewport.width} × ${report.env.viewport.height} @ ${report.env.devicePixelRatio}x`],
    ['Theme', report.env.theme],
    ['User agent', report.env.userAgent],
  ]))

  lines.push(
    '',
    '## Screenshot',
    '',
    report.screenshot
      ? '_Pattern canvas captured — in the JSON bundle as a PNG data URL, and downloadable as a `.png` from the Bug capture panel._'
      : '_Not captured._',
  )

  if (includeConfigJson && report.config) {
    lines.push(
      '',
      '<details><summary>Full PatternConfig JSON</summary>',
      '',
      '```json',
      JSON.stringify(report.config, null, 2),
      '```',
      '',
      '</details>',
    )
  }

  return lines.join('\n')
}

/** Slug of the title, for filenames. */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'report'
}

export function bugReportFilename(report: BugReport, ext: 'json' | 'md' | 'png'): string {
  return `${report.id}-${slug(report.title)}.${ext}`
}

/** Strip the screenshot for the list view (a data URL is megabytes of noise). */
export function toMeta(report: BugReport) {
  const { screenshot, ...rest } = report
  return { ...rest, hasScreenshot: screenshot !== null }
}
