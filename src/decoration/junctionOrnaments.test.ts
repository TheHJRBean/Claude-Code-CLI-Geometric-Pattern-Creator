import { describe, expect, it } from 'vitest'
import type { JunctionOrnamentRecord, JunctionOrnamentStyle } from '../types/editor'
import type { StrandJunction } from '../strand/junctions'
import {
  DEFAULT_JUNCTION_ORNAMENT,
  buildJunctionIndex,
  flarePathD,
  junctionOrnamentsSupported,
  keyJunctions,
  ornamentPaint,
  ornamentPathD,
  splitJunctionLayers,
  resolveJunctionOrnament,
  resolveJunctionPlacements,
  twinkleReach,
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
const j = (x: number, y: number, sig = 'jA', strands = [0, 1]): StrandJunction => ({
  point: { x, y },
  dirs: [{ x: 1, y: 0 }, { x: 0, y: 1 }],
  // Both threads run straight through, so each contributes an antiparallel
  // pair. On a field that bends they would not (see `strandJunctions`).
  arms: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }],
  // Long straight runs: these tests are about identity and resolution, not
  // about where the line work ends (`flarePathD` capping has its own).
  armSpans: [1e3, 1e3, 1e3, 1e3],
  strands,
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

  it('a twinkle is never rotated — its geometry already follows the threads', () => {
    const [p] = resolveJunctionPlacements(keyJunctions([j(0, 0)], []), [
      { scope: 'congruent', key: '*', ...DEFAULT_JUNCTION_ORNAMENT, shape: 'twinkle', align: 'thread', angle: 40 },
    ])
    expect(p.angle).toBe(0)
    expect(p.arms).toHaveLength(4)
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

  it('a twinkle has no free-standing figure — it is built from the threads', () => {
    expect(ornamentPathD({ ...DEFAULT_JUNCTION_ORNAMENT, shape: 'twinkle' }, 10)).toBe('')
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

describe('matching the Strand colour', () => {
  const keyedWith = (colour: string) => keyJunctions([j(0, 0)], [], () => colour)

  it('takes the Strands’ colour over its own', () => {
    const [p] = resolveJunctionPlacements(keyedWith('#0000ff'), [
      { scope: 'congruent', key: '*', ...DEFAULT_JUNCTION_ORNAMENT, colour: '#ff0000', matchStrandColour: true },
    ])
    expect(p.colour).toBe('#0000ff')
  })

  it('keeps its own colour when not matching', () => {
    const [p] = resolveJunctionPlacements(keyedWith('#0000ff'), [
      { scope: 'congruent', key: '*', ...DEFAULT_JUNCTION_ORNAMENT, colour: '#ff0000' },
    ])
    expect(p.colour).toBe('#ff0000')
  })

  it('disappears with a hidden Strand', () => {
    // `'none'` is how removing a strand paint hides the line work. An ornament
    // matching it must go too, or it would float with nothing under it.
    expect(resolveJunctionPlacements(keyedWith('none'), [
      { scope: 'congruent', key: '*', ...DEFAULT_JUNCTION_ORNAMENT, matchStrandColour: true },
    ])).toEqual([])
  })

  it('falls back to its own colour where no Strand colour was resolved', () => {
    const [p] = resolveJunctionPlacements(keyJunctions([j(0, 0)], []), [
      { scope: 'congruent', key: '*', ...DEFAULT_JUNCTION_ORNAMENT, colour: '#abcdef', matchStrandColour: true },
    ])
    expect(p.colour).toBe('#abcdef')
  })
})

describe('splitJunctionLayers', () => {
  const place = (layer?: 'over' | 'under') => resolveJunctionPlacements(keyJunctions([j(0, 0)], []), [
    { scope: 'congruent', key: '*', ...DEFAULT_JUNCTION_ORNAMENT, ...(layer ? { layer } : null) },
  ])[0]

  it('defaults to drawing over the Strands', () => {
    const { under, over } = splitJunctionLayers([place()])
    expect(over).toHaveLength(1)
    expect(under).toHaveLength(0)
  })

  it('sends an under ornament to the other side', () => {
    const { under, over } = splitJunctionLayers([place('under'), place('over')])
    expect(under).toHaveLength(1)
    expect(over).toHaveLength(1)
  })
})

describe('flarePathD — the twinkle', () => {
  // Two threads at right angles, as ARMS: each pass leaves the crossing both
  // ways, and on a straight field those two ways are antiparallel.
  const cross = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]
  const W = 4
  /** Spans long enough never to bind — capping is exercised on its own below. */
  const FAR4 = [1e3, 1e3, 1e3, 1e3]
  const FAR6 = [1e3, 1e3, 1e3, 1e3, 1e3, 1e3]

  it('rounds every corner of the crossing — two threads make FOUR', () => {
    // A thread passing through continues both ways, so 2 threads = 4 arms =
    // 4 wedges. Treating a thread as one arm would round only half of them.
    const d = flarePathD(cross, FAR4, W, 12, 0.55)
    expect((d.match(/M/g) ?? []).length).toBe(4)
    expect((d.match(/C/g) ?? []).length).toBe(4)
  })

  it('lands each fillet on the arm’s edge at the requested reach', () => {
    const reach = 12
    const d = flarePathD(cross, FAR4, W, reach, 0.55)
    // First subpath's start: up the +x arm at half-width off its centreline.
    const start = pathPoints(d)[0]
    expect(Math.abs(start.x)).toBeCloseTo(reach, 6)
    expect(Math.abs(start.y)).toBeCloseTo(W / 2, 6)
  })

  it('leaves each arm ALONG the arm, so the fillet meets the Strand smoothly', () => {
    // The first control point must sit on the same edge line as the start —
    // i.e. differ only along the arm. A kink there is what "rounding" is for.
    const pts = pathPoints(flarePathD(cross, FAR4, W, 12, 0.55))
    const [start, c1] = pts
    expect(c1.y).toBeCloseTo(start.y, 6)
    expect(Math.abs(c1.x)).toBeLessThan(Math.abs(start.x))
  })

  it('grows with the reach', () => {
    const near = pathPoints(flarePathD(cross, FAR4, W, 6, 0.55))[0]
    const far = pathPoints(flarePathD(cross, FAR4, W, 20, 0.55))[0]
    expect(Math.abs(far.x)).toBeGreaterThan(Math.abs(near.x))
  })

  it('never cuts INTO the crossing — a tiny reach is lifted past the corner', () => {
    // The corner of a right-angle crossing sits at half-width along each arm;
    // a reach shorter than that would put the fillet inside the line work.
    const start = pathPoints(flarePathD(cross, FAR4, W, 0.1, 0.55))[0]
    expect(Math.abs(start.x)).toBeGreaterThan(W / 2)
  })

  it('skips a wedge with no corner to round', () => {
    // One thread alone: its two arms are collinear, so there is no corner.
    expect(flarePathD([{ x: 1, y: 0 }, { x: -1, y: 0 }], [1e3, 1e3], W, 12, 0.55)).toBe('')
  })

  it('rounds all six corners where three threads meet', () => {
    const three = [0, 60, 120].flatMap(d => [d, d + 180]).map(d => ({
      x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180),
    }))
    expect((flarePathD(three, FAR6, W, 12, 0.55).match(/M/g) ?? []).length).toBe(6)
  })

  it('rounds the corners a BENT thread actually makes, not the ones it would if straight', () => {
    // The regression: on an asymmetric field a thread kinks through the
    // crossing, so its two arms are not antiparallel. Fillets built from
    // ±through-direction land half the bend angle off the line work.
    const bend = 16
    const arms = [0, 180 - bend, 90, 270].map(d => ({
      x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180),
    }))
    const d = flarePathD(arms, FAR4, W, 12, 0.55)
    expect((d.match(/M/g) ?? []).length).toBe(4)
    // The fillet on the bent arm must start ALONG that arm: at reach 12 and
    // half-width 2 off its centreline, i.e. 12 along a direction 164°, not 180°.
    const pts = pathPoints(d)
    const u = { x: Math.cos(((180 - bend) * Math.PI) / 180), y: Math.sin(((180 - bend) * Math.PI) / 180) }
    const onBentArm = pts.some(p => {
      const along = p.x * u.x + p.y * u.y
      const off = Math.abs(p.x * -u.y + p.y * u.x)
      return Math.abs(along - 12) < 1e-6 && Math.abs(off - W / 2) < 1e-6
    })
    expect(onBentArm).toBe(true)
  })
})

describe('flarePathD — capping at the end of the line work', () => {
  const cross = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]
  const W = 4
  /** How far up arm `u` a point sits. */
  const along = (p: { x: number; y: number }, u: { x: number; y: number }) => p.x * u.x + p.y * u.y

  it('cuts a side off where its own Strand stops running that way', () => {
    // +x runs only 9 before it bends away; the other three run on. A reach of
    // 50 must therefore stop at 9 on that side and at 50 on the rest, instead
    // of hanging 41 units out over open ground.
    const d = flarePathD(cross, [9, 1e3, 1e3, 1e3], W, 50, 0.55)
    const pts = pathPoints(d)
    const onPlusX = pts.filter(p => Math.abs(p.y) - W / 2 < 1e-6 && p.x > 0)
    expect(onPlusX.length).toBeGreaterThan(0)
    expect(Math.max(...onPlusX.map(p => along(p, { x: 1, y: 0 })))).toBeCloseTo(9, 6)
    // …while the unbound arms still run the full reach.
    expect(Math.max(...pts.map(p => along(p, { x: 0, y: 1 })))).toBeCloseTo(50, 6)
  })

  it('a reach past every span fills the line work and no further', () => {
    const spans = [30, 18, 30, 18]
    const pts = pathPoints(flarePathD(cross, spans, W, 1e4, 0.55))
    for (const [i, u] of cross.entries()) {
      expect(Math.max(...pts.map(p => along(p, u)))).toBeCloseTo(spans[i], 6)
    }
  })

  it('still clears the corner when the span is shorter than the crossing', () => {
    // A span under the corner distance would put the fillet inside the
    // crossing, cutting into the line work rather than rounding it.
    const pts = pathPoints(flarePathD(cross, [0.1, 0.1, 0.1, 0.1], W, 50, 0.55))
    expect(Math.min(...pts.map(p => Math.hypot(p.x, p.y)))).toBeGreaterThan(0)
    expect(Math.max(...pts.map(p => along(p, { x: 1, y: 0 })))).toBeGreaterThan(W / 2)
  })

  it('leaves a short reach alone — the cap only ever shortens', () => {
    const capped = flarePathD(cross, [9, 9, 9, 9], W, 6, 0.55)
    expect(capped).toBe(flarePathD(cross, [1e3, 1e3, 1e3, 1e3], W, 6, 0.55))
  })
})

describe('flarePathD — depth', () => {
  const cross = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]
  const FAR = [1e3, 1e3, 1e3, 1e3]
  const W = 4
  // Each subpath is `M a C c1 c2 b L corner Z` — five points in path order.
  const first = (depth: number) => pathPoints(flarePathD(cross, FAR, W, 12, depth)).slice(0, 5)

  it('0 is flat: the handles sit on the ends, so the fillet is a straight chord', () => {
    const [a, c1, c2, bp] = first(0)
    expect(c1.x).toBeCloseTo(a.x, 6)
    expect(c1.y).toBeCloseTo(a.y, 6)
    expect(c2.x).toBeCloseTo(bp.x, 6)
    expect(c2.y).toBeCloseTo(bp.y, 6)
  })

  it('1 brings the curve right down to the tip of the crossing', () => {
    const [, c1, c2, , corner] = first(1)
    expect(c1.x).toBeCloseTo(corner.x, 6)
    expect(c1.y).toBeCloseTo(corner.y, 6)
    expect(c2.x).toBeCloseTo(corner.x, 6)
    expect(c2.y).toBeCloseTo(corner.y, 6)
  })

  it('dips further the deeper it is set', () => {
    // Distance from the corner to the curve's midpoint: monotone in depth.
    const dip = (depth: number) => {
      const [a, c1, c2, bp, corner] = first(depth)
      const mid = {
        x: (a.x + 3 * c1.x + 3 * c2.x + bp.x) / 8,
        y: (a.y + 3 * c1.y + 3 * c2.y + bp.y) / 8,
      }
      return Math.hypot(mid.x - corner.x, mid.y - corner.y)
    }
    expect(dip(0)).toBeGreaterThan(dip(0.5))
    expect(dip(0.5)).toBeGreaterThan(dip(1))
  })
})

describe('twinkleReach — the twinkle measures itself in world units', () => {
  it('takes `reach` as a world length, whatever the Strand weight', () => {
    // The point of the switch: a thin line on a big Tile still reaches as far
    // into it as asked. Tied to the strand width, it couldn't.
    const style = { ...DEFAULT_JUNCTION_ORNAMENT, shape: 'twinkle' as const, reach: 90 }
    expect(twinkleReach(style, 1)).toBe(90)
    expect(twinkleReach(style, 40)).toBe(90)
  })

  it('falls back to the old `size × strand width` for a record saved before', () => {
    const legacy = { ...DEFAULT_JUNCTION_ORNAMENT, shape: 'twinkle' as const, size: 3 }
    delete (legacy as { reach?: number }).reach
    expect(twinkleReach(legacy, 4)).toBe(12)
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
