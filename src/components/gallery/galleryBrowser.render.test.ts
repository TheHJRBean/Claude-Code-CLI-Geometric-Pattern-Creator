import { describe, it, expect, beforeAll } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

/**
 * SSR render check for the Gallery browser grid (ADR-0006, slice 5). The test
 * env is node (no jsdom), so effects — and therefore the offscreen thumbnail
 * backfill + IndexedDB — don't run; this exercises the pure render path only:
 * a seeded library must produce a card with the save's name, its legacy-path
 * badge, and the manage actions. Thumbnails degrade to the placeholder here,
 * which is the intended fallback.
 */

const store = new Map<string, string>()

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as Record<string, unknown>).window = Object.assign(
    (globalThis as Record<string, unknown>).window ?? {},
    {
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
      addEventListener: () => {},
      removeEventListener: () => {},
      innerWidth: 1600,
      innerHeight: 1200,
      location: { search: '' },
    },
  )
})

describe('GalleryBrowser render', () => {
  it('renders a card per saved pattern with name, badge, and actions', async () => {
    const { DEFAULT_CONFIG } = await import('../../state/reducer')
    // Seed the merged library directly so migration is a no-op (key present).
    store.set('pattern-library-v1', JSON.stringify({
      version: 1,
      entries: [{
        id: 'seed-1',
        name: 'Test Pattern',
        createdAt: 0,
        config: DEFAULT_CONFIG,
        sourceCategory: 'archimedean',
      }],
    }))

    const { GalleryBrowser } = await import('./GalleryBrowser')
    const { patternLibrary } = await import('../../state/patternLibrary')

    const html = renderToString(
      createElement(GalleryBrowser, {
        library: patternLibrary,
        onEditInLab: () => {},
        onGoToLab: () => {},
      }),
    )

    expect(html).toContain('Test Pattern')
    expect(html).toContain('Archimedean') // legacy-path badge
    expect(html).toContain('Rename')
    expect(html).toContain('Delete')
    expect(html).toContain('My Patterns')
    // Placeholder shown until the (effect-driven) thumbnail backfills.
    expect(html).toContain('Rendering preview')
  })
})
