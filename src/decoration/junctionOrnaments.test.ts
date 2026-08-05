import { describe, expect, it } from 'vitest'
import type { JunctionOrnamentRecord, JunctionOrnamentStyle } from '../types/editor'
import type { StrandJunction } from '../strand/junctions'
import {
  DEFAULT_JUNCTION_ORNAMENT,
  buildJunctionIndex,
  junctionOrnamentsSupported,
  keyJunctions,
  ornamentPaint,
  ornamentPathD,
  resolveJunctionOrnament,
  resolveJunctionPlacements,
} from './junctionOrnaments'

/** Every coordinate pair in a path `d`. The number pattern has to allow an
 *  exponent — a vertex on an axis comes out as e.g. `6.1e-16`, and a naive
 *  `\d+\.?\d*` splits it into two bogus coordinates. */
function pathPoints(d: string): { x: number; y: number }[] {
  const num = '-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?'
  return [...d.matchAll(new RegExp(`(${num}),(${num})`, 'gi'))]
    .map(m => ({ x: Number(m[1]), y: Number(m[2]) }))
}

const dot = (colour: string): JunctionOrnamentStyle => ({ ...DEFAULT_JUNCTION_ORNAMENT, colour })

/** A junction with perpendicular threads at `p`. */
const j = (x: number, y: number, sig = 'jA'): StrandJunction => ({
  point: { x, y },
  dirs: [{ x: 1, y: 0 }, { x: 0, y: 1 }],
  degree: 2,
  signature: sig,
})

describe('keyJunctions', () => {
  it('reduces the patch key to the lattice orbit and keeps the world key absolute', () => {
    const stamps = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]
    const [a, b] = keyJunctions([j(2, 0), j(12, 0)], stamps)
    // Same spot in two different repeats ⇒ one patch key, two instance keys.
    expect(a.patchKey).toBe(b.patchKey)
    expect(a.instanceKey).not.toBe(b.instanceKey)
  })

  it('collapses the patch key onto the world position with no lattice', () => {
    const [a] = keyJunctions([j(2, 3)], [])
    expect(a.patchKey).toBe(a.instanceKey)
  })
})

describe('resolveJunctionOrnament', () => {
  const stamps = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
  const keyed = keyJunctions([j(2, 0, 'jA'), j(12, 0, 'jA'), j(4, 4, 'jB')], stamps)

  const idx = (...records: JunctionOrnamentRecord[]) => buildJunctionIndex(records)

  it("'*' reaches every junction", () => {
    const i = idx({ scope: 'congruent', key: '*', ...dot('#111') })
    expect(keyed.every(k => resolveJunctionOrnament(i, k)?.colour === '#111')).toBe(true)
  })

  it('a signature record reaches only its own class', () => {
    const i = idx({ scope: 'congruent', key: 'jA', ...dot('#222') })
    expect(resolveJunctionOrnament(i, keyed[0])?.colour).toBe('#222')
    expect(resolveJunctionOrnament(i, keyed[1])?.colour).toBe('#222')
    expect(resolveJunctionOrnament(i, keyed[2])).toBeNull()
  })

  it('a patch record reaches the same spot in every repeat', () => {
    const i = idx({ scope: 'patch', key: keyed[0].patchKey, ...dot('#333') })
    expect(resolveJunctionOrnament(i, keyed[0])?.colour).toBe('#333')
    expect(resolveJunctionOrnament(i, keyed[1])?.colour).toBe('#333')
  })

  it('an instance record reaches exactly one junction', () => {
    const i = idx({ scope: 'instance', key: keyed[1].instanceKey, ...dot('#444') })
    expect(resolveJunctionOrnament(i, keyed[0])).toBeNull()
    expect(resolveJunctionOrnament(i, keyed[1])?.colour).toBe('#444')
  })

  it('resolves finest-first: instance > patch > signature > all', () => {
    const i = idx(
      { scope: 'congruent', key: '*', ...dot('#aaa') },
      { scope: 'congruent', key: 'jA', ...dot('#bbb') },
      { scope: 'patch', key: keyed[0].patchKey, ...dot('#ccc') },
      { scope: 'instance', key: keyed[1].instanceKey, ...dot('#ddd') },
    )
    expect(resolveJunctionOrnament(i, keyed[1])?.colour).toBe('#ddd') // instance
    expect(resolveJunctionOrnament(i, keyed[0])?.colour).toBe('#ccc') // patch
    expect(resolveJunctionOrnament(i, keyed[2])?.colour).toBe('#aaa') // '*'
  })

  it('ignores a `cell`-scoped record — junctions have no Twins rung', () => {
    const i = idx({ scope: 'cell', key: 'jA#c:whatever', ...dot('#eee') })
    expect(i.empty).toBe(true)
    expect(resolveJunctionOrnament(i, keyed[0])).toBeNull()
  })
})

describe('resolveJunctionPlacements', () => {
  it('aims a thread-aligned ornament along the widest gap and adds its own angle', () => {
    const keyed = keyJunctions([j(0, 0)], [])
    const [p] = resolveJunctionPlacements(keyed, [
      { scope: 'congruent', key: '*', ...DEFAULT_JUNCTION_ORNAMENT, shape: 'star', align: 'thread', angle: 10 },
    ])
    // Perpendicular threads bisect at 45°, plus the record's own 10°.
    expect((p.angle * 180) / Math.PI).toBeCloseTo(55)
  })

  it('an upright ornament ignores the threads', () => {
    const [p] = resolveJunctionPlacements(keyJunctions([j(0, 0)], []), [
      { scope: 'congruent', key: '*', ...DEFAULT_JUNCTION_ORNAMENT, shape: 'star', align: 'upright' },
    ])
    expect(p.angle).toBeCloseTo(0)
  })

  it('is empty with no records — no work, no placements', () => {
    expect(resolveJunctionPlacements(keyJunctions([j(0, 0)], []), undefined)).toEqual([])
    expect(resolveJunctionPlacements(keyJunctions([j(0, 0)], []), [])).toEqual([])
  })
})

describe('ornament geometry', () => {
  it('a dot is a closed circle path', () => {
    const d = ornamentPathD({ ...DEFAULT_JUNCTION_ORNAMENT, shape: 'dot' }, 4)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).toContain('A4,4')
  })

  it('a star has one tip and one waist vertex per point', () => {
    const d = ornamentPathD({ ...DEFAULT_JUNCTION_ORNAMENT, shape: 'star', points: 5 }, 10)
    // 5 tips + 5 waists = 10 vertices: 1 M + 9 L.
    expect((d.match(/L/g) ?? []).length).toBe(9)
  })

  it('a twinkle bows its sides in with one curve per point', () => {
    const d = ornamentPathD({ ...DEFAULT_JUNCTION_ORNAMENT, shape: 'twinkle', points: 4 }, 10)
    expect((d.match(/Q/g) ?? []).length).toBe(4)
  })

  it('every tip sits on the nominal radius', () => {
    const r = 7
    const d = ornamentPathD({ ...DEFAULT_JUNCTION_ORNAMENT, shape: 'star', points: 6, innerRatio: 0.4 }, r)
    const coords = pathPoints(d)
    const radii = coords.map(c => Math.hypot(c.x, c.y))
    expect(Math.max(...radii)).toBeCloseTo(r, 6)
    expect(Math.min(...radii)).toBeCloseTo(r * 0.4, 6)
  })

  it('a hollow ornament keeps its overall size (the outline grows inward)', () => {
    const style: JunctionOrnamentStyle = { ...DEFAULT_JUNCTION_ORNAMENT, hollow: true, outlineWidth: 0.4 }
    const paint = ornamentPaint(style, 10)
    // Stroke is centred on the path, so path radius + half the stroke = 10.
    expect(paint.radius + paint.strokeWidth / 2).toBeCloseTo(10)
    expect(paint.stroke).toBe(style.colour)
    expect(paint.fill).toBe('none') // no hollowFill ⇒ the pattern shows through
  })

  it('a solid ornament is filled in its colour and has no stroke', () => {
    const paint = ornamentPaint({ ...DEFAULT_JUNCTION_ORNAMENT, colour: '#123456' }, 5)
    expect(paint).toMatchObject({ radius: 5, fill: '#123456', stroke: undefined })
  })

  it('clamps a hand-edited waist / point count instead of drawing nonsense', () => {
    const d = ornamentPathD({ ...DEFAULT_JUNCTION_ORNAMENT, shape: 'star', points: 99, innerRatio: 5 }, 10)
    expect((d.match(/L/g) ?? []).length).toBe(12 * 2 - 1) // clamped to 12 points
    const coords = pathPoints(d).map(c => Math.hypot(c.x, c.y))
    expect(Math.max(...coords)).toBeCloseTo(10, 6) // waist clamped below the tip
  })
})

describe('junctionOrnamentsSupported', () => {
  it('is true for solid strands and for a style that never set one', () => {
    expect(junctionOrnamentsSupported({})).toBe(true)
    expect(junctionOrnamentsSupported({ lineStyle: 'solid' })).toBe(true)
  })

  it('is false for divided strands (v1 scope)', () => {
    expect(junctionOrnamentsSupported({ lineStyle: 'lines' })).toBe(false)
  })
})
