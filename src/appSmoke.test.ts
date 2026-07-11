import { describe, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

// Minimal browser shims so module init + render-path code survives Node.
const store = new Map<string, string>()
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

describe('app render smoke (SSR)', () => {
  it('renders App without throwing (fresh profile → Lab default, ADR-0006 flip)', async () => {
    store.delete('app-mode')
    const { default: App } = await import('./App')
    const { ThemeProvider } = await import('./theme/ThemeContext')
    renderToString(createElement(ThemeProvider, null, createElement(App)))
  })

  it('renders App without throwing (persisted Gallery choice → browser)', async () => {
    store.set('app-mode', 'main')
    const { default: App } = await import('./App')
    const { ThemeProvider } = await import('./theme/ThemeContext')
    renderToString(createElement(ThemeProvider, null, createElement(App)))
  })
})
