import { describe, it, expect, beforeEach } from 'vitest'
import { loadLabState, saveLabState, LAB_DEFAULT_PERSISTED } from './labDefaults'
import { LAB_DEFAULT_CONFIG } from './labDefaults'
import type { PatternConfig } from '../types/pattern'

/**
 * Regression cover for the Lab's auto-persisted working state.
 *
 * The Lab writes the live `PatternConfig` to localStorage on every change and
 * rehydrates it on boot. That restore used to reimplement its own migrations —
 * a second, weaker schema gate — and the #48 `boundaries`→`origins` /
 * `origin`→`axisOrigin` rename was missed there, so a session persisted before
 * it crashed the Canvas on next load (`morphActive` reading `origins.length` of
 * undefined) with no in-app recovery: the user could only clear storage.
 *
 * The boot path now goes through `readPatternConfig` → `loadPatternConfig`, so
 * migrations are inherited rather than duplicated. These tests pin that at the
 * localStorage boundary — the morph cases as regression cover for #50, and the
 * inheritance cases to catch the gate being forked again.
 */

/** In-memory localStorage so the persistence paths run under node. */
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

/** Write a raw persisted payload, bypassing the typed save path. */
const persistRaw = (config: unknown) => {
  store.set('lab-state-v1', JSON.stringify({ config, showStrands: false, outlineWidth: 0.8 }))
}
const baseConfig = () => structuredClone(LAB_DEFAULT_CONFIG) as PatternConfig

describe('loadLabState — morph migration', () => {
  it('round-trips a current-shape morph untouched', () => {
    const config = baseConfig()
    config.morph = {
      enabled: true,
      mode: 'linear',
      axisOrigin: { x: 10, y: -5 },
      direction: { x: 1, y: 0 },
      easing: 'linear',
      origins: [{ id: 'o0', position: 200, reach: 300, autoReach: true, sides: 'both', figures: {} }],
    }
    saveLabState({ config, showStrands: false, outlineWidth: 0.8, savedId: '' })
    const out = loadLabState()
    expect(out.config.morph).toEqual(config.morph)
  })

  it('migrates a pre-#48 persisted morph instead of crashing on it', () => {
    const config = baseConfig() as unknown as Record<string, unknown>
    config.morph = {
      enabled: true,
      mode: 'linear',
      direction: { x: 1, y: 0 },
      easing: 'linear',
      origin: { x: 0, y: 0 },                                     // pre-#48 name
      boundaries: [{ id: 'b0', position: 300, figures: {} }],     // pre-#48 stops
    }
    persistRaw(config)
    const morph = loadLabState().config.morph
    expect(morph).toBeDefined()
    // The shape the live code actually reads — both were absent before.
    expect(morph!.axisOrigin).toEqual({ x: 0, y: 0 })
    expect(Array.isArray(morph!.origins)).toBe(true)
    // Single legacy boundary converts exactly: Origin at 0 reaching it.
    expect(morph!.origins[0]).toMatchObject({ position: 0, reach: 300, sides: 'positive' })
  })

  it('drops an unreadable morph rather than booting into a crash', () => {
    const config = baseConfig() as unknown as Record<string, unknown>
    config.morph = { mode: 'spiral', origins: 'nope' }
    persistRaw(config)
    expect(loadLabState().config.morph).toBeUndefined()
  })

  it('leaves a config with no morph alone', () => {
    persistRaw(baseConfig())
    const out = loadLabState()
    expect(out.config.morph).toBeUndefined()
    expect(out.config.tiling).toBeDefined()
  })

  it('falls back to defaults when nothing is persisted', () => {
    expect(loadLabState()).toEqual(LAB_DEFAULT_PERSISTED)
  })
})

describe('loadLabState — linked library entry', () => {
  it('round-trips the linked save id so a reload keeps updating that entry', () => {
    saveLabState({ config: baseConfig(), showStrands: false, outlineWidth: 0.8, savedId: 'entry-7' })
    expect(loadLabState().savedId).toBe('entry-7')
  })

  it('comes back unlinked for sessions persisted before the field existed', () => {
    persistRaw(baseConfig()) // raw payload has no `savedId`
    expect(loadLabState().savedId).toBe('')
  })
})

describe('loadLabState — migrations inherited from loadPatternConfig', () => {
  it('migrates a v1 editor patch to v3 on boot', () => {
    const config = baseConfig() as unknown as Record<string, unknown>
    config.tiling = { type: 'editor', scale: 100 }
    // Legacy single-cell v1 shape: flat boundary fields, no `cells[]`.
    config.editor = {
      version: 1,
      boundaryShape: 'square',
      boundarySize: 200,
      originSides: 4,
      noSeed: true,
      tiles: [],
      edgeLength: 100,
    }
    persistRaw(config)
    const out = loadLabState()
    expect(out.config.editor?.version).toBe(3)
    expect(out.config.tiling.type).toBe('editor')
  })

  it('boots blank instead of crashing when the editor patch will not migrate', () => {
    const config = baseConfig() as unknown as Record<string, unknown>
    config.tiling = { type: 'editor', scale: 100 }
    config.editor = { version: 99 }
    persistRaw(config)
    const out = loadLabState()
    expect(out.config.editor).toBeUndefined()
    expect(out.config.tiling.type).toBe('')
  })

  it('migrates a legacy `lacing` block to `strand`, keeping the weave fields', () => {
    // The old hand-written branch here dropped `enabled`/`gapWidth`; delegating
    // to readStrandStyle carries them.
    persistRaw({
      tiling: { type: '4.8.8', scale: 100 },
      figures: {},
      lacing: { strandWidth: 3, strandColor: '#111', gapColor: '#eee', enabled: true, gapWidth: 5 },
    })
    const out = loadLabState()
    expect(out.config.strand).toEqual({
      width: 3, color: '#111', background: '#eee', weave: true, weaveGap: 5,
    })
    expect((out.config as unknown as Record<string, unknown>).lacing).toBeUndefined()
  })

  it('blanks a retired tiling type and strips its stray payload', () => {
    const config = baseConfig() as unknown as Record<string, unknown>
    config.tiling = { type: 'layered-mandala', scale: 100 }
    config.mandala = { rings: 3 }
    persistRaw(config)
    const out = loadLabState()
    expect(out.config.tiling.type).toBe('')
    expect((out.config as unknown as Record<string, unknown>).mandala).toBeUndefined()
  })

  it('clamps a hand-edited Gallery Frame instead of restoring it raw', () => {
    const config = baseConfig() as unknown as Record<string, unknown>
    config.frame = { type: 'shape', shape: 'hexagon', size: 99999 }
    persistRaw(config)
    expect(loadLabState().config.frame!.size).toBeLessThan(99999)
  })

  it('falls back to the default config when nothing is salvageable', () => {
    persistRaw({ tiling: 'not-an-object' })
    expect(loadLabState().config).toEqual(LAB_DEFAULT_CONFIG)
  })

  it('keeps the surrounding Lab state when the config itself is unsalvageable', () => {
    store.set('lab-state-v1', JSON.stringify({
      config: { tiling: null }, showStrands: true, outlineWidth: 2.5, savedId: 'entry-9',
    }))
    const out = loadLabState()
    expect(out.config).toEqual(LAB_DEFAULT_CONFIG)
    expect(out.showStrands).toBe(true)
    expect(out.outlineWidth).toBe(2.5)
    expect(out.savedId).toBe('entry-9')
  })
})
