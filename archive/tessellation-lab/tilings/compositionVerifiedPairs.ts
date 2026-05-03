import type { CompositionConfig } from '../types/pattern'

/**
 * Step 13 / CS-1 — Composition strand-match allow-list.
 *
 * A composition pair (centre + background) only renders with strand-match
 * across the seam if its `${centre}::${background}` key appears in
 * `VERIFIED_COMPOSITION_PAIRS`. All other pairs fall back to hard-frame
 * rendering at the region boundary.
 *
 * v1 ships only **trivial-match pairs** — `centre === background` cases
 * where the same archimedean tessellation appears on both sides. The seam
 * is then structurally invisible to PIC: every contact-ray pair on either
 * side of the seam mirrors trivially, so strands flow continuously without
 * needing per-edge stitching code. The renderer (`compositionStrand.ts`)
 * detects this case via `centre === background` and runs PIC once over a
 * unified polygon set covering the full viewport.
 *
 * Genuinely non-trivial pairs (different centre + background tessellations)
 * are NOT yet verified. Adding one requires:
 *   1. Working out the seam geometry analytically (which edge midpoints on
 *      the seam coincide between the two tessellations, and at what
 *      contact angles the rays mirror cleanly).
 *   2. Adding the pair key here.
 *   3. Implementing a per-pair stitching branch inside `runCompositionPIC`.
 * See Open Question CS-1 in `TESSELLATION_REVAMP_PLAN.md`.
 */
export const VERIFIED_COMPOSITION_PAIRS: ReadonlySet<string> = new Set([
  // Trivial-match pairs (centre === background): seam vanishes structurally.
  'square::square',
  'hexagonal::hexagonal',
  'triangular::triangular',
  '4.8.8::4.8.8',
  '3.6.3.6::3.6.3.6',
])

export function pairKey(centre: string, background: string): string {
  return `${centre}::${background}`
}

export function isPairVerified(centre: string, background: string): boolean {
  return VERIFIED_COMPOSITION_PAIRS.has(pairKey(centre, background))
}

/**
 * True when match-mode rendering can use the unified-polygon shortcut
 * (one tessellation covers both regions; PIC runs once across the whole
 * viewport). Currently equivalent to `centre === background && verified`,
 * but kept as a named predicate so the strand-renderer dispatch reads
 * intent rather than mechanics.
 */
export function isTrivialMatchPair(centre: string, background: string): boolean {
  return centre === background && isPairVerified(centre, background)
}

/**
 * Resolve the *effective* boundary mode actually used for rendering.
 * The user's request (`cfg.boundary`) is honoured only for verified
 * pairs; everything else falls back to hard frame.
 *
 * Both polygon generation (`composition.ts`) and strand rendering
 * (`compositionStrand.ts`) call this so they agree.
 */
export function effectiveCompositionBoundary(cfg: CompositionConfig): 'match' | 'frame' {
  return cfg.boundary === 'match' && isPairVerified(cfg.centre, cfg.background)
    ? 'match'
    : 'frame'
}

/**
 * Backgrounds verified to strand-match with `centre`. Currently every
 * verified pair is trivial (centre === background), so this returns
 * `[centre]` for any centre that has a self-pair entry in the allow-list,
 * and `[]` otherwise.
 */
export function verifiedBackgroundsFor(centre: string): string[] {
  const out: string[] = []
  for (const key of VERIFIED_COMPOSITION_PAIRS) {
    const [c, b] = key.split('::')
    if (c === centre) out.push(b)
  }
  return out
}
