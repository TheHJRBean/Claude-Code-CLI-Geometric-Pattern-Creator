import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../theme/ThemeContext'
import { SunIcon, MoonIcon } from './lab/labShared'

/** Small octa-star brand mark — mirrors the Sidebar's OctaStar motif. */
function BrandMark() {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8 - Math.PI / 2
    const r = i % 2 === 0 ? 9 : 4.2
    return `${10 + r * Math.cos(a)},${10 + r * Math.sin(a)}`
  }).join(' ')
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <polygon points={pts} fill="var(--accent)" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export interface ExportItem {
  label: string
  onClick: () => void
}

interface TopBarProps {
  mode: 'main' | 'lab'
  onToggleMode: () => void
  /** Contextual descriptor of the current pattern/tessellation. */
  title?: string
  exportItems: ExportItem[]
}

/**
 * Persistent top bar shared by both workspaces (rendered per-mode so each keeps
 * its own export handlers + dispatch). Owns global chrome: brand, the
 * Gallery|Lab segmented switcher, the active-pattern descriptor, the theme
 * toggle, and the Export menu — replacing the chrome previously crammed into
 * each sidebar header.
 */
export function TopBar({ mode, onToggleMode, title, exportItems }: TopBarProps) {
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <BrandMark />
        <span className="top-bar__wordmark">Geometric Atlas</span>
      </div>

      <div className="workspace-switcher" role="tablist" aria-label="Workspace">
        <button
          role="tab"
          aria-selected={mode === 'main'}
          className={`workspace-switcher__btn ${mode === 'main' ? 'workspace-switcher__btn--active' : ''}`}
          onClick={() => { if (mode !== 'main') onToggleMode() }}
        >
          Gallery
        </button>
        <button
          role="tab"
          aria-selected={mode === 'lab'}
          className={`workspace-switcher__btn ${mode === 'lab' ? 'workspace-switcher__btn--active' : ''}`}
          onClick={() => { if (mode !== 'lab') onToggleMode() }}
        >
          Lab
        </button>
      </div>

      {title && <span className="top-bar__title" title={title}>{title}</span>}

      <div className="top-bar__spacer" />

      <div className="top-bar__actions">
        <button
          className="top-bar__icon-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {exportItems.length > 0 && (
          <div className="export-menu" ref={menuRef}>
            <button
              className="top-bar__icon-btn export-menu__trigger"
              onClick={() => setMenuOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Export"
              title="Export"
            >
              <DownloadIcon />
            </button>
            {menuOpen && (
              <div className="export-menu__panel" role="menu">
                {exportItems.map(it => (
                  <button
                    key={it.label}
                    role="menuitem"
                    className="export-menu__item"
                    onClick={() => { setMenuOpen(false); it.onClick() }}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
