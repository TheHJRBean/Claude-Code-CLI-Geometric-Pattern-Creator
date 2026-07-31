import { describe, it, expect } from 'vitest'
import { buildVoidTargeting } from './paintTargets'
import { unclippedSignatures } from './voids'

/**
 * The bound-cut authoring rule. A Void the extraction bound cut carries an
 * outline — and therefore a signature, a centroid and every scope key built
 * from them — that depends on where the viewport edge fell, so a record bound
 * to one dies on the next pan. See `voidsBoundStability.test.ts` for the
 * measurement that pins that claim on real fields.
 */

const v = (signature: string, clipped?: boolean, tag = '') =>
  ({ signature, clipped, tag })

describe('unclippedSignatures', () => {
  it('admits only classes with an un-cut member', () => {
    const s = unclippedSignatures([v('a'), v('a', true), v('b', true)])
    expect([...s]).toEqual(['a'])
  })

  it('admits everything when nothing is un-cut', () => {
    const s = unclippedSignatures([v('a', true), v('b', true)])
    expect(s.size).toBe(2)
  })

  it('is empty for an empty field', () => {
    expect(unclippedSignatures([]).size).toBe(0)
  })
})

describe('buildVoidTargeting', () => {
  it('refuses a class that exists only as bound-cut faces, at every scope', () => {
    const t = buildVoidTargeting([v('real'), v('cutOnly', true)])
    for (const bySignatureAlone of [true, false]) {
      expect(t.canMint(v('cutOnly', true), bySignatureAlone)).toBe(false)
    }
  })

  it('allows a cut face of a real class only where the key is the signature', () => {
    const t = buildVoidTargeting([v('real'), v('real', true)])
    // congruent / stamp — the record lands on the class, which is durable.
    expect(t.canMint(v('real', true), true)).toBe(true)
    // cell / patch / instance also key on the Void's own centroid + orbit,
    // which the cut displaces.
    expect(t.canMint(v('real', true), false)).toBe(false)
    // The un-cut members are fine everywhere.
    expect(t.canMint(v('real'), false)).toBe(true)
  })

  it('stays permissive when the whole field is cut (viewport under one repeat)', () => {
    const t = buildVoidTargeting([v('a', true), v('b', true)])
    expect(t.canMint(v('a', true), false)).toBe(true)
    expect(t.canMint(v('b', true), true)).toBe(true)
  })

  it('stays permissive when no Void is flagged at all (periodic fast path)', () => {
    const t = buildVoidTargeting([v('a'), v('b')])
    expect(t.canMint(v('a'), false)).toBe(true)
  })

  it('representative is an un-cut member, even when a cut one comes first', () => {
    const cut = v('h', true, 'cut')
    const whole = v('h', false, 'whole')
    const t = buildVoidTargeting([cut, whole])
    expect(t.representative.get('h')).toBe(whole)
  })

  it('has no representative for a cut-only class', () => {
    const t = buildVoidTargeting([v('real'), v('cutOnly', true)])
    expect(t.representative.get('cutOnly')).toBeUndefined()
  })
})
