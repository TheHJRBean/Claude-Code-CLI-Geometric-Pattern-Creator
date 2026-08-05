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
  const dirsAt = (...degs: number[]) =>
    degs.map(d => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) }))

  it('is invariant under rotation', () => {
    expect(junctionSignature(dirsAt(0, 90))).toBe(junctionSignature(dirsAt(31, 121)))
  })

  it('is invariant under reflection', () => {
    // A 60° crossing and its mirror image are the same junction shape.
    expect(junctionSignature(dirsAt(0, 60))).toBe(junctionSignature(dirsAt(0, 120)))
  })

  it('is invariant under reversing a thread (a line, not a ray)', () => {
    expect(junctionSignature(dirsAt(0, 90))).toBe(junctionSignature(dirsAt(180, 270)))
  })

  it('separates different crossing angles', () => {
    expect(junctionSignature(dirsAt(0, 90))).not.toBe(junctionSignature(dirsAt(0, 60)))
  })

  it('separates different degrees', () => {
    expect(junctionSignature(dirsAt(0, 90))).not.toBe(junctionSignature(dirsAt(0, 60, 120)))
  })
})

describe('junctionAngle', () => {
  it('bisects the widest gap between the incident lines', () => {
    // A right-angle crossing: every gap is 90°, and the first one starts at 0.
    const a = junctionAngle([{ x: 1, y: 0 }, { x: 0, y: 1 }])
    expect((a * 180) / Math.PI).toBeCloseTo(45)
  })

  it('does not depend on the order the threads were enumerated in', () => {
    const dirs = [{ x: 1, y: 0 }, { x: Math.cos(1), y: Math.sin(1) }]
    expect(junctionAngle(dirs)).toBeCloseTo(junctionAngle(dirs.slice().reverse()))
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
