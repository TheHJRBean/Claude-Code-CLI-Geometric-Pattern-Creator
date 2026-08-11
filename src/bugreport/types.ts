import type { PatternConfig } from '../types/pattern'

/**
 * In-app **Bug Capture** — the data model.
 *
 * A report is a self-contained reproduction packet: the user's note plus
 * everything a later session needs to get back to the same screen. The pieces
 * are deliberately separate so each can be missing without invalidating the
 * rest — a Gallery report has no pattern canvas to screenshot, a report filed
 * before any console noise has an empty log, and a screen that never
 * registered a context contributor still files a perfectly good note.
 *
 * Nothing here touches `PatternConfig`'s schema: reports live in their own
 * IndexedDB database (`bugreport/store.ts`) and merely *embed* a copy of the
 * config, so the `PATTERN_CONFIG_KEYS` allow-list is not in play.
 */

/** How badly the reported behaviour blocks the user. */
export type BugSeverity = 'blocker' | 'major' | 'minor' | 'question'

export const BUG_SEVERITIES: readonly BugSeverity[] = ['blocker', 'major', 'minor', 'question']

export const BUG_SEVERITY_LABELS: Record<BugSeverity, string> = {
  blocker: 'Blocker — cannot continue',
  major: 'Major — wrong output',
  minor: 'Minor — cosmetic / annoyance',
  question: 'Question — not sure it is a bug',
}

/** One label/value pair in a screen's context table. */
export interface BugFact {
  label: string
  value: string
}

/**
 * What the active screen knows about itself at capture time. Screens register
 * a contributor through `useBugScreenContext`; the reporter calls it at the
 * moment of capture, so the values are the live ones rather than whatever was
 * true when the provider mounted.
 */
export interface BugScreenContext {
  /** Workspace name as the user sees it — "Lab", "Generator", "Gallery". */
  screen: string
  /** Ordered facts: Phase, Tool, active selection, visible overlays… */
  facts: BugFact[]
}

/** Browser / build facts, captured automatically. */
export interface BugEnvironment {
  /** `VITE_COMMIT_MSG` — the build's short hash + subject. */
  commit: string
  appMode: string
  theme: string
  userAgent: string
  viewport: { width: number; height: number }
  devicePixelRatio: number
  /** IANA zone, for reading the timestamp back in the user's own terms. */
  timeZone: string
}

/** A captured console error/warning or uncaught runtime error. */
export interface ConsoleEntry {
  /** ISO timestamp of the moment it was logged. */
  at: string
  level: 'error' | 'warn'
  /** Where it came from: a patched console method, or a window-level handler. */
  source: 'console' | 'window' | 'promise'
  text: string
}

/** Per-Cell breakdown of a Builder Patch. */
export interface CellSummary {
  id: string
  shape: string
  tiles: number
  seedSides: number
  boundarySize: number
  symmetry: string
  noSeed: boolean
  alternateBoundary: boolean
  wrapBoundary: boolean
}

/** One Figure recipe, flattened to the fields that usually matter in a bug. */
export interface FigureSummary {
  tileTypeId: string
  contactAngle: number
  lineLength: number
  autoLineLength: boolean
  edgeLines: boolean
  vertexLines: boolean
  vertexDecoupled: boolean
  curve: string
  /** `kind` + θ of each additional line set (#42). */
  extraSets: string[]
}

/**
 * Human-readable digest of a `PatternConfig`. The full config rides along in
 * the report too — this exists so the report is *readable* without loading it,
 * which is how it gets triaged.
 */
export interface ConfigSummary {
  /** Which render substrate: a Builder Patch, a legacy/BFS tiling, or nothing
   *  chosen yet (a fresh Lab). */
  substrate: 'patch' | 'legacy' | 'empty'
  schemaVersion: number | null
  tiling: string
  scale: number
  configuration: string | null
  /** **Freeform** — Lattice + Boundary switched off. A report about missing
   *  repeats or vanished pick targets is usually just this flag. */
  freeform: boolean
  edgeLength: number | null
  cells: CellSummary[]
  totalTiles: number
  guides: number
  guideTiles: number
  frame: string | null
  morph: string | null
  decoration: string | null
  figures: FigureSummary[]
  strand: string
  smoothTransitions: boolean
}

/** A filed report. `id` doubles as the IndexedDB key. */
export interface BugReport {
  id: string
  /** ISO 8601, UTC. */
  createdAt: string
  title: string
  note: string
  severity: BugSeverity
  env: BugEnvironment
  screen: BugScreenContext | null
  /** Verbatim config, so a session can load the exact state back. */
  config: PatternConfig | null
  configSummary: ConfigSummary | null
  /** PNG data URL of the pattern canvas, or null (not captured / no canvas). */
  screenshot: string | null
  console: ConsoleEntry[]
}

/** A report with its screenshot stripped — what the list view reads. */
export type BugReportMeta = Omit<BugReport, 'screenshot'> & { hasScreenshot: boolean }
