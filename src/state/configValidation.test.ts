import { describe, it, expect } from 'vitest'
import { ConfigValidationError, loadPatternConfig } from './configValidation'

/**
 * Characterization tests for the load-time validator (Chunk 12). These pin the
 * current behaviour of `loadPatternConfig`: the required-field gate, the
 * retired-tiling rejection, the legacy `lacing` → `strand` migration, the
 * rosette → star figure coercion, the Gallery Frame clamp/degrade, and the
 * editor-payload required-when-editor-tiling rule.
 */

/** Smallest object that passes the validator. */
function minimalRaw(): Record<string, unknown> {
  return {
    tiling: { type: '4.8.8', scale: 1 },
    figures: { '8': { contactAngle: 67.5 } },
    strand: { width: 2, color: '#000', background: '#fff' },
  }
}

describe('loadPatternConfig — required fields', () => {
  it('accepts a minimal valid config and echoes the core fields', () => {
    const out = loadPatternConfig(minimalRaw())
    expect(out.tiling).toEqual({ type: '4.8.8', scale: 1 })
    expect(out.figures['8'].contactAngle).toBe(67.5)
    expect(out.strand).toEqual({ width: 2, color: '#000', background: '#fff' })
  })

  it('rejects a non-object', () => {
    expect(() => loadPatternConfig(null)).toThrow(ConfigValidationError)
    expect(() => loadPatternConfig(42)).toThrow(/not a JSON object/)
  })

  it('rejects a missing or malformed tiling', () => {
    const r = minimalRaw()
    delete r.tiling
    expect(() => loadPatternConfig(r)).toThrow(/tiling/)
    expect(() => loadPatternConfig({ ...minimalRaw(), tiling: { type: 'x' } }))
      .toThrow(/tiling/)
  })

  it('rejects a missing or malformed figures map', () => {
    const r = minimalRaw()
    delete r.figures
    expect(() => loadPatternConfig(r)).toThrow(/figures/)
    // a figure without a numeric contactAngle is malformed
    expect(() => loadPatternConfig({ ...minimalRaw(), figures: { '8': { type: 'star' } } }))
      .toThrow(/figures/)
  })

  it('accepts an empty figures map (vacuously valid)', () => {
    expect(() => loadPatternConfig({ ...minimalRaw(), figures: {} })).not.toThrow()
  })
})

describe('loadPatternConfig — retired tilings', () => {
  it('rejects layered-mandala and composition with a dated message', () => {
    for (const type of ['layered-mandala', 'composition']) {
      expect(() => loadPatternConfig({ ...minimalRaw(), tiling: { type, scale: 1 } }))
        .toThrow(/retired/)
    }
  })
})

describe('loadPatternConfig — strand / legacy lacing', () => {
  it('reads the current strand shape with optional weave + lineStyle', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      strand: { width: 3, color: '#111', background: '#eee', weave: true, weaveGap: 4, lineStyle: 'double' },
    })
    expect(out.strand.weave).toBe(true)
    expect(out.strand.weaveGap).toBe(4)
    expect(out.strand.lineStyle).toBe('double')
  })

  it('ignores an unknown lineStyle', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      strand: { width: 3, color: '#111', background: '#eee', lineStyle: 'zigzag' },
    })
    expect(out.strand.lineStyle).toBeUndefined()
  })

  it('migrates legacy lacing into the strand shape', () => {
    const r = minimalRaw()
    delete r.strand
    const out = loadPatternConfig({
      ...r,
      lacing: { strandWidth: 5, strandColor: '#222', gapColor: '#ddd', enabled: true, gapWidth: 2 },
    })
    expect(out.strand).toEqual({ width: 5, color: '#222', background: '#ddd', weave: true, weaveGap: 2 })
  })

  it('rejects when neither strand nor lacing parses', () => {
    const r = minimalRaw()
    delete r.strand
    expect(() => loadPatternConfig(r)).toThrow(/strand/)
  })
})

describe('loadPatternConfig — legacy rosette figures', () => {
  it('coerces rosette type back to star and drops petal fields', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      figures: { '8': { contactAngle: 60, type: 'rosette', rosetteQ: 3, rosetteS: 2 } },
    })
    expect(out.figures['8'].type).toBe('star')
    expect((out.figures['8'] as unknown as Record<string, unknown>).rosetteQ).toBeUndefined()
    expect((out.figures['8'] as unknown as Record<string, unknown>).rosetteS).toBeUndefined()
    expect(out.figures['8'].contactAngle).toBe(60)
  })
})

describe('loadPatternConfig — optional passthrough fields', () => {
  it('carries edgeAngles, smoothTransitions when valid', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      edgeAngles: { '0': 30 },
      smoothTransitions: true,
    })
    expect(out.edgeAngles).toEqual({ '0': 30 })
    expect(out.smoothTransitions).toBe(true)
  })
})

describe('loadPatternConfig — Gallery Frame', () => {
  it('reads a valid shape frame and clamps the size', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      frame: { type: 'shape', shape: 'hexagon', size: 1e9, aspect: 2, rotation: 0.5, origin: { x: 1, y: 2 } },
    })
    expect(out.frame?.shape).toBe('hexagon')
    expect(out.frame?.size).toBeLessThan(1e9) // clamped to MAX_FRAME_SIZE
    expect(out.frame?.aspect).toBe(2)
    expect(out.frame?.origin).toEqual({ x: 1, y: 2 })
  })

  it('degrades (drops) a non-shape or unknown-shape frame rather than throwing', () => {
    const a = loadPatternConfig({ ...minimalRaw(), frame: { type: 'n-ring', rings: 2 } })
    expect(a.frame).toBeUndefined()
    const b = loadPatternConfig({ ...minimalRaw(), frame: { type: 'shape', shape: 'triangle' } })
    expect(b.frame).toBeUndefined()
  })

  it('reads a stroke only when fully specified', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      frame: { type: 'shape', shape: 'square', stroke: { enabled: true, colour: '#abc', width: 3 } },
    })
    expect(out.frame?.stroke).toEqual({ enabled: true, colour: '#abc', width: 3 })
    const noStroke = loadPatternConfig({
      ...minimalRaw(),
      frame: { type: 'shape', shape: 'square', stroke: { enabled: true, colour: '', width: 3 } },
    })
    expect(noStroke.frame?.stroke).toBeUndefined()
  })
})

describe('loadPatternConfig — editor payload', () => {
  it('throws when an editor-typed tiling has no editor payload', () => {
    expect(() => loadPatternConfig({ ...minimalRaw(), tiling: { type: 'editor', scale: 1 } }))
      .toThrow(/Editor tiling missing/)
  })

  it('throws when the editor payload is malformed', () => {
    expect(() => loadPatternConfig({ ...minimalRaw(), editor: { version: 999 } }))
      .toThrow(/Editor patch is malformed/)
  })
})

describe('loadPatternConfig — morph (Step 20)', () => {
  const validMorph = () => ({
    enabled: true,
    mode: 'linear',
    origin: { x: 10, y: -5 },
    direction: { x: 0, y: 2 },
    easing: 'linear',
    boundaries: [
      { id: 'b1', position: 200, figures: { '4': { contactAngle: 80 } } },
      { id: 'b0', position: 100, figures: {} },
    ],
  })

  it('reads a valid morph, normalising direction and sorting stops', () => {
    const out = loadPatternConfig({ ...minimalRaw(), morph: validMorph() })
    expect(out.morph).toBeDefined()
    expect(out.morph!.mode).toBe('linear')
    expect(out.morph!.direction).toEqual({ x: 0, y: 1 })
    expect(out.morph!.boundaries.map(b => b.id)).toEqual(['b0', 'b1'])
    expect(out.morph!.boundaries[1].figures['4']).toEqual({ contactAngle: 80 })
  })

  it('radial morph carries no direction', () => {
    const out = loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), mode: 'radial' } })
    expect(out.morph!.mode).toBe('radial')
    expect(out.morph!.direction).toBeUndefined()
  })

  it('drops the morph silently on unknown mode / bad origin / missing boundaries', () => {
    expect(loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), mode: 'spiral' } }).morph).toBeUndefined()
    expect(loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), origin: { x: NaN, y: 0 } } }).morph).toBeUndefined()
    expect(loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), boundaries: 'nope' } }).morph).toBeUndefined()
    expect(loadPatternConfig({ ...minimalRaw(), morph: 42 }).morph).toBeUndefined()
  })

  it('drops malformed stops but keeps the rest; defaults missing ids', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      morph: {
        ...validMorph(),
        boundaries: [
          { position: 50, figures: { '4': { contactAngle: 30 }, bad: 7 } },
          { id: 'x', position: Infinity, figures: {} },
          { id: 'y', figures: {} },
          'garbage',
        ],
      },
    })
    expect(out.morph!.boundaries).toHaveLength(1)
    expect(out.morph!.boundaries[0].id).toBe('morph-0')
    expect(out.morph!.boundaries[0].figures).toEqual({ '4': { contactAngle: 30 } })
  })

  it('forces easing to linear and coerces enabled to a strict boolean', () => {
    const out = loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), easing: 'bounce', enabled: 'yes' } })
    expect(out.morph!.easing).toBe('linear')
    expect(out.morph!.enabled).toBe(false)
  })

  it('defaults a missing/degenerate linear direction to +x', () => {
    const noDir = loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), direction: undefined } })
    expect(noDir.morph!.direction).toEqual({ x: 1, y: 0 })
    const zeroDir = loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), direction: { x: 0, y: 0 } } })
    expect(zeroDir.morph!.direction).toEqual({ x: 1, y: 0 })
  })
})
