import type { PatternConfig } from '../types/pattern'
import type { DecorationConfig } from '../types/editor'

/**
 * Where a config's decoration lives — the single place that decides.
 *
 * Decoration attaches to the **substrate being decorated**, and a config has
 * exactly one:
 *
 * - a **Builder Patch** (`config.editor`) keeps its decoration on the Patch,
 *   where it has always lived. Untouched by this module's introduction, so no
 *   existing save migrates and no Patch behaviour changes.
 * - a **legacy substrate** (a Gallery preset, a Generator sample, any BFS /
 *   Taprats tiling) has no Patch to hang it on, so its decoration lives at
 *   `config.decoration`.
 *
 * The two homes are mutually exclusive by construction: `tiling.type ===
 * 'editor'` iff there is a Patch. Reading through this pair rather than
 * touching either field directly is what keeps that invariant true — a
 * `config.editor.decoration` written onto a legacy config (or vice versa)
 * would be invisible to the renderer and silently lost on the next save.
 *
 * Deliberately NOT a migration: moving every existing Patch save's decoration
 * to the top level would rewrite the user's whole library to buy symmetry that
 * only this module's callers would ever see.
 */

/** A fresh empty decoration block. A factory, not a shared constant — the
 *  reducer spreads it into new state and a shared object would alias. */
export function emptyDecoration(): DecorationConfig {
  return { version: 1, strandColours: [], voidFills: [] }
}

/** The config's decoration, from whichever home its substrate uses. */
export function patternDecoration(config: PatternConfig): DecorationConfig | undefined {
  return config.editor ? config.editor.decoration : config.decoration
}

/**
 * Return `config` with its decoration replaced, written to the home its
 * substrate uses. `undefined` removes the block entirely (the key is deleted,
 * not set to undefined, so a cleared config is byte-identical to one that
 * never had decoration — save fingerprints and `JSON.stringify` comparisons
 * stay stable).
 */
export function withPatternDecoration(
  config: PatternConfig,
  next: DecorationConfig | undefined,
): PatternConfig {
  if (config.editor) {
    if (next) return { ...config, editor: { ...config.editor, decoration: next } }
    const { decoration: _drop, ...editor } = config.editor
    void _drop
    return { ...config, editor }
  }
  if (next) return { ...config, decoration: next }
  const { decoration: _drop, ...rest } = config
  void _drop
  return rest
}

/**
 * Whether there is anything to decorate. False only for the empty Lab (after
 * EDITOR_CLEAR, which leaves `tiling.type === ''`) — a guard so a stray paint
 * action can't attach decoration to a config with no substrate under it, where
 * it would be unreachable and would ride along into every later save.
 */
export function canDecorate(config: PatternConfig): boolean {
  return !!config.editor || config.tiling.type !== ''
}
