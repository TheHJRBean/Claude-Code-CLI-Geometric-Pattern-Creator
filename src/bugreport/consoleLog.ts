import type { ConsoleEntry } from './types'

/**
 * A small ring buffer of console errors/warnings and uncaught runtime errors,
 * so a bug report carries the noise that preceded it.
 *
 * By the time the user notices something is wrong and reaches for the bug
 * button, the DevTools console is usually the one piece of evidence they don't
 * think to copy — and a stack trace turns a vague "the strands went weird"
 * into a one-line diagnosis. Installed once at app start, capped so a runaway
 * render loop can't grow it without bound.
 *
 * The patched methods **always forward to the originals**: DevTools, React's
 * own warnings and any other consumer see exactly what they saw before.
 */

/** How many entries to keep. Oldest are dropped first. */
export const CONSOLE_BUFFER_LIMIT = 50

/** Longest single entry kept, in characters — one huge object dump must not
 *  crowd out the other 49 entries (or bloat the stored report). */
export const CONSOLE_ENTRY_MAX_CHARS = 2000

let buffer: ConsoleEntry[] = []
let installed = false

/** Render one console argument as text, without throwing on cycles or getters. */
export function formatConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`
  if (arg === null) return 'null'
  if (arg === undefined) return 'undefined'
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg)
    } catch {
      // Cyclic or getter-throwing object — the constructor name is still a
      // more useful breadcrumb than dropping the argument entirely.
      return `[${(arg as object).constructor?.name ?? 'object'}]`
    }
  }
  return String(arg)
}

export function formatConsoleArgs(args: unknown[]): string {
  return args.map(formatConsoleArg).join(' ')
}

/** Append an entry, trimming to the buffer/entry caps. Exported for tests and
 *  for the window-level handlers below. */
export function recordConsoleEntry(entry: Omit<ConsoleEntry, 'at'> & { at?: string }): void {
  const text = entry.text.length > CONSOLE_ENTRY_MAX_CHARS
    ? `${entry.text.slice(0, CONSOLE_ENTRY_MAX_CHARS)}… (truncated)`
    : entry.text
  buffer.push({ at: entry.at ?? new Date().toISOString(), level: entry.level, source: entry.source, text })
  if (buffer.length > CONSOLE_BUFFER_LIMIT) buffer = buffer.slice(-CONSOLE_BUFFER_LIMIT)
}

/** Snapshot of the buffer, oldest first. */
export function recentConsoleEntries(): ConsoleEntry[] {
  return [...buffer]
}

/** Drop everything — used by the modal's "clear log" and by tests. */
export function clearConsoleEntries(): void {
  buffer = []
}

/**
 * Patch `console.error`/`console.warn` and listen for uncaught errors.
 * Idempotent: calling it twice does not double-record.
 */
export function installConsoleCapture(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const originalError = console.error.bind(console)
  const originalWarn = console.warn.bind(console)

  console.error = (...args: unknown[]) => {
    recordConsoleEntry({ level: 'error', source: 'console', text: formatConsoleArgs(args) })
    originalError(...args)
  }
  console.warn = (...args: unknown[]) => {
    recordConsoleEntry({ level: 'warn', source: 'console', text: formatConsoleArgs(args) })
    originalWarn(...args)
  }

  window.addEventListener('error', event => {
    const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : ''
    recordConsoleEntry({
      level: 'error',
      source: 'window',
      text: `${event.message}${where}${event.error?.stack ? `\n${event.error.stack}` : ''}`,
    })
  })

  window.addEventListener('unhandledrejection', event => {
    recordConsoleEntry({
      level: 'error',
      source: 'promise',
      text: `Unhandled rejection: ${formatConsoleArg(event.reason)}`,
    })
  })
}
