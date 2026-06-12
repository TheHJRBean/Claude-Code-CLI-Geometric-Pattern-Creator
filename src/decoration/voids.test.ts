import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../utils/math'
import { clipSegmentToConvex, extractVoids, pairCurvedOutlines, voidSignature } from './voids'
import { keyVoids } from './resolve'
import { runPIC } from '../pic/index'
import { generateTiling } from '../tilings/archimedean'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { resetIds } from '../tilings/shared'
import type { PatternConfig } from '../types/pattern'

const seg = (x1: number, y1: number, x2: number, y2: number) => ({
  from: { x: x1, y: y1 }, to: { x: x2, y: y2 },
})

/** Axis-aligned square bound [0,W]². */
const boundBox = (W: number): Vec2[] => [
  { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: W }, { x: 0, y: W },
]

/** Count of distinct signatures in a void list. */
const sigSet = (voids: { signature: string }[]) => new Set(voids.map(v => v.signature))

describe('Step 19.1 — Void extraction', () => {
  it('empty arrangement → one Void filling the bound', () => {
    const voids = extractVoids([], boundBox(100))
    expect(voids.length).toBe(1)
    expect(voids[0].area).toBeCloseTo(10000, 3)
  })

  it('cross partition → 4 congruent square Voids (1 signature)', () => {
    // vertical + horizontal line through the centre of a 100×100 bound
    const voids = extractVoids(
      [seg(50, 0, 50, 100), seg(0, 50, 100, 50)],
      boundBox(100),
    )
    expect(voids.length).toBe(4)
    for (const v of voids) expect(v.area).toBeCloseTo(2500, 3)
    expect(sigSet(voids).size).toBe(1) // all four squares congruent
  })

  it('diagonal split → 2 mirror-image triangle Voids share a signature', () => {
    // reflection invariance: the two right triangles are mirror images
    const voids = extractVoids([seg(0, 0, 100, 100)], boundBox(100))
    expect(voids.length).toBe(2)
    for (const v of voids) expect(v.area).toBeCloseTo(5000, 3)
    expect(sigSet(voids).size).toBe(1)
  })

  it('off-centre vertical line → 2 differently-sized Voids (2 signatures)', () => {
    const voids = extractVoids([seg(30, 0, 30, 100)], boundBox(100))
    expect(voids.length).toBe(2)
    const areas = voids.map(v => v.area).sort((a, b) => a - b)
    expect(areas[0]).toBeCloseTo(3000, 3)
    expect(areas[1]).toBeCloseTo(7000, 3)
    expect(sigSet(voids).size).toBe(2) // different sizes ⇒ not congruent
  })

  it('a 3×3 grid of lines → 16 congruent cells (1 signature)', () => {
    const segs = []
    for (let k = 1; k <= 3; k++) {
      segs.push(seg(25 * k, 0, 25 * k, 100)) // verticals
      segs.push(seg(0, 25 * k, 100, 25 * k)) // horizontals
    }
    const voids = extractVoids(segs, boundBox(100))
    expect(voids.length).toBe(16)
    for (const v of voids) expect(v.area).toBeCloseTo(625, 2)
    expect(sigSet(voids).size).toBe(1)
  })

  it('quantisation-boundary lengths do not split a congruent class', () => {
    // Cell side 10.25 sits EXACTLY on a lengthSnap=0.5 rounding boundary
    // (10.25 / 0.5 = 20.5). Sub-float jitter on the grid lines then rounds
    // either way per instance and, without field-level canonicalisation, the
    // single congruent class splits into several signatures — the "Matching
    // leaves a few odd voids unpainted" bug.
    const W = 41 // 4 × 10.25
    const segs = []
    for (let k = 1; k <= 3; k++) {
      const jitter = (k % 2 === 0 ? 1 : -1) * 1e-6
      segs.push(seg(10.25 * k + jitter, 0, 10.25 * k + jitter, W)) // verticals (jittered)
      segs.push(seg(0, 10.25 * k, W, 10.25 * k))                   // horizontals
    }
    const voids = extractVoids(segs, boundBox(W))
    expect(voids.length).toBe(16)
    expect(sigSet(voids).size).toBe(1)
  })

  it('signature-threshold collinear coin-flip does not split a congruent class', () => {
    // Two 40×40 squares whose top edge carries a mid-vertex kink hovering AT
    // simplifyCollinear's 1.5° tolerance: 1.6° (kept → 5-vertex outline) on
    // one, 1.4° (dropped → 4-vertex outline) on the other — the float-noise
    // coin-flip a real field produces at T-junctions and flattened curve
    // chords. The vertex COUNTS differ, so quantisation-tolerance merging
    // alone can't bridge them; the coarser compare-time simplification in
    // canonicaliseSignatures must.
    const kinkedSquare = (x0: number, kinkTurnDeg: number) => {
      const dy = 20 * Math.tan((kinkTurnDeg * Math.PI) / 360) // turn = 2·atan(dy/20)
      return [
        seg(x0, 10, x0 + 40, 10),
        seg(x0 + 40, 10, x0 + 40, 50),
        seg(x0 + 40, 50, x0 + 20, 50 + dy),
        seg(x0 + 20, 50 + dy, x0, 50),
        seg(x0, 50, x0, 10),
      ]
    }
    const voids = extractVoids(
      [...kinkedSquare(10, 1.6), ...kinkedSquare(60, 1.4)],
      boundBox(110),
    )
    // 4 not 2: each square floats disconnected inside the sea, so its outline
    // walks as an interior face AND a same-|area| mirror "hole" face (the
    // 19.1 known hole limitation — real PIC fields are connected). All four
    // outlines are the same shape, which is exactly what matters here.
    const squares = voids.filter(v => v.area < 2000)
    expect(squares.length).toBe(4)
    expect(sigSet(squares).size).toBe(1)
  })

  it('Voids tile the bound (areas sum to the bound area)', () => {
    const voids = extractVoids(
      [seg(50, 0, 50, 100), seg(0, 50, 100, 50), seg(0, 0, 100, 100)],
      boundBox(100),
    )
    const total = voids.reduce((s, v) => s + v.area, 0)
    expect(total).toBeCloseTo(10000, 1)
  })
})

describe('Step 19.1 — congruent signature', () => {
  const L = 0.5, A = (0.5 * Math.PI) / 180
  const sq = (cx: number, cy: number, s: number, rot = 0): Vec2[] => {
    const r = s / 2
    return [
      { x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r },
    ].map(p => ({
      x: cx + p.x * Math.cos(rot) - p.y * Math.sin(rot),
      y: cy + p.x * Math.sin(rot) + p.y * Math.cos(rot),
    }))
  }

  it('translated + rotated congruent squares share a signature', () => {
    expect(voidSignature(sq(0, 0, 40), L, A))
      .toBe(voidSignature(sq(500, -300, 40, 0.9), L, A))
  })

  it('different-size squares differ', () => {
    expect(voidSignature(sq(0, 0, 40), L, A))
      .not.toBe(voidSignature(sq(0, 0, 60), L, A))
  })

  it('mirror image shares a signature (reflection invariant)', () => {
    const tri: Vec2[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 50 }]
    const mirror = tri.map(p => ({ x: -p.x, y: p.y }))
    expect(voidSignature(tri, L, A)).toBe(voidSignature(mirror, L, A))
  })

  it('an extra collinear (T-junction) vertex does not change the signature', () => {
    // The #2 fix: a congruent sibling that picked up a midpoint vertex on one
    // straight edge must still hash the same as the plain square.
    const plain: Vec2[] = [
      { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 },
    ]
    const withTJunction: Vec2[] = [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }, // collinear midpoint
      { x: 40, y: 40 }, { x: 0, y: 40 },
    ]
    expect(voidSignature(withTJunction, L, A)).toBe(voidSignature(plain, L, A))
  })
})

describe('Step 19.1 — real PIC field (4.8.8)', () => {
  it('extracts congruent Void classes from a genuine strand arrangement', () => {
    resetIds()
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: '4.8.8', scale: 60 },
      figures: {
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45 },
        8: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
      },
    }
    const polys = generateTiling(TILINGS['4.8.8'], { x: -250, y: -250, width: 500, height: 500 }, 60)
    const segs = runPIC(polys, config)
    expect(segs.length).toBeGreaterThan(100)

    const W = 120
    const bound: Vec2[] = [{ x: -W, y: -W }, { x: W, y: -W }, { x: W, y: W }, { x: -W, y: W }]
    const voids = extractVoids(segs, bound)

    // Real field is non-trivial and every Void has positive area.
    expect(voids.length).toBeGreaterThan(10)
    for (const v of voids) expect(v.area).toBeGreaterThan(0)

    // 4.8.8 strands connect to the bound region → the arrangement tiles it:
    // areas sum to the bound area (no holes lost on this Configuration).
    const total = voids.reduce((s, v) => s + v.area, 0)
    expect(total / (4 * W * W)).toBeCloseTo(1.0, 2)

    // Congruent grouping actually groups: far fewer classes than Voids, and the
    // repeating motif Void recurs many times under one signature.
    const sigs = sigSet(voids)
    expect(sigs.size).toBeLessThan(voids.length)
    const counts = new Map<string, number>()
    for (const v of voids) counts.set(v.signature, (counts.get(v.signature) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(4)
  })
})

describe('Step 19.1 — convex clip', () => {
  it('clips a segment crossing the bound to the inside', () => {
    const r = clipSegmentToConvex({ x: -50, y: 50 }, { x: 150, y: 50 }, boundBox(100))
    expect(r).not.toBeNull()
    expect(r!.a.x).toBeCloseTo(0, 6)
    expect(r!.b.x).toBeCloseTo(100, 6)
  })

  it('rejects a segment fully outside', () => {
    expect(clipSegmentToConvex({ x: -50, y: -50 }, { x: -10, y: -10 }, boundBox(100))).toBeNull()
  })
})

describe('Decoration — curve-insensitive Void identity (pairCurvedOutlines)', () => {
  // Straight cross through a 100×100 bound = 4 congruent square Voids.
  const straightSegs = [seg(50, 0, 50, 100), seg(0, 50, 100, 50)]
  // "Curved" twin: the vertical strand bows into a polyline (what
  // flattenStrandsToSegments produces), horizontal unchanged.
  const bowedField = (dx: number) => [
    seg(50, 0, 50 + dx, 25), seg(50 + dx, 25, 50, 50),
    seg(50, 50, 50 - dx, 75), seg(50 - dx, 75, 50, 100),
    seg(0, 50, 100, 50),
  ]

  it('pairs identity from the straight field with curved render outlines', () => {
    const straight = extractVoids(straightSegs, boundBox(100))
    const curved = extractVoids(bowedField(3), boundBox(100))
    const paired = pairCurvedOutlines(straight, curved)
    expect(paired.length).toBe(4)
    // Identity = the straight field's single congruent class…
    expect(sigSet(paired)).toEqual(sigSet(straight))
    for (const v of paired) {
      // …while the rendered outline is the curved one (carries a bow vertex)
      // and the straight outline is kept for key derivation.
      expect(v.keyPolygon).toBeDefined()
      expect(v.polygon.length).toBeGreaterThan(4)
    }
  })

  it('identity keys survive a curve-recipe change', () => {
    const straight = extractVoids(straightSegs, boundBox(100))
    const a = keyVoids(pairCurvedOutlines(straight, extractVoids(bowedField(3), boundBox(100))), [])
    const b = keyVoids(pairCurvedOutlines(straight, extractVoids(bowedField(-5), boundBox(100))), [])
    expect(new Set(b.map(v => v.instanceKey))).toEqual(new Set(a.map(v => v.instanceKey)))
    expect(new Set(b.map(v => v.signature))).toEqual(new Set(a.map(v => v.signature)))
  })
})
