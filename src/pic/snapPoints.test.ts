import { describe, it, expect } from 'vitest'
import { snapToNearest } from './snapPoints'

// Characterization tests for the snap-line-length helper (thermo-nuclear review
// Chunk 7). `snapToNearest` is pure + used by FigureControls but was untested.
// `computeSnapPoints` (the other export) runs the full tiling+ray pipeline and
// is covered indirectly by the pipeline tests; the threshold/snap arithmetic is
// the part worth pinning here.

describe('snapToNearest', () => {
  it('returns the value unchanged when there are no snap points', () => {
    expect(snapToNearest(0.5, [])).toBe(0.5)
  })

  it('snaps to a point within the (explicit) threshold', () => {
    expect(snapToNearest(0.52, [0.5, 1.0], 0.05)).toBe(0.5)
  })

  it('leaves the value alone when no point is within the threshold', () => {
    expect(snapToNearest(0.7, [0.5, 1.0], 0.05)).toBe(0.7)
  })

  it('snaps to the NEAREST point, not the first within threshold', () => {
    // 0.74 is 0.24 from 0.5 and 0.26 from 1.0 → 0.5 wins under a wide threshold
    expect(snapToNearest(0.74, [0.5, 1.0], 0.3)).toBe(0.5)
    // 0.96 is 0.04 from 1.0 and 0.46 from 0.5 → 1.0
    expect(snapToNearest(0.96, [0.5, 1.0], 0.1)).toBe(1.0)
  })

  it('uses the default 0.08 threshold with fewer than two snap points', () => {
    expect(snapToNearest(0.55, [0.5])).toBe(0.5)  // 0.05 ≤ 0.08
    expect(snapToNearest(0.6, [0.5])).toBe(0.6)   // 0.10 > 0.08
  })

  it('derives an adaptive (tighter) threshold from the smallest gap', () => {
    // gap 0.02 → threshold = clamp(0.02·0.45, 0.015, 0.08) = 0.015
    const pts = [0.5, 0.52]
    expect(snapToNearest(0.51, pts)).toBe(0.5)   // 0.010 ≤ 0.015
    expect(snapToNearest(0.512, pts)).toBe(0.52) // nearer 0.52 (0.008) and ≤ 0.015
    expect(snapToNearest(0.55, pts)).toBe(0.55)  // 0.03 > 0.015 → unchanged
  })
})
