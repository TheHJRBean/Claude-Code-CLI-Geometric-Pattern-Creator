/**
 * Download filenames.
 *
 * Every export names its file after the saved entry it came from, so a folder
 * of downloads still says which tessellation is which. Unsaved work (and any
 * name that sanitises away to nothing) falls back to the historic default.
 */

export const DEFAULT_EXPORT_BASENAME = 'islamic-pattern'

/** Characters no mainstream filesystem accepts in a name, plus control codes. */
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[\x00-\x1f\x7f/\\?%*:|"<>]/g

const MAX_BASENAME = 80

/**
 * Turn a user-typed save name into a safe filename stem. Returns `null` when
 * nothing usable survives, so callers can pick their own fallback.
 */
export function sanitiseFileBase(name: string | null | undefined): string | null {
  if (!name) return null
  const cleaned = name
    .replace(ILLEGAL, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    // Leading/trailing dots and dashes read as hidden files or as noise.
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_BASENAME)
    // The slice can re-expose a trailing separator.
    .replace(/[-.]+$/g, '')
  return cleaned.length > 0 ? cleaned : null
}

/**
 * `exportFileName('My Star 4.8.8', 'svg')` → `'My-Star-4.8.8.svg'`.
 * An absent or unusable name gives `'islamic-pattern.svg'`.
 */
export function exportFileName(name: string | null | undefined, extension: string): string {
  return `${sanitiseFileBase(name) ?? DEFAULT_EXPORT_BASENAME}.${extension}`
}
