import { describe, it, expect } from 'vitest'
import { minRotation, hash8 } from './voids'

// Characterization of the signature canonicalisers (thermo-nuclear review
// Chunk 9). `minRotation` + `hash8` underpin EVERY persisted Void/strand
// signature but were untested. `minRotation`'s comment warns it must reproduce
// the pre-Booth O(m²) joined-string ordering EXACTLY — a deviation silently
// re-canonicalises and re-hashes existing saves. The differential test below is
// the regression guard for that invariant.

/** Reference implementation = the pre-Booth O(m²) scan (all rotations of the
 *  ring and its reversal, joined with ';', lexicographic min). `minRotation`
 *  must match this for every input. */
function minRotationRef(tokens: string[]): string {
  if (tokens.length === 0) return ''
  const rev = tokens.slice().reverse()
  let best: string | null = null
  for (const ring of [tokens, rev]) {
    for (let i = 0; i < ring.length; i++) {
      const s = ring.slice(i).concat(ring.slice(0, i)).join(';')
      if (best === null || s < best) best = s
    }
  }
  return best!
}

describe('minRotation', () => {
  it('returns "" for an empty ring', () => {
    expect(minRotation([])).toBe('')
  })

  it('is invariant under rotation of the ring', () => {
    const ring = ['a3', 'e12', 'a5', 'e8', 'a3', 'e12']
    const rotated = ring.slice(2).concat(ring.slice(0, 2))
    expect(minRotation(rotated)).toBe(minRotation(ring))
  })

  it('is invariant under reversal of the ring', () => {
    const ring = ['a3', 'e12', 'a5', 'e8', 'a7', 'e4']
    expect(minRotation(ring.slice().reverse())).toBe(minRotation(ring))
  })

  it('matches the O(m²) reference on hand-picked prefix-token cases', () => {
    // The ';'-suffix compare is what keeps "a1" and "a12" ordered like the old
    // joined strings (rather than "a1" ranking as a prefix of "a12").
    for (const ring of [
      ['a1', 'a12', 'a1', 'a2'],
      ['e1', 'e10', 'e2'],
      ['a1', 'e1', 'a1', 'e1'],
    ]) {
      expect(minRotation(ring)).toBe(minRotationRef(ring))
    }
  })

  it('matches the O(m²) reference across randomised rings (differential fuzz)', () => {
    // Deterministic LCG so failures reproduce.
    let seed = 0x2545f491
    const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
    const tokVals = ['a0', 'a1', 'a2', 'a10', 'a12', 'e0', 'e1', 'e5', 'e10', 'e11']
    for (let trial = 0; trial < 2000; trial++) {
      const len = 2 + Math.floor(rand() * 10) // 2..11 tokens
      const ring = Array.from({ length: len }, () => tokVals[Math.floor(rand() * tokVals.length)])
      expect(minRotation(ring)).toBe(minRotationRef(ring))
    }
  })
})

describe('hash8', () => {
  it('is deterministic and 8 lowercase hex chars', () => {
    const h = hash8('a3;e12;a5')
    expect(h).toMatch(/^[0-9a-f]{8}$/)
    expect(hash8('a3;e12;a5')).toBe(h)
  })

  it('distinguishes different inputs', () => {
    expect(hash8('a3;e12')).not.toBe(hash8('a3;e13'))
  })

  it('hashes the empty string to a stable value', () => {
    expect(hash8('')).toMatch(/^[0-9a-f]{8}$/)
  })
})
