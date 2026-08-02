import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PatternConfig } from '../types/pattern'
import { useTheme } from '../theme/ThemeContext'
import { rasterizeSvgToDataUrl } from '../export/exportSVG'
import { recentConsoleEntries } from './consoleLog'
import type { BugEnvironment, BugFact, BugScreenContext, ConsoleEntry } from './types'

/**
 * Wiring for the in-app **Bug capture**.
 *
 * The problem this solves: the facts worth capturing are spread across the
 * app — the workspace knows its Phase and Tool, the reducer owns the config,
 * the DOM owns the rendered canvas — and none of them are reachable from a
 * button in the top bar. Prop-drilling a dozen values out of an 1100-line
 * workspace component to feed a modal would be worse than the bug reports.
 *
 * So screens *contribute*: each calls `useBugScreenContext` with what it knows,
 * and the provider calls those contributors back at the instant the user hits
 * the button. Contributors are held in a ref keyed by `useId`, so registering
 * one costs no re-renders and a screen that unmounts takes its facts with it.
 *
 * The snapshot is taken **on open, not on save** — by the time the user has
 * typed a note, they may have clicked around; what matters is the state at the
 * moment the thing went wrong.
 */

/** What a screen contributes. `config` is optional — the Gallery has none. */
export interface BugScreenSource {
  /** Workspace name as the user sees it: "Lab", "Generator", "Gallery". */
  screen: string
  facts: BugFact[]
  config?: PatternConfig | null
}

/** Everything gathered at the moment the reporter opened. */
export interface BugCaptureSnapshot {
  env: BugEnvironment
  screen: BugScreenContext | null
  config: PatternConfig | null
  console: ConsoleEntry[]
  /** PNG data URL of the pattern canvas; null when there is no canvas on
   *  screen (the Gallery) or rasterisation failed. */
  screenshot: string | null
}

interface BugReportContextValue {
  /** True while the reporter panel is open. */
  isOpen: boolean
  /** The capture taken when the panel opened; null while closed, and null
   *  briefly on open while the screenshot rasterises. */
  snapshot: BugCaptureSnapshot | null
  /** True while the screenshot is still being rasterised. */
  capturing: boolean
  open: () => void
  close: () => void
  register: (key: string, source: () => BugScreenSource) => () => void
  /** Re-run the capture — the panel's "recapture" affordance. */
  recapture: () => void
}

const BugReportContext = createContext<BugReportContextValue | null>(null)

/**
 * The live pattern canvas. Marked with a data attribute in `PatternSVG` rather
 * than resolved through a ref chain: every workspace renders the same
 * component, and the attribute is stable across the Lab / Generator / any
 * future screen without threading a ref through each of them.
 *
 * Exported so the export/screenshot paths can share one definition of "the
 * canvas" if another caller ever needs it.
 */
export const PATTERN_CANVAS_SELECTOR = 'svg[data-pattern-canvas]'

/** Width of the captured screenshot in px. Large enough to read Strand detail
 *  and picker overlays, small enough to keep a stored report ~200–400 KB. */
const SCREENSHOT_WIDTH = 1400

function readEnvironment(appMode: string, theme: string): BugEnvironment {
  return {
    commit: import.meta.env.VITE_COMMIT_MSG ?? 'unknown build',
    appMode,
    theme,
    userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    viewport: {
      width: typeof window === 'undefined' ? 0 : window.innerWidth,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
    },
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    timeZone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        return 'unknown'
      }
    })(),
  }
}

/**
 * Rasterise the on-screen pattern canvas.
 *
 * Deliberately the *pattern* canvas rather than the whole page: the existing
 * `rasterizeSvgToDataUrl` already handles the export-exclusion stripping and
 * CSS-variable inlining an `<svg>` needs to survive serialisation, and a
 * full-page capture would mean a new DOM-rasteriser dependency. The panel
 * chrome the shot leaves out is exactly what the screen-facts table records.
 */
async function captureCanvas(): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const svg = document.querySelector<SVGSVGElement>(PATTERN_CANVAS_SELECTOR)
  if (!svg) return null
  const aspect = (svg.clientHeight || 900) / (svg.clientWidth || 1200)
  try {
    return await rasterizeSvgToDataUrl(svg, {
      width: SCREENSHOT_WIDTH,
      height: Math.max(1, Math.round(SCREENSHOT_WIDTH * aspect)),
      // Keep the canvas's own background so the shot looks like what the user
      // is looking at, rather than the export default.
      background: getComputedStyle(svg).backgroundColor || undefined,
    })
  } catch {
    return null
  }
}

export function BugReportProvider({ appMode, children }: { appMode: string; children: ReactNode }) {
  const { theme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<BugCaptureSnapshot | null>(null)
  const [capturing, setCapturing] = useState(false)
  const sources = useRef(new Map<string, () => BugScreenSource>())
  // Latest values read inside `capture`, which is called from an event handler
  // long after render — a ref keeps `capture` stable without going stale.
  const envInputs = useRef({ appMode, theme })
  envInputs.current = { appMode, theme }

  const register = useCallback((key: string, source: () => BugScreenSource) => {
    sources.current.set(key, source)
    return () => { sources.current.delete(key) }
  }, [])

  const capture = useCallback(async () => {
    const { appMode: mode, theme: activeTheme } = envInputs.current
    // Exactly one screen is mounted at a time; if that ever stops being true,
    // the first registered contributor wins rather than the facts merging into
    // an ambiguous blend.
    const contributor = sources.current.values().next().value
    const source = contributor ? contributor() : null
    const env = readEnvironment(mode, activeTheme)
    const consoleEntries = recentConsoleEntries()
    // Everything except the screenshot is synchronous, so publish it
    // immediately — the note field is usable while the raster is still going.
    setSnapshot({
      env,
      screen: source ? { screen: source.screen, facts: source.facts } : null,
      config: source?.config ?? null,
      console: consoleEntries,
      screenshot: null,
    })
    setCapturing(true)
    const screenshot = await captureCanvas()
    setCapturing(false)
    setSnapshot(prev => (prev ? { ...prev, screenshot } : prev))
  }, [])

  const open = useCallback(() => {
    setIsOpen(true)
    void capture()
  }, [capture])

  const close = useCallback(() => {
    setIsOpen(false)
    setSnapshot(null)
  }, [])

  // Ctrl/Cmd+Shift+B — reachable mid-gesture, which matters: the state worth
  // capturing is often one the user is holding (a picker open, a drag staged),
  // and crossing the canvas to the top bar can be what dismisses it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setIsOpen(current => {
          if (current) return current
          void capture()
          return true
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [capture])

  const value = useMemo<BugReportContextValue>(
    () => ({ isOpen, snapshot, capturing, open, close, register, recapture: () => void capture() }),
    [isOpen, snapshot, capturing, open, close, register, capture],
  )

  return <BugReportContext.Provider value={value}>{children}</BugReportContext.Provider>
}

/** Access the reporter. Returns null outside a provider (tests, storybook). */
export function useBugReporter(): BugReportContextValue | null {
  return useContext(BugReportContext)
}

/**
 * Contribute this screen's context to any bug filed while it is mounted.
 *
 * Call it with the live values each render; they are read through a ref at
 * capture time, so passing a freshly-built object every render is free.
 */
export function useBugScreenContext(source: BugScreenSource): void {
  const ctx = useContext(BugReportContext)
  const key = useId()
  const latest = useRef(source)
  latest.current = source

  useEffect(() => {
    if (!ctx) return
    return ctx.register(key, () => latest.current)
  }, [ctx, key])
}
