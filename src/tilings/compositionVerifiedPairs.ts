/**
 * Step 13 / CS-1 — Composition strand-match allow-list.
 *
 * A composition pair (centre + background) only renders with strand-match
 * across the seam if its `${centre}::${background}` key appears in
 * `VERIFIED_COMPOSITION_PAIRS`. All other pairs fall back to hard-frame
 * rendering at the region boundary.
 *
 * The set is intentionally empty in v1 — none of the four shipping presets
 * have been analytically verified yet:
 *   - hexadecagonal-rosette (16) + 4.8.8     — strand angles 78.75° vs 67.5°,
 *                                              probably no clean match.
 *   - 4.6.12 + Hexagonal                     — 4-gons / hexagons inside 4.6.12
 *                                              don't match the background.
 *   - hexadecagonal-rosette (16) + Square    — only 4-fold subgroup shared,
 *                                              strand angles differ.
 *   - decagonal-rosette (10) + Hexagonal     — only 2-fold shared; classically
 *                                              drawn with a hard frame.
 *
 * Add a pair here ONLY after working out the geometry on paper or in
 * `RESEARCH-TILING-CONFIGURATIONS.md`.
 */
export const VERIFIED_COMPOSITION_PAIRS: ReadonlySet<string> = new Set([
  // (empty — see comment above)
])

export function pairKey(centre: string, background: string): string {
  return `${centre}::${background}`
}

export function isPairVerified(centre: string, background: string): boolean {
  return VERIFIED_COMPOSITION_PAIRS.has(pairKey(centre, background))
}

/**
 * Backgrounds verified to strand-match with `centre`. Empty when the centre
 * has no verified partners (which is the case for every centre in v1).
 */
export function verifiedBackgroundsFor(centre: string): string[] {
  const out: string[] = []
  for (const key of VERIFIED_COMPOSITION_PAIRS) {
    const [c, b] = key.split('::')
    if (c === centre) out.push(b)
  }
  return out
}
