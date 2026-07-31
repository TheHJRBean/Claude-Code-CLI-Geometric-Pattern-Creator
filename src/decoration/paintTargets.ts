import { unclippedSignatures } from './voids'

/**
 * Which Voids may **mint a decoration record**, and which Void's outline
 * should stand for a congruent class.
 *
 * Void extraction closes the arrangement against a convex bound — the visible
 * viewport rect, or the frame bbox + margin. Faces straddling that bound come
 * out CUT, and everything identifying them is then a function of where the
 * bound fell: the outline, hence the congruent signature, hence the centroid
 * and every Grouping-scope key built from it. Probed across four substrates
 * with a 37×23-unit pan, **none** of the bound-cut-only signatures survived
 * while **every** interior signature did — so a paint or stamp bound to a cut
 * face is dead as soon as the view moves, having looked fine when applied.
 *
 * The rule this module encodes is deliberately narrow, because cut faces are
 * not junk to *render* — one belonging to a painted class must keep showing
 * that class's fill (`colourVoids` / `resolveVoidStamps` correctly ignore all
 * of this, the same reasoning that keeps the framed extraction bound wider
 * than the Frame outline). It is only *authoring* through a cut face that
 * can't be made durable.
 */
export interface VoidTargeting<T> {
  /** First un-cut member of each congruent class — the outline a stamp canvas
   * is exported at and a gradient's canonical pose is seeded from. Absent for
   * a class with no un-cut member (which `canMint` already refuses). */
  representative: Map<string, T>
  /**
   * True when clicking `v` yields a record key that survives a pan.
   *
   * `keyedBySignatureAlone` — the `congruent` scope and the Stamp target,
   * whose key is the bare congruent signature. A cut face of a REAL class
   * passes: the record lands on the class, which is what clicking that shape
   * meant. The finer rungs (`cell` / `patch` / `instance`) additionally key on
   * the Void's own centroid and lattice orbit, which the cut displaces, so
   * they need an un-cut Void.
   */
  canMint(v: T, keyedBySignatureAlone: boolean): boolean
}

export function buildVoidTargeting<T extends { signature: string; clipped?: boolean }>(
  voids: readonly T[],
): VoidTargeting<T> {
  const representative = new Map<string, T>()
  for (const v of voids) {
    if (!v.clipped && !representative.has(v.signature)) representative.set(v.signature, v)
  }
  const stableSigs = unclippedSignatures(voids)
  // Nothing un-cut anywhere (a viewport smaller than one repeat, or the
  // periodic fast path's already-interior representatives, which carry no
  // flag at all): there is no interior evidence to filter on, so stay fully
  // permissive rather than making the whole canvas inert.
  const anyUnclipped = representative.size > 0
  return {
    representative,
    canMint: (v, keyedBySignatureAlone) =>
      stableSigs.has(v.signature) && (keyedBySignatureAlone || !anyUnclipped || !v.clipped),
  }
}
