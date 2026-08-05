import { describe, it, expect } from 'vitest'
import {
  gapCount,
  gapCrossSections,
  gapFillMaskBands,
  gapRingCount,
  gapRingFills,
  lineBandWidths,
  readLineStyleFields,
  ringGapIndices,
  strandStyleAttrs,
} from './strandStyle'

/**
 * Reconstruct the drawn cross-section from the mask bands: what the viewer
 * sees is alternating ink / gap thicknesses across the stroke, so that — not
 * the band widths themselves — is what these tests assert on.
 *
 * A band of width `b` covers `|offset| ≤ b/2`; bands alternate cut, restore,
 * cut, … over the full-width stroke. Walking the half-widths outside-in gives
 * one half of the symmetric section, ending at the centre.
 */
function halfSection(w: number, bands: number[]): { ink: number[]; gaps: number[] } {
  const edges = [w, ...bands, 0].map(b => b / 2)
  const ink: number[] = []
  const gaps: number[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const thickness = edges[i] - edges[i + 1]
    if (thickness <= 1e-9) continue
    ;(i % 2 === 0 ? ink : gaps).push(thickness)
  }
  return { ink, gaps }
}

describe('strandStyleAttrs', () => {
  it('solid: no mask, no bands', () => {
    expect(strandStyleAttrs('solid', 4))
      .toEqual({ masked: false, maskBands: [], innerFillWidth: 0, gapRingWidths: [] })
  })

  it('lines: defaults to 2 lines at an equal line/gap ratio', () => {
    const a = strandStyleAttrs('lines', 3)
    expect(a.masked).toBe(true)
    expect(a.maskBands).toHaveLength(1) // one cut = the single gap
    expect(a.maskBands[0]).toBeCloseTo(1, 9) // 3 = line + gap + line, all equal
    expect(a.innerFillWidth).toBeCloseTo(1, 9)
  })

  it('reproduces the withdrawn `double` cross-section at ratio 0.5', () => {
    const { ink, gaps } = halfSection(4, strandStyleAttrs('lines', 4, 0.5, 2).maskBands)
    expect(ink).toHaveLength(1)
    expect(ink[0]).toBeCloseTo(1, 9)  // 0.25w line
    expect(gaps[0]).toBeCloseTo(1, 9) // half of the 0.5w centre gap
  })

  it('every count from 2 to 10 lays down that many lines filling the width', () => {
    const w = 12
    for (let n = 2; n <= 10; n++) {
      const { line, gap } = lineBandWidths(w, n, 1.4)
      const { ink, gaps } = halfSection(w, strandStyleAttrs('lines', w, 1.4, n).maskBands)
      // Half-section: ceil(n/2) ink runs (the centre one halved when n is odd).
      const drawnLines = ink.length * 2 - (n % 2 === 1 ? 1 : 0)
      expect(drawnLines).toBe(n)
      for (const t of ink.slice(0, ink.length - 1)) expect(t).toBeCloseTo(line, 9)
      for (const g of gaps.slice(0, gaps.length - 1)) expect(g).toBeCloseTo(gap, 9)
      // Everything drawn adds back up to the stroke width.
      const total = 2 * (ink.reduce((s, t) => s + t, 0) + gaps.reduce((s, g) => s + g, 0))
      expect(total).toBeCloseTo(w, 6)
    }
  })

  it('a higher ratio thickens the lines and tightens the gaps', () => {
    const thick = lineBandWidths(10, 4, 3)
    const thin = lineBandWidths(10, 4, 0.4)
    expect(thick.line / thick.gap).toBeCloseTo(3, 9)
    expect(thin.line / thin.gap).toBeCloseTo(0.4, 9)
    expect(thick.line).toBeGreaterThan(thin.line)
    expect(4 * thick.line + 3 * thick.gap).toBeCloseTo(10, 9)
  })

  it('the inner fill spans everything inside the outermost lines', () => {
    const w = 8
    const { line } = lineBandWidths(w, 5, 2)
    expect(strandStyleAttrs('lines', w, 2, 5).innerFillWidth).toBeCloseTo(w - 2 * line, 9)
  })

  it('clamps out-of-band counts and ratios instead of emitting a degenerate stroke', () => {
    expect(strandStyleAttrs('lines', 4, 1, 99)).toEqual(strandStyleAttrs('lines', 4, 1, 10))
    expect(strandStyleAttrs('lines', 4, 1, 0)).toEqual(strandStyleAttrs('lines', 4, 1, 2))
    expect(strandStyleAttrs('lines', 4, 1000, 3)).toEqual(strandStyleAttrs('lines', 4, 4, 3))
    expect(strandStyleAttrs('lines', 4, NaN, 3)).toEqual(strandStyleAttrs('lines', 4, 1, 3))
    for (const band of strandStyleAttrs('lines', 4, 4, 10).maskBands) {
      expect(band).toBeGreaterThan(0)
      expect(band).toBeLessThan(4)
    }
  })
})

describe('readLineStyleFields', () => {
  it('passes the current vocabulary through, clamped', () => {
    expect(readLineStyleFields({ lineStyle: 'lines', lineCount: 6, styleRatio: 2 }))
      .toEqual({ lineStyle: 'lines', lineCount: 6, styleRatio: 2 })
    expect(readLineStyleFields({ lineStyle: 'solid' })).toEqual({ lineStyle: 'solid' })
  })

  it('translates the withdrawn styles', () => {
    expect(readLineStyleFields({ lineStyle: 'double' }))
      .toEqual({ lineStyle: 'lines', lineCount: 2, styleRatio: 0.5 })
    expect(readLineStyleFields({ lineStyle: 'triple' }).lineCount).toBe(3)
    expect(readLineStyleFields({ lineStyle: 'dashed' })).toEqual({ lineStyle: 'solid' })
    expect(readLineStyleFields({ lineStyle: 'dotted' })).toEqual({ lineStyle: 'solid' })
  })

  it('an explicit count/ratio wins over a legacy style name', () => {
    expect(readLineStyleFields({ lineStyle: 'double', lineCount: 7, styleRatio: 3 }))
      .toEqual({ lineStyle: 'lines', lineCount: 7, styleRatio: 3 })
  })

  it('drops an unknown style rather than guessing', () => {
    expect(readLineStyleFields({ lineStyle: 'zigzag' })).toEqual({})
    expect(readLineStyleFields({})).toEqual({})
  })

  it('ignores a count/ratio carried by a solid stroke', () => {
    expect(readLineStyleFields({ lineStyle: 'solid', lineCount: 4, styleRatio: 3 }))
      .toEqual({ lineStyle: 'solid' })
  })
})

describe('gap rings (the `matching` grain)', () => {
  it('counts one ring per radial position, pairing a gap with its mirror', () => {
    // n lines ⇒ n−1 gaps, but a gap and its mirror across the centreline are
    // one ring: only an even count's centre gap stands alone.
    expect([2, 3, 4, 5, 6, 10].map(gapCount)).toEqual([1, 2, 3, 4, 5, 9])
    expect([2, 3, 4, 5, 6, 10].map(gapRingCount)).toEqual([1, 1, 2, 2, 3, 5])
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(strandStyleAttrs('lines', 6, 1, n).gapRingWidths).toHaveLength(gapRingCount(n))
    }
  })

  it('pairs the gap indices a ring owns, outside in', () => {
    expect(ringGapIndices(0, 6)).toEqual([0, 4]) // 6 lines, 5 gaps
    expect(ringGapIndices(1, 6)).toEqual([1, 3])
    expect(ringGapIndices(2, 6)).toEqual([2, 2]) // lone centre gap
    expect(ringGapIndices(0, 2)).toEqual([0, 0])
  })

  it('ring widths are the cut bands, so each is the underlay for its own gap', () => {
    const a = strandStyleAttrs('lines', 8, 1, 5)
    expect(a.gapRingWidths).toEqual([a.maskBands[0], a.maskBands[2]])
    expect(a.gapRingWidths[0]).toBe(a.innerFillWidth)
  })

  it('all mode paints every ring the one colour; matching reads its pair', () => {
    const a = strandStyleAttrs('lines', 8, 1, 6)
    expect(gapRingFills(a, { innerFill: '#abc123' }, 6).map(f => f.colour))
      .toEqual(['#abc123', '#abc123', '#abc123'])
    expect(gapRingFills(a, {
      gapFillMode: 'matching',
      gapFills: ['#111111', '#222222', '#333333', '#222222', '#111111'],
      innerFill: '#abc123', // ignored once a per-gap grain is chosen
    }, 6).map(f => f.colour)).toEqual(['#111111', '#222222', '#333333'])
  })

  it('an asymmetric set collapses to the outer gap when drawn as rings', () => {
    // Authored as `individual` on the border, then rendered somewhere that
    // can only do symmetric bands (a Strand): show the outer gap's colour
    // rather than dropping the fill.
    const a = strandStyleAttrs('lines', 8, 1, 4)
    expect(gapRingFills(a, {
      gapFillMode: 'individual',
      gapFills: ['#111111', '#222222', '#333333'],
    }, 4).map(f => f.colour)).toEqual(['#111111', '#222222'])
  })

  it('an unset gap is unfilled, not inherited', () => {
    const a = strandStyleAttrs('lines', 8, 1, 6)
    expect(gapRingFills(a, { gapFillMode: 'matching', gapFills: ['#111111'] }, 6).map(f => f.colour))
      .toEqual(['#111111', null, null])
  })

  it('mixed fills need their own mask; uniform ones do not', () => {
    const a = strandStyleAttrs('lines', 8, 1, 6)
    const all = gapRingFills(a, { innerFill: '#abc123' }, 6)
    const none = gapRingFills(a, {}, 6)
    const mixed = gapRingFills(a, {
      gapFillMode: 'matching',
      gapFills: ['#111111', null, '#333333', null, '#111111'],
    }, 6)
    expect(gapFillMaskBands(a, all)).toBeNull()
    expect(gapFillMaskBands(a, none)).toBeNull()
    const bands = gapFillMaskBands(a, mixed)!
    expect(bands).toHaveLength(a.maskBands.length)
    // White only where a filled ring is cut in; every line band stays hidden.
    expect(bands.map(b => b.colour)).toEqual(['white', 'black', 'black', 'black', 'white'])
    expect(bands.map(b => b.width)).toEqual(a.maskBands)
  })
})

describe('gapCrossSections (the `individual` grain)', () => {
  it('lands one section per gap, in order across the stroke', () => {
    const w = 13
    for (const n of [2, 3, 5, 10]) {
      const secs = gapCrossSections(w, n, 1.5)
      expect(secs).toHaveLength(gapCount(n))
      const { line, gap } = lineBandWidths(w, n, 1.5)
      secs.forEach((s, g) => {
        expect(s.width).toBeCloseTo(gap, 9)
        // Each gap sits behind g+1 lines and g whole gaps.
        expect(s.centre - s.width / 2).toBeCloseTo((g + 1) * line + g * gap, 9)
      })
      // The last gap's far edge is one line short of the far side.
      const last = secs[secs.length - 1]
      expect(w - (last.centre + last.width / 2)).toBeCloseTo(line, 9)
    }
  })

  it('sections never overlap and stay inside the stroke', () => {
    const secs = gapCrossSections(10, 7, 0.6)
    let prevEnd = 0
    for (const s of secs) {
      expect(s.centre - s.width / 2).toBeGreaterThan(prevEnd - 1e-9)
      prevEnd = s.centre + s.width / 2
      expect(prevEnd).toBeLessThan(10)
    }
  })

  it('mirrors the ring grain: paired gaps sit the same distance from each edge', () => {
    const w = 12
    const secs = gapCrossSections(w, 6, 1)
    const [a, b] = ringGapIndices(1, 6)
    expect(secs[a].centre).toBeCloseTo(w - secs[b].centre, 9)
  })
})

describe('readLineStyleFields — gap fills', () => {
  it('keeps a current per-gap array and mode', () => {
    expect(readLineStyleFields({
      lineStyle: 'lines', lineCount: 4,
      gapFillMode: 'individual', gapFills: ['#111111', null, '#333333'],
    })).toEqual({
      lineStyle: 'lines', lineCount: 4,
      gapFillMode: 'individual', gapFills: ['#111111', null, '#333333'],
    })
  })

  it('renames the pre-2026-08-05 `individual` and expands its ring array', () => {
    // 4 lines: 2 rings ⇒ 3 gaps, the ring colours mirrored back out.
    expect(readLineStyleFields({
      lineStyle: 'lines', lineCount: 4,
      gapFillMode: 'individual', gapFills: ['#111111', '#222222'],
    })).toEqual({
      lineStyle: 'lines', lineCount: 4,
      gapFillMode: 'matching', gapFills: ['#111111', '#222222', '#111111'],
    })
  })

  it('reads a junk entry as unfilled instead of dropping the whole array', () => {
    expect(readLineStyleFields({
      lineStyle: 'lines', lineCount: 4,
      gapFillMode: 'individual', gapFills: ['#111111', 7, ''],
    }).gapFills).toEqual(['#111111', null, null])
  })

  it('drops an unknown gap-fill mode', () => {
    expect(readLineStyleFields({ lineStyle: 'lines', gapFillMode: 'sideways' }).gapFillMode)
      .toBeUndefined()
  })
})
