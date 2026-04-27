import { useReducer, useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { reducer } from '../state/reducer'
import { TILINGS, SYMMETRY_GROUPS } from '../tilings/index'
import { LAB_PRESETS, LAB_PRESETS_BY_ID } from '../state/labPresets'
import { Canvas } from './Canvas'
import { SandstoneEdge } from './SandstoneEdge'
import { useTheme } from '../theme/ThemeContext'

/**
 * Tessellation Lab — stripped-down mode for prototyping new tessellations.
 * Lab focus is the polygon tessellation itself; strands (PIC contact lines)
 * are an optional overlay, off by default.
 */

const LAB_DEFAULT_CONFIG: PatternConfig = {
  tiling: { type: '', scale: 100 },
  figures: {},
  lacing: {
    enabled: false,
    strandWidth: 4,
    gapWidth: 3,
    strandColor: '#1a1a2e',
    gapColor: '#f5f0e8',
  },
}

interface Props {
  mode: 'main' | 'lab'
  onToggleMode: () => void
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function TessellationLabMode({ mode, onToggleMode }: Props) {
  const { theme, toggleTheme } = useTheme()
  const [config, dispatch] = useReducer(reducer, LAB_DEFAULT_CONFIG)
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  // Lab focuses on the tessellation itself. Strands are an optional overlay,
  // off by default.
  const [showStrands, setShowStrands] = useState(false)
  const [cpVisible] = useState<Record<string, boolean>>({})
  const [cpActive] = useState<Record<string, number>>({})
  const [pendingPresetId, setPendingPresetId] = useState<string>('')

  const def = config.tiling.type ? TILINGS[config.tiling.type] : undefined

  const resetTessellationDefaults = () => {
    if (config.tiling.type) {
      dispatch({ type: 'SET_TILING_TYPE', payload: config.tiling.type })
    }
  }

  const loadPreset = (id: string) => {
    const preset = LAB_PRESETS_BY_ID[id]
    if (!preset) return
    dispatch({ type: 'LOAD_CONFIG', payload: preset.config })
  }

  return (
    <div className="app-layout">
      <div className="sidebar sidebar--open">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="sidebar-header">
          {/* Mode toggle (return to Main) */}
          <ModeToggleButton mode={mode} onToggleMode={onToggleMode} />

          {/* Theme toggle */}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          <h1 style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            marginTop: 4,
            marginBottom: 5,
          }}>
            Tessellation Lab
          </h1>

          <p style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 12.5,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            marginBottom: 12,
          }}>
            Prototype workspace
          </p>
        </div>

        {/* ── Sections ────────────────────────────────────── */}
        <div className="sidebar-sections">
          <div style={{ paddingTop: 20 }}>
            <SectionTitle>Presets</SectionTitle>
            <FieldLabel label="Preset" />
            <select
              className="pattern-select"
              value={pendingPresetId}
              onChange={e => setPendingPresetId(e.target.value)}
            >
              <option value="">— select a preset —</option>
              {LAB_PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <button
              disabled={!pendingPresetId}
              onClick={() => loadPreset(pendingPresetId)}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '7px 10px',
                background: pendingPresetId ? 'var(--accent-bg)' : 'transparent',
                color: pendingPresetId ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${pendingPresetId ? 'var(--accent)' : 'var(--border-subtle)'}`,
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: pendingPresetId ? 'pointer' : 'not-allowed',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              Load preset
            </button>
          </div>

          <div style={{ paddingTop: 22 }}>
            <SectionTitle>Tessellation</SectionTitle>
            <FieldLabel label="Type" />
            <select
              className="pattern-select"
              value={config.tiling.type}
              onChange={e => dispatch({ type: 'SET_TILING_TYPE', payload: e.target.value })}
            >
              <option value="">— select a tessellation —</option>
              {SYMMETRY_GROUPS.map(group => (
                <optgroup key={group.fold} label={`${group.label} Symmetry`}>
                  {group.tilings.map(name => (
                    <option key={name} value={name}>{TILINGS[name].label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {def && (
              <>
                <FieldLabel label="Scale" value={String(config.tiling.scale)} unit=" px" />
                <input
                  type="range"
                  className="pattern-slider"
                  min={30}
                  max={300}
                  step={5}
                  value={config.tiling.scale}
                  onChange={e => dispatch({ type: 'SET_SCALE', payload: Number(e.target.value) })}
                />

                <button
                  onClick={resetTessellationDefaults}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    padding: '7px 10px',
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: '1px solid var(--border-accent)',
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-accent)' }}
                >
                  Reset to default angle
                </button>

                <div style={{
                  marginTop: 18,
                  padding: '10px 12px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface, transparent)',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em',
                  lineHeight: 1.55,
                }}>
                  <div style={{
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: 9,
                    fontWeight: 600,
                    color: 'var(--accent)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}>
                    Info
                  </div>
                  <div><strong>Vertex&nbsp;config:</strong> {def.vertexConfig.join('.')}</div>
                  <div><strong>Fold:</strong> {def.foldSymmetry}</div>
                  <div><strong>Category:</strong> {def.category}</div>
                </div>
              </>
            )}
          </div>

          {/* Display — strand overlay toggle */}
          <div style={{ paddingTop: 22 }}>
            <SectionTitle>Display</SectionTitle>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 13.5,
              color: showStrands ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}>
              <input
                type="checkbox"
                className="pattern-checkbox"
                checked={showStrands}
                onChange={e => setShowStrands(e.target.checked)}
              />
              Show strands
            </label>
          </div>
        </div>
      </div>

      <div className="sandstone-edge-wrapper" aria-hidden="true">
        <SandstoneEdge />
      </div>
      <Canvas
        config={config}
        showTileLayer={true}
        showLines={showStrands}
        svgRef={svgRef}
        segmentsRef={segmentsRef}
        cpVisible={cpVisible}
        cpActive={cpActive}
      />
    </div>
  )
}

/* ── Local helpers ────────────────────────────────────── */

function ModeToggleButton({ mode, onToggleMode }: { mode: 'main' | 'lab'; onToggleMode: () => void }) {
  const inMain = mode === 'main'
  return (
    <button
      onClick={onToggleMode}
      aria-label={inMain ? 'Open Tessellation Lab' : 'Return to Main mode'}
      title={inMain ? 'Open Tessellation Lab' : 'Return to Main mode'}
      style={{
        position: 'absolute',
        top: 14,
        left: 12,
        height: 26,
        background: inMain ? 'transparent' : 'var(--accent-bg)',
        color: 'var(--accent)',
        border: `1px solid ${inMain ? 'var(--border-accent)' : 'var(--accent)'}`,
        padding: '0 10px',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        zIndex: 5,
      }}
    >
      {inMain ? 'Lab' : '← Main'}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 14,
    }}>
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--accent)',
        letterSpacing: '0.20em',
        textTransform: 'uppercase' as const,
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--divider), transparent)' }} />
    </div>
  )
}

function FieldLabel({ label, value, unit }: { label: string; value?: string; unit?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 7,
      marginTop: 12,
    }}>
      <span style={{
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 13.5,
        color: 'var(--text-secondary)',
        letterSpacing: '0.02em',
      }}>
        {label}
      </span>
      {value !== undefined && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'var(--accent)',
          letterSpacing: '0.04em',
        }}>
          {value}{unit}
        </span>
      )}
    </div>
  )
}

export { ModeToggleButton }
