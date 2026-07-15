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
