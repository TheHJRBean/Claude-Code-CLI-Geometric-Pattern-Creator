/**
 * Pure (non-JSX) logic for {@link ColourPicker}: hex validation, eye-dropper
 * normalisation, the module-level recent-colours store, and the
 * theme persistence + array transforms.
 *
 * Extracted from `ColourPicker.tsx` so the behaviour-bearing parts can be
 * unit-tested (the component itself is render wiring). `ColourPicker.tsx`
 * re-exports `pushRecentColour` + the `ColourTheme` type for existing import
 * sites.
 */

/* ── Hex validation + eye-dropper normalisation ── */

/** True for a canonical `#rrggbb` (6 hex digits, leading `#`). */
export function isHexColour(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c)
}

/**
 * Normalise an `EyeDropper.open()` result. The spec returns a 6-digit
 * `sRGBHex` but some implementations emit an 8-digit (alpha) `#rrggbbaa` —
 * drop the alpha. Returns a lower-cased `#rrggbb`, or `null` if the result
 * isn't a valid hex colour.
 */
export function normaliseEyeDropperHex(sRGBHex: string): string | null {
  const hex = sRGBHex.length === 9 ? sRGBHex.slice(0, 7) : sRGBHex
  return isHexColour(hex) ? hex.toLowerCase() : null
}

/**
 * Deepen a colour by multiplying it with itself channel-wise — the classic
 * "multiply" blend against itself, each sRGB channel `c → c²` (in 0–1). Washed-
 * out colours become richer and more saturated; a channel already at full or
 * zero is unchanged, so pure hues keep their hue. Repeatable — each call
 * intensifies further (converging toward black). Non-hex input is returned
 * unchanged. Used by the gradient stop bar's **Multiply** control to boost the
 * strength of the selected stop's colour.
 */
export function multiplyColour(colour: string): string {
  if (!isHexColour(colour)) return colour
  const body = colour.slice(1)
  const sq = (i: number): string => {
    const v = parseInt(body.slice(i * 2, i * 2 + 2), 16) / 255
    return Math.round(v * v * 255).toString(16).padStart(2, '0')
  }
  return `#${sq(0)}${sq(1)}${sq(2)}`
}

/* ── Recent-colours store (module-level, localStorage-backed) ── */

const RECENTS_KEY = 'recent-paint-colours'
const RECENTS_MAX = 10

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c): c is string => typeof c === 'string' && isHexColour(c)).slice(0, RECENTS_MAX)
  } catch {
    return []
  }
}

let recents: string[] = loadRecents()
const recentsListeners = new Set<() => void>()

/** Record a colour as actually used (a paint landed). Call from the paint
 * dispatch sites, not from picker interactions — "recent" means used. */
export function pushRecentColour(colour: string) {
  const c = colour.toLowerCase()
  if (!isHexColour(c)) return
  if (recents[0] === c) return
  recents = [c, ...recents.filter(r => r !== c)].slice(0, RECENTS_MAX)
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(recents)) } catch { /* ignore */ }
  recentsListeners.forEach(l => l())
}

export function subscribeRecents(l: () => void) {
  recentsListeners.add(l)
  return () => { recentsListeners.delete(l) }
}
export const getRecents = () => recents

/* ── Themes ── */

export interface ColourTheme {
  id: string
  name: string
  colours: string[]
}

export const THEMES_KEY = 'user-colour-themes'
export const ACTIVE_THEME_KEY = 'active-colour-theme'

export const BUILT_IN_THEMES: ColourTheme[] = [
  {
    id: 'builtin-art-deco',
    name: 'Art Deco',
    colours: ['#c9943a', '#1b2a4a', '#7b1e26', '#0f6b5c', '#2c2c34', '#b87333', '#e8dcc0', '#f4ecd8'],
  },
  {
    id: 'builtin-nile',
    name: 'Nile & Gold',
    colours: ['#0e4d64', '#137a63', '#c9a227', '#e1bb80', '#88ab75', '#cd5334', '#2d3a3a', '#edf6f9'],
  },
  {
    id: 'builtin-lapis',
    name: 'Classic Lapis',
    colours: ['#1f3b73', '#2e5ea8', '#d4af37', '#7d1d1d', '#0d6e57', '#c97f4e', '#101418', '#f5f0e1'],
  },
  {
    id: 'builtin-desert',
    name: 'Desert Dusk',
    colours: ['#9c4a1a', '#d98e32', '#f2d0a4', '#5f0f40', '#0b3954', '#ef798a', '#310e68', '#fdf0d5'],
  },
  {
    id: 'builtin-jewel',
    name: 'Jewel Box',
    colours: ['#9b1d64', '#5727a3', '#1c5d99', '#0f8b8d', '#119822', '#f2bb05', '#dd7230', '#a4031f'],
  },
]

export function loadUserThemes(): ColourTheme[] {
  try {
    const raw = localStorage.getItem(THEMES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is ColourTheme =>
      !!t && typeof t === 'object' &&
      typeof (t as ColourTheme).id === 'string' &&
      typeof (t as ColourTheme).name === 'string' &&
      Array.isArray((t as ColourTheme).colours) &&
      (t as ColourTheme).colours.every(c => typeof c === 'string'))
  } catch {
    return []
  }
}

export function saveUserThemes(themes: ColourTheme[]) {
  try { localStorage.setItem(THEMES_KEY, JSON.stringify(themes)) } catch { /* ignore */ }
}

/* ── Pure theme transforms (no state, no I/O) ── */

/**
 * Build a new user theme seeded with one colour. Returns `null` for an
 * empty/whitespace name. `id` is injected so the result is deterministic
 * (the component supplies `user-${Date.now().toString(36)}`).
 */
export function createUserTheme(name: string, seedColour: string, id: string): ColourTheme | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return { id, name: trimmed, colours: [seedColour.toLowerCase()] }
}

/** Append `colour` (lower-cased) to the named theme, skipping duplicates. */
export function addColourToTheme(themes: ColourTheme[], themeId: string, colour: string): ColourTheme[] {
  const c = colour.toLowerCase()
  return themes.map(t =>
    t.id === themeId && !t.colours.includes(c) ? { ...t, colours: [...t.colours, c] } : t)
}

/** Remove an exact `colour` from the named theme. */
export function removeColourFromTheme(themes: ColourTheme[], themeId: string, colour: string): ColourTheme[] {
  return themes.map(t =>
    t.id === themeId ? { ...t, colours: t.colours.filter(c => c !== colour) } : t)
}

/** Drop the named theme entirely. */
export function deleteUserTheme(themes: ColourTheme[], themeId: string): ColourTheme[] {
  return themes.filter(t => t.id !== themeId)
}
