import { describe, it, expect, beforeEach } from 'vitest'
import { createConfigLibrary, migrateLegacyLibraries } from './configLibrary'
import type { PatternConfig } from '../types/pattern'

/**
 * ADR-0006 physical library merge: both legacy localStorage keys fold once
 * into the merged key; old keys stay untouched as backup; the merge is
 * idempotent (target-key presence is the marker), resolves id/name
 * collisions without data loss, and skips corrupt legacy rows.
 */

function installLocalStorage(): { store: Map<string, string> } {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size },
  } as Storage
  return { store }
}

let ctx: { store: Map<string, string> }
beforeEach(() => {
  ctx = installLocalStorage()
})

function minimalConfig(type = '4.8.8'): PatternConfig {
  return {
    tiling: { type, scale: 1 },
    figures: { '8': { type: 'star', contactAngle: 67.5, lineLength: 1, autoLineLength: true } },
    strand: { width: 2, color: '#000', background: '#fff' },
  }
}

const TARGET = 'pattern-library-v1'
const LAB = 'lab-tessellations-v1'
const MAIN = 'main-configs-v1'
const SOURCES = [{ key: LAB }, { key: MAIN, nameSuffix: ' (Gallery)' }]

function seed(key: string, names: string[]): void {
  const lib = createConfigLibrary(key)
  for (const name of names) lib.save(name, minimalConfig())
}

describe('migrateLegacyLibraries', () => {
  it('merges entries from both legacy keys into the target', () => {
    seed(LAB, ['Kagome study'])
    seed(MAIN, ['Octagon field'])
    migrateLegacyLibraries(TARGET, SOURCES)
    const names = createConfigLibrary(TARGET).list().map(e => e.name)
    expect(names).toEqual(['Kagome study', 'Octagon field'])
  })

  it('leaves the legacy keys byte-for-byte untouched', () => {
    seed(LAB, ['A'])
    seed(MAIN, ['B'])
    const labRaw = ctx.store.get(LAB)
    const mainRaw = ctx.store.get(MAIN)
    migrateLegacyLibraries(TARGET, SOURCES)
    expect(ctx.store.get(LAB)).toBe(labRaw)
    expect(ctx.store.get(MAIN)).toBe(mainRaw)
  })

  it('is idempotent: a second run never duplicates or clobbers', () => {
    seed(LAB, ['A'])
    migrateLegacyLibraries(TARGET, SOURCES)
    // The user works in the merged library after migration…
    createConfigLibrary(TARGET).save('New work', minimalConfig())
    // …and a later app load re-runs the migration.
    migrateLegacyLibraries(TARGET, SOURCES)
    const names = createConfigLibrary(TARGET).list().map(e => e.name)
    expect(names).toEqual(['A', 'New work'])
  })

  it('regenerates colliding ids so both entries survive', () => {
    seed(LAB, ['Lab one'])
    // Clone the lab payload under the gallery key so ids collide exactly.
    const cloned = (ctx.store.get(LAB) ?? '').replace('Lab one', 'Main one')
    ctx.store.set(MAIN, cloned)
    migrateLegacyLibraries(TARGET, SOURCES)
    const entries = createConfigLibrary(TARGET).list()
    expect(entries).toHaveLength(2)
    expect(entries[0].id).not.toBe(entries[1].id)
    expect(entries.map(e => e.name).sort()).toEqual(['Lab one', 'Main one'])
  })

  it('suffixes colliding names, with a counter when the suffix collides too', () => {
    seed(LAB, ['Star', 'Star (Gallery)'])
    seed(MAIN, ['Star'])
    migrateLegacyLibraries(TARGET, SOURCES)
    const names = createConfigLibrary(TARGET).list().map(e => e.name)
    expect(names).toEqual(['Star', 'Star (Gallery)', 'Star (Gallery) (2)'])
  })

  it('writes nothing on a fresh profile (first save creates the key)', () => {
    migrateLegacyLibraries(TARGET, SOURCES)
    expect(ctx.store.has(TARGET)).toBe(false)
  })

  it('skips corrupt legacy rows but carries the valid ones', () => {
    seed(LAB, ['Good'])
    const parsed = JSON.parse(ctx.store.get(LAB) ?? '') as { version: 1; entries: unknown[] }
    parsed.entries.push({ id: 'bad', name: 'Bad', createdAt: 0, config: { nonsense: true }, sourceCategory: 'editor' })
    ctx.store.set(LAB, JSON.stringify(parsed))
    migrateLegacyLibraries(TARGET, SOURCES)
    const names = createConfigLibrary(TARGET).list().map(e => e.name)
    expect(names).toEqual(['Good'])
  })
})
