import { describe, it, expect, vi } from 'vitest'
import {
  ConfigValidationError,
  CURRENT_PATTERN_CONFIG_VERSION,
  loadPatternConfig,
  readPatternConfig,
} from './configValidation'

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
    axisOrigin: { x: 10, y: -5 },
    direction: { x: 0, y: 2 },
    easing: 'linear',
    origins: [
      { id: 'o1', position: 200, reach: 50, sides: 'negative', figures: { '4': { contactAngle: 80 } } },
      { id: 'o0', position: 100, reach: 120, sides: 'both', figures: {} },
    ],
  })

  it('reads a valid morph, normalising direction and sorting Origins', () => {
    const out = loadPatternConfig({ ...minimalRaw(), morph: validMorph() })
    expect(out.morph).toBeDefined()
    expect(out.morph!.mode).toBe('linear')
    expect(out.morph!.direction).toEqual({ x: 0, y: 1 })
    expect(out.morph!.origins.map(o => o.id)).toEqual(['o0', 'o1'])
    expect(out.morph!.origins[1].figures['4']).toEqual({ contactAngle: 80 })
  })

  it('carries reach and sides through', () => {
    const out = loadPatternConfig({ ...minimalRaw(), morph: validMorph() })
    expect(out.morph!.origins.map(o => o.reach)).toEqual([120, 50])
    expect(out.morph!.origins.map(o => o.sides)).toEqual(['both', 'negative'])
  })

  it('carries autoReach only when explicitly true (#49, additive)', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      morph: {
        ...validMorph(),
        origins: [
          { id: 'o0', position: 0, reach: 10, sides: 'both', autoReach: true, figures: {} },
          { id: 'o1', position: 50, reach: 10, sides: 'both', autoReach: 'yes', figures: {} },
          { id: 'o2', position: 90, reach: 10, sides: 'both', figures: {} },
        ],
      },
    })
    expect(out.morph!.origins.map(o => o.autoReach)).toEqual([true, undefined, undefined])
  })

  it('normalises a bad reach/sides rather than dropping the Origin', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      morph: {
        ...validMorph(),
        origins: [{ id: 'o0', position: 0, reach: -40, sides: 'sideways', figures: {} }],
      },
    })
    expect(out.morph!.origins[0].reach).toBe(0) // negative clamped
    expect(out.morph!.origins[0].sides).toBe('both') // unknown → both
  })

  it('radial morph carries no direction', () => {
    const out = loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), mode: 'radial' } })
    expect(out.morph!.mode).toBe('radial')
    expect(out.morph!.direction).toBeUndefined()
  })

  it('drops the morph silently on unknown mode / bad axis origin / missing origins', () => {
    expect(loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), mode: 'spiral' } }).morph).toBeUndefined()
    expect(loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), axisOrigin: { x: NaN, y: 0 } } }).morph).toBeUndefined()
    expect(loadPatternConfig({ ...minimalRaw(), morph: { ...validMorph(), origins: 'nope' } }).morph).toBeUndefined()
    expect(loadPatternConfig({ ...minimalRaw(), morph: 42 }).morph).toBeUndefined()
  })

  it('drops malformed Origins but keeps the rest; defaults missing ids', () => {
    const out = loadPatternConfig({
      ...minimalRaw(),
      morph: {
        ...validMorph(),
        origins: [
          { position: 50, reach: 10, sides: 'both', figures: { '4': { contactAngle: 30 }, bad: 7 } },
          { id: 'x', position: Infinity, reach: 10, sides: 'both', figures: {} },
          { id: 'y', reach: 10, sides: 'both', figures: {} },
          'garbage',
        ],
      },
    })
    expect(out.morph!.origins).toHaveLength(1)
    expect(out.morph!.origins[0].id).toBe('morph-0')
    expect(out.morph!.origins[0].figures).toEqual({ '4': { contactAngle: 30 } })
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

  // ── Pre-#48 saves: { origin, boundaries } stop chains ──────────────
  describe('legacy boundary migration', () => {
    const legacyMorph = (boundaries: unknown[]) => ({
      enabled: true,
      mode: 'linear',
      origin: { x: 10, y: -5 },
      direction: { x: 1, y: 0 },
      easing: 'linear',
      boundaries,
    })

    it('reads the legacy axis-origin key', () => {
      const out = loadPatternConfig({ ...minimalRaw(), morph: legacyMorph([]) })
      expect(out.morph!.axisOrigin).toEqual({ x: 10, y: -5 })
    })

    it('a SINGLE legacy boundary converts exactly: Origin at 0 reaching it', () => {
      const out = loadPatternConfig({
        ...minimalRaw(),
        morph: legacyMorph([{ id: 'b0', position: 300, figures: { '4': { contactAngle: 80 } } }]),
      })
      expect(out.morph!.origins).toHaveLength(1)
      expect(out.morph!.origins[0]).toMatchObject({
        id: 'b0',
        position: 0,
        reach: 300,
        sides: 'positive',
        figures: { '4': { contactAngle: 80 } },
      })
    })

    it('a negative-position boundary converts to a negative-sided Origin', () => {
      const out = loadPatternConfig({
        ...minimalRaw(),
        morph: legacyMorph([{ id: 'b0', position: -200, figures: {} }]),
      })
      expect(out.morph!.origins[0]).toMatchObject({ position: 0, reach: 200, sides: 'negative' })
    })

    it('a chain converts each segment to its own Origin (approximate, documented)', () => {
      const out = loadPatternConfig({
        ...minimalRaw(),
        morph: legacyMorph([
          { id: 'b0', position: 100, figures: { '4': { contactAngle: 40 } } },
          { id: 'b1', position: 250, figures: { '4': { contactAngle: 80 } } },
        ]),
      })
      expect(out.morph!.origins).toHaveLength(2)
      expect(out.morph!.origins[0]).toMatchObject({ id: 'b0', position: 0, reach: 100, sides: 'positive' })
      expect(out.morph!.origins[1]).toMatchObject({ id: 'b1', position: 100, reach: 150, sides: 'positive' })
    })

    it('the new keys win when a save carries both schemas', () => {
      const out = loadPatternConfig({
        ...minimalRaw(),
        morph: { ...validMorph(), origin: { x: 999, y: 999 }, boundaries: [{ id: 'legacy', position: 7, figures: {} }] },
      })
      expect(out.morph!.axisOrigin).toEqual({ x: 10, y: -5 })
      expect(out.morph!.origins.map(o => o.id)).toEqual(['o0', 'o1'])
    })
  })
})

/**
 * `readPatternConfig` — the lenient sibling used by the Lab's auto-restore.
 * Its contract is the inverse of the strict loader's: never throw, keep as much
 * of the session as possible, and — crucially — get every migration by
 * DELEGATING to `loadPatternConfig` rather than reimplementing it. The tests
 * below pin both halves: the repairs it makes, and the migrations it inherits.
 */
describe('readPatternConfig — lenient restore', () => {
  const fallbackStrand = { width: 4, color: '#1a1a2e', background: '#f5f0e8' }
  const read = (raw: unknown) => readPatternConfig(raw, fallbackStrand)

  it('passes a valid config straight through', () => {
    const out = read(minimalRaw())
    expect(out?.tiling).toEqual({ type: '4.8.8', scale: 1 })
  })

  it('returns null — never throws — for input with no readable tiling', () => {
    for (const bad of [null, undefined, 42, 'nope', {}, { tiling: 'square' }, { tiling: { type: 'square' } }]) {
      expect(() => read(bad)).not.toThrow()
      expect(read(bad)).toBeNull()
    }
  })

  it('blanks a retired tiling type instead of rejecting the whole session', () => {
    const raw = { ...minimalRaw(), tiling: { type: 'layered-mandala', scale: 1 } }
    expect(() => loadPatternConfig(raw)).toThrow(ConfigValidationError) // strict path
    const out = read(raw)
    expect(out?.tiling.type).toBe('')
    expect(out?.figures['8'].contactAngle).toBe(67.5) // rest of the session survives
  })

  it('substitutes the fallback strand when neither `strand` nor `lacing` reads', () => {
    const raw = { ...minimalRaw(), strand: { width: 'wide' } }
    expect(() => loadPatternConfig(raw)).toThrow(ConfigValidationError)
    expect(read(raw)?.strand).toEqual(fallbackStrand)
  })

  it('empties a malformed figures map rather than failing', () => {
    const raw = { ...minimalRaw(), figures: { '8': { contactAngle: 'sharp' } } }
    expect(() => loadPatternConfig(raw)).toThrow(ConfigValidationError)
    expect(read(raw)?.figures).toEqual({})
  })

  it('drops an unmigratable editor patch and blanks the editor tiling with it', () => {
    const raw = { ...minimalRaw(), tiling: { type: 'editor', scale: 1 }, editor: { version: 99 } }
    expect(() => loadPatternConfig(raw)).toThrow(ConfigValidationError)
    const out = read(raw)
    expect(out?.editor).toBeUndefined()
    expect(out?.tiling.type).toBe('') // else the render path looks for a patch that isn't there
  })

  it('blanks an editor tiling whose payload is missing entirely', () => {
    const raw = { ...minimalRaw(), tiling: { type: 'editor', scale: 1 } }
    expect(read(raw)?.tiling.type).toBe('')
  })

  // ── Inherited from loadPatternConfig — the reason this delegates ──────────
  it('inherits the legacy `lacing` → `strand` migration, weave fields included', () => {
    const raw = {
      tiling: { type: '4.8.8', scale: 1 },
      figures: {},
      lacing: { strandWidth: 3, strandColor: '#111', gapColor: '#eee', enabled: true, gapWidth: 5 },
    }
    expect(read(raw)?.strand).toEqual({
      width: 3, color: '#111', background: '#eee', weave: true, weaveGap: 5,
    })
  })

  it('inherits the pre-#48 morph Origin migration', () => {
    const raw = {
      ...minimalRaw(),
      morph: {
        enabled: true, mode: 'linear', easing: 'linear',
        direction: { x: 1, y: 0 },
        origin: { x: 0, y: 0 },                                  // pre-#48 name
        boundaries: [{ id: 'b0', position: 300, figures: {} }],  // pre-#48 stops
      },
    }
    const morph = read(raw)?.morph
    expect(morph?.axisOrigin).toEqual({ x: 0, y: 0 })
    expect(morph?.origins[0]).toMatchObject({ position: 0, reach: 300, sides: 'positive' })
  })

  it('inherits the Gallery Frame clamp rather than passing a degenerate outline through', () => {
    const raw = { ...minimalRaw(), frame: { type: 'shape', shape: 'octagon', size: 99999 } }
    const frame = read(raw)?.frame
    expect(frame?.shape).toBe('octagon')
    expect(frame!.size).toBeLessThan(99999)
  })

  it('inherits the allow-list, dropping payloads from retired subsystems', () => {
    const raw = { ...minimalRaw(), mandala: { rings: 3 }, composition: { layers: [] } }
    const out = read(raw) as unknown as Record<string, unknown>
    expect(out.mandala).toBeUndefined()
    expect(out.composition).toBeUndefined()
  })
})

/**
 * Schema versioning (roadmap #6).
 *
 * The load-bearing property is the FIRST test: absent `version` means
 * generation 0, and every save in every existing library lacks the field. If
 * that default ever changes, the user's whole library becomes unreadable.
 *
 * The rest pin the narrowing that versioning buys — legacy shape sniffs run for
 * generation 0 only, so they stay dated migrations instead of probes every
 * future save keeps paying for — and the deliberate strict/lenient asymmetry on
 * a newer-than-build config.
 */
describe('PatternConfig schema version', () => {
  it('CURRENT_PATTERN_CONFIG_VERSION is 1', () => {
    expect(CURRENT_PATTERN_CONFIG_VERSION).toBe(1)
  })

  it('an unversioned (generation-0) config still loads, unchanged but stamped', () => {
    const raw = minimalRaw()
    expect(raw.version).toBeUndefined()
    const out = loadPatternConfig(raw)
    expect(out.version).toBe(CURRENT_PATTERN_CONFIG_VERSION)
    expect(out.tiling).toEqual({ type: '4.8.8', scale: 1 })
    expect(out.figures['8'].contactAngle).toBe(67.5)
    expect(out.strand).toEqual({ width: 2, color: '#000', background: '#fff' })
  })

  it('a version-1 config round-trips through save → load unchanged', () => {
    const once = loadPatternConfig(minimalRaw())
    const twice = loadPatternConfig(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
  })

  it('treats a hand-edited non-generation `version` as generation 0', () => {
    // Permissive on purpose: the generation-0 migrations are no-ops on an
    // already-modern shape, so reading these as 0 costs nothing and refusing
    // them would reject a save over a typo.
    for (const version of [0, -3, 1.5, 'one', null]) {
      expect(loadPatternConfig({ ...minimalRaw(), version }).version)
        .toBe(CURRENT_PATTERN_CONFIG_VERSION)
    }
  })

  describe('newer than this build', () => {
    const future = () => ({ ...minimalRaw(), version: CURRENT_PATTERN_CONFIG_VERSION + 1 })

    it('is refused by the strict loader, naming both versions', () => {
      expect(() => loadPatternConfig(future())).toThrow(ConfigValidationError)
      expect(() => loadPatternConfig(future())).toThrow(/newer version/)
      expect(() => loadPatternConfig(future())).toThrow(/schema version 2/)
    })

    it('is read best-effort by the lenient restore instead of blanking the session', () => {
      // The asymmetry is the point: refusing an import is honest, but refusing
      // the session the user left open is a blank Lab with no way back (#50).
      const out = readPatternConfig(future(), { width: 4, color: '#000', background: '#fff' })
      expect(out).not.toBeNull()
      expect(out!.tiling).toEqual({ type: '4.8.8', scale: 1 })
      expect(out!.version).toBe(CURRENT_PATTERN_CONFIG_VERSION)
    })
  })

  describe('generation-0-only migrations', () => {
    it('generation 1 does not sniff for the legacy `lacing` block', () => {
      const raw: Record<string, unknown> = {
        ...minimalRaw(),
        version: 1,
        lacing: { strandWidth: 5, strandColor: '#222', gapColor: '#ddd' },
      }
      delete raw.strand
      // `lacing` on a version-1 save is genuinely unrecognised, so the dev
      // warning fires here by design — silenced to keep the run's output clean.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        expect(() => loadPatternConfig(raw)).toThrow(/strand/)
      } finally {
        warn.mockRestore()
      }
      // ...whereas the same payload at generation 0 migrates.
      const { version: _v, ...gen0 } = raw
      expect(loadPatternConfig(gen0).strand).toMatchObject({ width: 5, color: '#222', background: '#ddd' })
    })

    it('generation 1 does not sniff for the pre-#48 morph shape', () => {
      const legacyMorph = {
        enabled: true, mode: 'linear', easing: 'linear',
        origin: { x: 0, y: 0 },
        boundaries: [{ id: 'b0', position: 300, figures: {} }],
      }
      expect(loadPatternConfig({ ...minimalRaw(), version: 1, morph: legacyMorph }).morph).toBeUndefined()
      expect(loadPatternConfig({ ...minimalRaw(), morph: legacyMorph }).morph).toBeDefined()
    })

    it('generation 1 preserves a recognised figure type instead of forcing it', () => {
      // The retired landmine: an unconditional `type: 'star'` coercion flattens
      // nothing while the union has one member, then silently destroys the
      // second one the moment it exists (the rosette epic).
      const out = loadPatternConfig({
        ...minimalRaw(), version: 1,
        figures: { '8': { contactAngle: 60, type: 'star' } },
      })
      expect(out.figures['8'].type).toBe('star')
    })

    it('generation 1 still defaults an ABSENT figure type', () => {
      const out = loadPatternConfig({ ...minimalRaw(), version: 1, figures: { '8': { contactAngle: 60 } } })
      expect(out.figures['8'].type).toBe('star')
    })

    it('generation 0 still coerces the removed rosette type and drops its petal fields', () => {
      const out = loadPatternConfig({
        ...minimalRaw(),
        figures: { '8': { contactAngle: 60, type: 'rosette', rosetteQ: 3, rosetteS: 2 } },
      })
      expect(out.figures['8'].type).toBe('star')
      expect((out.figures['8'] as unknown as Record<string, unknown>).rosetteQ).toBeUndefined()
    })
  })

  describe('unknown fields', () => {
    it('are stripped, and named in a dev warning', () => {
      // The allow-list DELETES rather than ignores, and `list()` re-validates on
      // read while the Lab re-persists on change — so a field added to
      // PatternConfig but forgotten in readConfig dies library-wide in one
      // load+save cycle. The warning is what makes that loud on load 1.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const out = loadPatternConfig({ ...minimalRaw(), someNewField: 42 })
        expect((out as unknown as Record<string, unknown>).someNewField).toBeUndefined()
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('someNewField'))
      } finally {
        warn.mockRestore()
      }
    })

    it('stays quiet about deliberately retired keys on a generation-0 save', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        loadPatternConfig({ ...minimalRaw(), lacing: { strandWidth: 1, strandColor: '#0', gapColor: '#1' }, mandala: { rings: 3 } })
        expect(warn).not.toHaveBeenCalled()
      } finally {
        warn.mockRestore()
      }
    })
  })
})
