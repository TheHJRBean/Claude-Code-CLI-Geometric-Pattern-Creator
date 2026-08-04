/**
 * Download filenames.
 *
 * Every export names its file after the config it came from, so a folder of
 * downloads still says which tessellation is which. Priority: the library
 * entry's own name (what the user typed for this piece of work) → the name the
 * config designates for itself (its preset / Configuration) → the historic
 * `islamic-pattern` default for a from-scratch Patch.
 */

import type { PatternConfig } from '../types/pattern'
import { TILINGS } from '../tilings/index'

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

/**
 * The name a config designates for itself, when it has one — the preset it was
 * built from (`editor.presetId` on a converted Patch, `tiling.type` on a legacy
 * render), else the Builder Configuration it is a Patch of. A Patch the user
 * drew from scratch designates nothing and returns null.
 *
 * This is the *fallback*: a library entry's own name always wins, because that
 * is the name the user typed for this particular piece of work.
 */
export function patternDisplayName(config: PatternConfig): string | null {
  if (config.tiling.type === 'editor') {
    const presetId = config.editor?.presetId
    if (presetId) return TILINGS[presetId]?.label ?? presetId
    return config.editor?.configuration ?? null
  }
  return TILINGS[config.tiling.type]?.label ?? config.tiling.type ?? null
}
