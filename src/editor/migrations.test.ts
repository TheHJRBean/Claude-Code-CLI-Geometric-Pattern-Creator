import { describe, it, expect } from 'vitest'
import { migrateEditorConfig } from './migrations'

/** Minimal valid v3 single-cell patch object (as it'd arrive from JSON). */
function v3Patch(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 3,
    activeCellId: 'main',
    edgeLength: 100,
    cells: [
      {
        id: 'main',
        shape: 'square',
        center: { x: 0, y: 0 },
        rotation: 0,
        boundarySize: 100,
        seedSides: 4,
        tiles: [
          { id: 'seed', kind: 'regular', sides: 4, center: { x: 0, y: 0 }, edgeLength: 100, rotation: 0, source: 'seed' },
        ],
      },
    ],
    ...extra,
  }
}

describe('Guides slice 3 — guideTiles migration', () => {
  it('a patch with no guideTiles loads with the field absent', () => {
    const out = migrateEditorConfig(v3Patch())
    expect(out).not.toBeNull()
    expect(out!.guideTiles).toBeUndefined()
  })

  it('round-trips valid world-space Guide Tiles (regular + irregular)', () => {
    const out = migrateEditorConfig(v3Patch({
      guideTiles: [
        { id: 'g0', kind: 'regular', sides: 6, center: { x: 40, y: 20 }, edgeLength: 60, rotation: 0.3, source: 'completed' },
        { id: 'g1', kind: 'irregular', vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }], source: 'completed' },
      ],
    }))
    expect(out!.guideTiles).toHaveLength(2)
    expect(out!.guideTiles![0].kind).toBe('regular')
    expect(out!.guideTiles![1].kind).toBe('irregular')
  })

  it('drops malformed Guide Tiles, keeping the valid ones', () => {
    const out = migrateEditorConfig(v3Patch({
      guideTiles: [
        { id: 'ok', kind: 'regular', sides: 4, center: { x: 0, y: 0 }, edgeLength: 30, rotation: 0, source: 'completed' },
        { kind: 'nonsense' },
        null,
      ],
    }))
    expect(out!.guideTiles).toHaveLength(1)
  })
})

describe('Decoration gradients (#44) — ColourRecord.gradient migration', () => {
  const grad = {
    type: 'linear',
    stops: [{ offset: 0, colour: '#111' }, { offset: 1, colour: '#eee' }],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 100 },
  }
  const deco = (gradient: unknown) => ({
    version: 1,
    strandColours: [],
    voidFills: [{ scope: 'congruent', key: 'sig', colour: '#123456', gradient }],
  })

  it('round-trips a valid linear gradient record', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco(grad) }))
    expect(out!.decoration!.voidFills[0].gradient).toEqual(grad)
  })

  it('round-trips a valid radial gradient record', () => {
    const radial = { type: 'radial', stops: grad.stops, centre: { x: 5, y: 6 }, radius: 40 }
    const out = migrateEditorConfig(v3Patch({ decoration: deco(radial) }))
    expect(out!.decoration!.voidFills[0].gradient).toEqual(radial)
  })

  it.each([
    ['unknown type', { ...grad, type: 'conic' }],
    ['single stop', { ...grad, stops: [grad.stops[0]] }],
    ['offset out of range', { ...grad, stops: [{ offset: -0.1, colour: '#111' }, { offset: 1, colour: '#eee' }] }],
    ['non-string stop colour', { ...grad, stops: [{ offset: 0, colour: 7 }, { offset: 1, colour: '#eee' }] }],
    ['linear missing end', { type: 'linear', stops: grad.stops, start: { x: 0, y: 0 } }],
    ['radial non-positive radius', { type: 'radial', stops: grad.stops, centre: { x: 0, y: 0 }, radius: 0 }],
    ['not an object', 'gradient!'],
  ])('malformed gradient (%s) is dropped, keeping the flat colour', (_name, bad) => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco(bad) }))
    expect(out!.decoration!.voidFills).toEqual([
      { scope: 'congruent', key: 'sig', colour: '#123456' },
    ])
  })
})

describe('Across-frame gradient (#45) — frameGradient migration', () => {
  const grad = {
    type: 'linear',
    stops: [{ offset: 0, colour: '#111' }, { offset: 1, colour: '#000' }],
    start: { x: 0, y: 0 }, end: { x: 0, y: 100 },
  }
  const deco = (frameGradient: unknown) => ({ version: 1, strandColours: [], voidFills: [], frameGradient })

  it('round-trips an enabled linear frame gradient', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, ...grad }) }))
    expect(out!.decoration!.frameGradient).toEqual({ enabled: true, ...grad })
  })

  it('coerces a missing/truthy enabled flag to a boolean (defaults false)', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco(grad) }))
    expect(out!.decoration!.frameGradient).toEqual({ enabled: false, ...grad })
  })

  it('drops a malformed frame gradient, keeping the rest of decoration', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, type: 'conic', stops: grad.stops }) }))
    expect(out!.decoration!.frameGradient).toBeUndefined()
    expect(out!.decoration).toBeDefined()
  })
})

describe('Strand gradient (#46) — strandGradient migration', () => {
  const grad = {
    type: 'linear',
    stops: [{ offset: 0, colour: '#c0392b' }, { offset: 1, colour: '#2c3e50' }],
    start: { x: 0, y: 0 }, end: { x: 0, y: 120 },
  }
  const deco = (strandGradient: unknown) => ({ version: 1, strandColours: [], voidFills: [], strandGradient })

  it('round-trips an enabled linear strand gradient', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, ...grad }) }))
    expect(out!.decoration!.strandGradient).toEqual({ enabled: true, ...grad })
  })

  it('coerces a missing/truthy enabled flag to a boolean (defaults false)', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco(grad) }))
    expect(out!.decoration!.strandGradient).toEqual({ enabled: false, ...grad })
  })

  it('drops a malformed strand gradient, keeping the rest of decoration', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, type: 'radial', stops: grad.stops }) }))
    expect(out!.decoration!.strandGradient).toBeUndefined()
    expect(out!.decoration).toBeDefined()
  })

  it('round-trips a scopeKey (single-Strand narrowing, #46 follow-up)', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, scopeKey: '8i:abcd1234', ...grad }) }))
    expect(out!.decoration!.strandGradient).toEqual({ enabled: true, scopeKey: '8i:abcd1234', ...grad })
  })

  it('drops a non-string scopeKey, keeping the gradient (defaults to the global wash)', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, scopeKey: 42, ...grad }) }))
    expect(out!.decoration!.strandGradient).toEqual({ enabled: true, ...grad })
    expect('scopeKey' in out!.decoration!.strandGradient!).toBe(false)
  })

  it('round-trips a cell (Twins) reach scope alongside its key', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, scope: 'cell', scopeKey: '5#c0:deadbeef', ...grad }) }))
    expect(out!.decoration!.strandGradient).toEqual({ enabled: true, scope: 'cell', scopeKey: '5#c0:deadbeef', ...grad })
  })

  it('round-trips a patch (Single) reach scope alongside its key', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, scope: 'patch', scopeKey: '5@12.00,-8.00', ...grad }) }))
    expect(out!.decoration!.strandGradient).toEqual({ enabled: true, scope: 'patch', scopeKey: '5@12.00,-8.00', ...grad })
  })

  it('drops an invalid scope but keeps the key (falls back to the congruent rung)', () => {
    // `instance` and garbage aren't strand-gradient rungs; congruent is implicit.
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, scope: 'instance', scopeKey: '5', ...grad }) }))
    expect(out!.decoration!.strandGradient).toEqual({ enabled: true, scopeKey: '5', ...grad })
    expect('scope' in out!.decoration!.strandGradient!).toBe(false)
  })

  it('drops a scope with no key (a positioned scope is meaningless without its key)', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: deco({ enabled: true, scope: 'cell', ...grad }) }))
    expect(out!.decoration!.strandGradient).toEqual({ enabled: true, ...grad })
    expect('scope' in out!.decoration!.strandGradient!).toBe(false)
  })
})

describe('Step 19 — decoration migration', () => {
  it('a v3 patch with no decoration loads with decoration undefined', () => {
    const out = migrateEditorConfig(v3Patch())
    expect(out).not.toBeNull()
    expect(out!.decoration).toBeUndefined()
  })

  it('a legacy v1 patch loads with decoration undefined (never had it)', () => {
    const v1 = {
      version: 1,
      edgeLength: 100,
      boundaryShape: 'square',
      boundarySize: 100,
      seedSides: 4,
      tiles: [
        { id: 'seed', kind: 'regular', sides: 4, center: { x: 0, y: 0 }, edgeLength: 100, rotation: 0, source: 'seed' },
      ],
    }
    const out = migrateEditorConfig(v1)
    expect(out).not.toBeNull()
    expect(out!.decoration).toBeUndefined()
  })

  it('round-trips a valid decoration block (strand colours + void fills)', () => {
    const out = migrateEditorConfig(v3Patch({
      decoration: {
        version: 1,
        strandColours: [{ scope: 'congruent', key: '*', colour: '#b8860b' }],
        voidFills: [
          { scope: 'congruent', key: 'a1b2c3d4', colour: '#1e6b52' },
          { scope: 'congruent', key: 'deadbeef', colour: '#7d3c98' },
        ],
      },
    }))
    expect(out!.decoration).toEqual({
      version: 1,
      strandColours: [{ scope: 'congruent', key: '*', colour: '#b8860b' }],
      voidFills: [
        { scope: 'congruent', key: 'a1b2c3d4', colour: '#1e6b52' },
        { scope: 'congruent', key: 'deadbeef', colour: '#7d3c98' },
      ],
    })
  })

  it('accepts the reserved later-stage scopes (ladder-ready)', () => {
    const out = migrateEditorConfig(v3Patch({
      decoration: {
        version: 1,
        strandColours: [{ scope: 'patch', key: 'orbit-2', colour: '#111' }],
        voidFills: [{ scope: 'instance', key: 'w:42', colour: '#222' }],
      },
    }))
    expect(out!.decoration!.strandColours[0].scope).toBe('patch')
    expect(out!.decoration!.voidFills[0].scope).toBe('instance')
  })

  it('filters out malformed colour records but keeps valid ones', () => {
    const out = migrateEditorConfig(v3Patch({
      decoration: {
        version: 1,
        strandColours: [
          { scope: 'congruent', key: '*', colour: '#fff' },
          { scope: 'bogus', key: '*', colour: '#fff' },     // bad scope
          { scope: 'congruent', key: '', colour: '#fff' },  // empty key
          { scope: 'congruent', key: 'x', colour: 42 },     // non-string colour
          'not-an-object',
        ],
        voidFills: [],
      },
    }))
    expect(out!.decoration!.strandColours).toEqual([
      { scope: 'congruent', key: '*', colour: '#fff' },
    ])
    expect(out!.decoration!.voidFills).toEqual([])
  })

  it('drops a decoration block with the wrong version (no decoration)', () => {
    const out = migrateEditorConfig(v3Patch({
      decoration: { version: 99, strandColours: [], voidFills: [] },
    }))
    expect(out!.decoration).toBeUndefined()
  })

  it('tolerates a decoration block missing the arrays (defaults to empty)', () => {
    const out = migrateEditorConfig(v3Patch({ decoration: { version: 1 } }))
    expect(out!.decoration).toEqual({ version: 1, strandColours: [], voidFills: [] })
  })
})

describe('Void Stamps — migration', () => {
  const stamp = { scope: 'congruent', key: 'a1b2c3d4', image: 'data:image/webp;base64,x', width: 800, height: 600, fit: 'cover' }

  it('round-trips a valid voidStamps array', () => {
    const out = migrateEditorConfig(v3Patch({
      decoration: { version: 1, strandColours: [], voidFills: [], voidStamps: [stamp] },
    }))
    expect(out!.decoration!.voidStamps).toEqual([stamp])
  })

  it('drops malformed stamp records but keeps valid ones; empty array drops the field', () => {
    const out = migrateEditorConfig(v3Patch({
      decoration: {
        version: 1,
        strandColours: [],
        voidFills: [],
        voidStamps: [
          stamp,
          { ...stamp, image: 'not-a-data-url' },
          { ...stamp, width: 0 },
          { ...stamp, fit: 'stretch' },
          { ...stamp, key: '' },
          'garbage',
        ],
      },
    }))
    expect(out!.decoration!.voidStamps).toEqual([stamp])
    const empty = migrateEditorConfig(v3Patch({
      decoration: { version: 1, strandColours: [], voidFills: [], voidStamps: [{ ...stamp, width: -1 }] },
    }))
    expect(empty!.decoration!.voidStamps).toBeUndefined()
  })

  it('round-trips a Focus-mode transform; strips a malformed one, keeping the record', () => {
    const transform = { offsetX: 0.2, offsetY: -0.1, scale: 1.5, rotation: 45 }
    const out = migrateEditorConfig(v3Patch({
      decoration: { version: 1, strandColours: [], voidFills: [], voidStamps: [{ ...stamp, transform }] },
    }))
    expect(out!.decoration!.voidStamps).toEqual([{ ...stamp, transform }])
    for (const bad of [
      { ...transform, scale: 0 },
      { ...transform, rotation: 'lots' },
      { ...transform, offsetX: NaN },
      'garbage',
    ]) {
      const stripped = migrateEditorConfig(v3Patch({
        decoration: { version: 1, strandColours: [], voidFills: [], voidStamps: [{ ...stamp, transform: bad }] },
      }))
      expect(stripped!.decoration!.voidStamps).toEqual([stamp])
    }
  })
})
