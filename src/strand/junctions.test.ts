import { beforeEach, describe, expect, it } from 'vitest'
import type { Segment } from '../types/geometry'
import { runPIC } from '../pic/index'
import { generateTiling } from '../tilings/archimedean'
import { TILINGS } from '../tilings/index'
import { resetIds } from '../tilings/shared'
import { DEFAULT_CONFIG } from '../state/defaults'
import { buildStrands } from './buildStrands'
import { junctionAngle, junctionSignature, strandJunctions } from './junctions'
import { computeWeave } from './weave'

beforeEach(() => resetIds())

const seg = (fx: number, fy: number, tx: number, ty: number): Segment => ({
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
  edgeMidpoint: { x: 0, y: 0 },
  polygonCenter: { x: 0, y: 0 },
  polygonId: 'p',
  polygonSides: 4,
  tileTypeId: '4',
  kind: 'star-arm',
})

describe('strandJunctions', () => {
  it('finds a chain-point crossing where two threads pass through one vertex', () => {
    const strands = buildStrands([
      seg(-1, 0, 0, 0), seg(0, 0, 1, 0),
      seg(0, -1, 0, 0), seg(0, 0, 0, 1),
    ])
    const js = strandJunctions(strands)
    expect(js).toHaveLength(1)
    expect(js[0].point.x).toBeCloseTo(0)
    expect(js[0].point.y).toBeCloseTo(0)
    expect(js[0].degree).toBe(2)
  })

  it('finds a transversal mid-edge crossing (the vertex-strand case)', () => {
    const js = strandJunctions(buildStrands([seg(-1, 0, 1, 0), seg(0, -1, 0, 1)]))
    expect(js).toHaveLength(1)
    expect(js[0].point.x).toBeCloseTo(0)
    expect(js[0].point.y).toBeCloseTo(0)
  })

  it('does NOT place a junction at a thread tip touching another thread', () => {
    // A T-junction: the vertical thread ENDS on the horizontal one. Taprats'
    // odd-vertex rule — no interlace there, and so no ornament either.
    expect(strandJunctions(buildStrands([seg(-1, 0, 1, 0), seg(0, -1, 0, 0)]))).toHaveLength(0)
  })

  it('does not mistake a plain continuation for a junction', () => {
    expect(strandJunctions(buildStrands([seg(-1, 0, 0, 0), seg(0, 0, 1, 1)]))).toHaveLength(0)
  })
})

describe('junctionSignature', () => {
  const at = (...degs: number[]) =>
    degs.map(d => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) }))
  /** Arms of threads that run STRAIGHT through: each contributes a pair. */
  const straight = (...degs: number[]) => at(...degs.flatMap(d => [d, d + 180]))

  it('is invariant under rotation', () => {
    expect(junctionSignature(straight(0, 90))).toBe(junctionSignature(straight(31, 121)))
  })

  it('is invariant under reflection', () => {
    // A 60° crossing and its mirror image are the same junction shape.
    expect(junctionSignature(straight(0, 60))).toBe(junctionSignature(straight(0, 120)))
  })

  it('is invariant under reversing a thread (a line, not a ray)', () => {
    expect(junctionSignature(straight(0, 90))).toBe(junctionSignature(straight(180, 270)))
  })

  it('separates different crossing angles', () => {
    expect(junctionSignature(straight(0, 90))).not.toBe(junctionSignature(straight(0, 60)))
  })

  it('separates different degrees', () => {
    expect(junctionSignature(straight(0, 90))).not.toBe(junctionSignature(straight(0, 60, 120)))
  })

  it('a straight crossing keys EXACTLY as it did before arms — saved records still resolve', () => {
    // The ring of a straight junction repeats every half turn, and the
    // signature reduces it to that period. This is the literal string the
    // line-fold produced for a right-angle crossing, and a `Matching` record
    // saved against it has to keep matching.
    // Two threads 45° apart — the class every crossing of the 4.8.8 field
    // falls in, and the string it has been keyed by since the feature shipped.
    expect(junctionSignature(straight(0, 45))).toBe('j2:270,90')
    // A right-angle crossing halves to a PAIR of equal gaps, never to one:
    // reducing further would key it as something the line-fold never emitted.
    expect(junctionSignature(straight(0, 90))).toBe('j2:180,180')
  })

  it('a BENT thread is a different class from the straight one it resembles', () => {
    // The bug this pins: folding each pass onto one undirected line reported
    // Cairo's 15° kink as a 1° wobble and put visibly different crossings in
    // one class. A bent junction's ring has no half-turn period.
    const bent = at(0, 180 - 15, 90, 270)
    expect(junctionSignature(bent)).not.toBe(junctionSignature(straight(0, 90)))
    // ...and two junctions bent the same way, rotated apart, still match.
    const rotated = at(20, 200 - 15, 110, 290)
    expect(junctionSignature(bent)).toBe(junctionSignature(rotated))
  })
})

describe('junctionAngle', () => {
  it('bisects the widest gap between the incident arms', () => {
    // A right-angle crossing: every gap is 90°, and the first one starts at 0.
    const a = junctionAngle([{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }])
    expect((a * 180) / Math.PI).toBeCloseTo(45)
  })

  it('does not depend on the order the threads were enumerated in', () => {
    const arms = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: Math.cos(1), y: Math.sin(1) },
      { x: -Math.cos(1), y: -Math.sin(1) }]
    expect(junctionAngle(arms)).toBeCloseTo(junctionAngle(arms.slice().reverse()))
  })

  it('aims into the wedge a bent thread actually opens', () => {
    // Arms at 0 / 90 / 165 / 270: the widest wedge is 165°→270°, so the
    // ornament aims at 217.5°. The line-fold saw only 0/90/(165) and would
    // have aimed somewhere that wedge does not exist.
    const a = junctionAngle([0, 90, 165, 270].map(d => ({
      x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180),
    })))
    expect((a * 180) / Math.PI).toBeCloseTo(217.5, 4)
  })
})

describe('over a real PIC field', () => {
  // The default square tiling (its Figure recipe is the one DEFAULT_CONFIG
  // carries — a tiling whose tile types have no recipe emits no Rays at all).
  const field = (box: { x: number; y: number; width: number; height: number }) => {
    const config = DEFAULT_CONFIG
    const polys = generateTiling(TILINGS['square'], box, config.tiling.scale)
    return strandJunctions(buildStrands(runPIC(polys, config)))
  }

  it('the default square field has junctions, all of them shared by ≥2 threads', () => {
    const junctions = field({ x: -200, y: -200, width: 400, height: 400 })
    expect(junctions.length).toBeGreaterThan(10)
    expect(junctions.every(j => j.degree >= 2)).toBe(true)
    // A periodic field repeats its junction shapes: far fewer classes than
    // junctions, which is what makes the Matching reach worth having.
    const classes = new Set(junctions.map(j => j.signature))
    expect(classes.size).toBeLessThan(junctions.length / 4)
  })

  it('junction identity is translation-invariant (a pan must not re-class one)', () => {
    const here = field({ x: -200, y: -200, width: 400, height: 400 })
    resetIds()
    const shifted = field({ x: -163, y: -177, width: 400, height: 400 })
    const a = new Set(here.map(j => j.signature))
    const b = new Set(shifted.map(j => j.signature))
    for (const sig of b) expect(a.has(sig)).toBe(true)
  })

  it('every arm reports a finite run, and it matches the line work', () => {
    // The span is what stops an ornament drawn along an arm from outrunning
    // the Strand. An infinite or zero one is the failure that shows up as a
    // twinkle hanging over open ground (or vanishing).
    const junctions = field({ x: -200, y: -200, width: 400, height: 400 })
    for (const j of junctions) {
      expect(j.armSpans).toHaveLength(j.arms.length)
      for (const s of j.armSpans) {
        expect(Number.isFinite(s)).toBe(true)
        expect(s).toBeGreaterThan(0)
      }
    }
    // …and no arm claims a run longer than the whole field it came from.
    const extent = 400 * Math.SQRT2
    expect(Math.max(...junctions.flatMap(j => j.armSpans))).toBeLessThan(extent)
  })
})

describe('arm spans — how far the line work runs each way', () => {
  it('walks through a chain point the thread runs straight through', () => {
    // Three collinear segments each side: the middle chain points are not
    // bends, and capping an ornament at one would stop it short of line work
    // that really is there.
    const strands = buildStrands([
      seg(-3, 0, -2, 0), seg(-2, 0, -1, 0), seg(-1, 0, 0, 0),
      seg(0, 0, 1, 0), seg(1, 0, 2, 0), seg(2, 0, 3, 0),
      seg(0, -1, 0, 0), seg(0, 0, 0, 1),
    ])
    const [j] = strandJunctions(strands)
    const horizontal = j.arms
      .map((a, i) => ({ a, span: j.armSpans[i] }))
      .filter(({ a }) => Math.abs(a.y) < 1e-9)
    expect(horizontal).toHaveLength(2)
    for (const { span } of horizontal) expect(span).toBeCloseTo(3, 6)
  })

  it('stops at a bend', () => {
    // The horizontal thread turns 45° one unit out to the right; that arm's
    // run is 1, while the straight side keeps its full 3.
    const strands = buildStrands([
      seg(-3, 0, 0, 0),
      seg(0, 0, 1, 0), seg(1, 0, 2, 1),
      seg(0, -1, 0, 0), seg(0, 0, 0, 1),
    ])
    const [j] = strandJunctions(strands)
    const right = j.armSpans[j.arms.findIndex(a => a.x > 0.9)]
    const left = j.armSpans[j.arms.findIndex(a => a.x < -0.9)]
    expect(right).toBeCloseTo(1, 6)
    expect(left).toBeCloseTo(3, 6)
  })

  it('measures from the crossing, not the chain point, on a transversal', () => {
    // The vertical thread crosses the horizontal one mid-edge at (0,0): the
    // horizontal arms run 2 each way, not 4 and 0.
    const strands = buildStrands([seg(-2, 0, 2, 0), seg(0, -1, 0, 1)])
    const [j] = strandJunctions(strands)
    const horizontal = j.arms
      .map((a, i) => ({ a, span: j.armSpans[i] }))
      .filter(({ a }) => Math.abs(a.y) < 1e-9)
    for (const { span } of horizontal) expect(span).toBeCloseTo(2, 6)
  })
})

describe('the weave and the ornaments see the same crossings', () => {
  it('every crossing the weave sends a thread under is a junction', () => {
    // One shared enumeration, two features: if these ever diverge, an ornament
    // would sit where no thread passes under it (or vice versa).
    const polys = generateTiling(TILINGS['square'], { x: -200, y: -200, width: 400, height: 400 }, DEFAULT_CONFIG.tiling.scale)
    const strands = buildStrands(runPIC(polys, DEFAULT_CONFIG))
    const unders = computeWeave(strands).reduce((n, w) => n + w.under.length, 0)
    // Each crossing puts exactly one of its two threads under.
    expect(unders).toBe(strandJunctions(strands).length)
  })
})
