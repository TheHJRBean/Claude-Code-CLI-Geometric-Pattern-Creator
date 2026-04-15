import { useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS, SYMMETRY_GROUPS } from '../tilings/index'
import type { TileTypeInfo } from '../types/tiling'
import { computeSnapPoints, snapToNearest } from '../pic/snapPoints'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  config: PatternConfig
  dispatch: React.Dispatch<Action>
  showTileLayer: boolean
  onToggleTileLayer: () => void
  onExportSVG: () => void
  onExportPNG: () => void
  onExportUnwovenSVG: () => void
  onSaveJSON: () => void
  onLoadJSON: () => void
  open: boolean
  onClose: () => void
}

/* ── Decorative SVG components ─────────────────────────────── */

function starPoints(cx: number, cy: number, r1: number, r2: number): string {
  return Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI / 8) - Math.PI / 2
    const r = i % 2 === 0 ? r1 : r2
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
  }).join(' ')
}

function OctaStar({ size = 20, color = 'var(--accent)', opacity = 1 }: { size?: number; color?: string; opacity?: number }) {
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <polygon points={starPoints(c, c, c * 0.9, c * 0.42)} fill={color} opacity={opacity} />
    </svg>
  )
}

/** Lotus-bud divider — three geometric petals flanked by gradient lines */
function LotusDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 20, marginBottom: 6 }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, var(--divider))' }} />
      <svg viewBox="0 0 28 10" width="28" height="10" style={{ flexShrink: 0, display: 'block' }}>
        {/* Center petal */}
        <path d="M14 0 L16 7 L14 10 L12 7Z" fill="var(--accent)" opacity="0.5" />
        {/* Left petal */}
        <path d="M8 3 L10 7 L8 9 L6 7Z" fill="var(--accent)" opacity="0.25" />
        {/* Right petal */}
        <path d="M20 3 L18 7 L20 9 L22 7Z" fill="var(--accent)" opacity="0.25" />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, var(--divider))' }} />
    </div>
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
      <OctaStar size={10} opacity={0.7} />
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer',
      fontFamily: "'EB Garamond', Georgia, serif",
      fontSize: 13.5,
      color: checked ? 'var(--text)' : 'var(--text-muted)',
      transition: 'color 0.15s',
    }}>
      <input
        type="checkbox"
        className="pattern-checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

function ExportBtn({ children, onClick, wide = false, secondary = false }: {
  children: React.ReactNode
  onClick: () => void
  wide?: boolean
  secondary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: secondary
          ? 'transparent'
          : 'linear-gradient(180deg, var(--btn-primary-from) 0%, var(--btn-primary-to) 100%)',
        color: secondary ? 'var(--accent)' : 'var(--btn-primary-text)',
        border: `1px solid ${secondary ? 'var(--border-accent)' : 'var(--btn-primary-border)'}`,
        padding: '8px 10px',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        cursor: 'pointer',
        gridColumn: wide ? 'span 2' : undefined,
        transition: 'border-color 0.15s, opacity 0.15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        if (secondary) el.style.borderColor = 'var(--accent-border)'
        else el.style.opacity = '0.85'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        if (secondary) el.style.borderColor = 'var(--border-accent)'
        else el.style.opacity = '1'
      }}
    >
      {children}
    </button>
  )
}

/* ── Theme toggle icons ──────────────────────────────────── */

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

/* ── Figure controls ─────────────────────────────────────── */

function FigureControls({
  tileTypeId, sides, displayLabel, figType, angle, lineLength, autoLen, snapEnabled, rosetteQ,
  edgeEnabled, vertexEnabled, vertexDecoupled, vertexAngle, vertexLineLength, vertexAutoLen,
  curveEnabled, curvePoints, curveAlternating, curveDirection,
  tilingType, allFigures, dispatch,
}: {
  tileTypeId: string
  sides: number
  displayLabel: string
  figType: 'star' | 'rosette' | 'infer'
  angle: number
  lineLength: number
  autoLen: boolean
  snapEnabled: boolean
  rosetteQ: number
  edgeEnabled: boolean
  vertexEnabled: boolean
  vertexDecoupled: boolean
  vertexAngle: number
  vertexLineLength: number
  vertexAutoLen: boolean
  curveEnabled: boolean
  curvePoints: { position: number; offset: number }[]
  curveAlternating: boolean
  curveDirection: 'left' | 'right'
  tilingType: string
  allFigures: Record<string, { contactAngle: number }>
  dispatch: React.Dispatch<Action>
}) {
  const anglesKey = Object.entries(allFigures)
    .map(([s, f]) => `${s}:${f.contactAngle}`)
    .join(',')
  const snapPoints = useMemo(
    () => computeSnapPoints(tilingType, sides, allFigures),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tilingType, sides, anglesKey],
  )
  const snappedTo = snapEnabled ? snapPoints.find(s => Math.abs(lineLength - s) < 0.005) : undefined

  const handleLineLengthChange = (rawPercent: number) => {
    let ll = rawPercent / 100
    if (snapEnabled) {
      ll = snapToNearest(ll, snapPoints)
    }
    dispatch({ type: 'SET_LINE_LENGTH', payload: { tileTypeId, lineLength: ll } })
  }

  const sliderMin = 10, sliderMax = 500
  const toTrackPct = (val: number) =>
    Math.max(0, Math.min(100, ((val * 100 - sliderMin) / (sliderMax - sliderMin)) * 100))

  return (
    <div style={{ marginBottom: 16 }}>
      <FieldLabel label={`${displayLabel} · figure`} />
      <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
        {(['star', 'rosette'] as const).map(ft => (
          <button
            key={ft}
            onClick={() => dispatch({ type: 'SET_FIGURE_TYPE', payload: { tileTypeId, figureType: ft } })}
            style={{
              flex: 1,
              padding: '6px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              border: `1px solid ${figType === ft ? 'var(--accent)' : 'var(--border)'}`,
              background: figType === ft ? 'var(--accent-bg)' : 'transparent',
              color: figType === ft ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {ft}
          </button>
        ))}
      </div>

      <FieldLabel label="Contact angle" value={angle.toFixed(1)} unit="°" />
      <input
        type="range"
        className="pattern-slider"
        min={10} max={85} step={0.5}
        value={angle}
        onChange={e => dispatch({ type: 'SET_CONTACT_ANGLE', payload: { tileTypeId, angle: Number(e.target.value) } })}
      />

      {figType === 'rosette' && (
        <>
          <FieldLabel label="Petal shape (q)" value={rosetteQ.toFixed(2)} />
          <input
            type="range"
            className="pattern-slider"
            min={0} max={100} step={1}
            value={rosetteQ * 100}
            onChange={e => dispatch({ type: 'SET_ROSETTE_Q', payload: { tileTypeId, q: Number(e.target.value) / 100 } })}
          />
        </>
      )}

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <Toggle
          checked={autoLen}
          onChange={v => dispatch({ type: 'SET_AUTO_LINE_LENGTH', payload: { tileTypeId, auto: v } })}
          label="Auto line length"
        />
      </div>
      {!autoLen && (
        <>
          <FieldLabel
            label="Line length"
            value={(lineLength * 100).toFixed(0)}
            unit={snappedTo !== undefined ? '% (snapped)' : '%'}
          />
          <div style={{ position: 'relative', paddingTop: snapEnabled ? 8 : 0 }}>
            {snapEnabled && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%', pointerEvents: 'none' }}>
                {snapPoints.map(snap => {
                  const pct = toTrackPct(snap)
                  const isActive = snappedTo !== undefined && Math.abs(snap - snappedTo) < 0.001
                  return (
                    <div
                      key={snap}
                      style={{
                        position: 'absolute',
                        left: `calc(${pct}% + ${(0.5 - pct / 100) * 13}px)`,
                        top: 0,
                        width: 1,
                        height: '100%',
                        background: isActive
                          ? 'var(--accent)'
                          : 'var(--snap-gradient)',
                        transition: 'background 0.15s',
                      }}
                      title={`${(snap * 100).toFixed(0)}%`}
                    />
                  )
                })}
              </div>
            )}
            <input
              type="range"
              className="pattern-slider"
              min={sliderMin} max={sliderMax} step={1}
              value={Math.round(lineLength * 100)}
              onChange={e => handleLineLengthChange(Number(e.target.value))}
            />
          </div>
          <div style={{ marginTop: 6, marginBottom: 4 }}>
            <Toggle
              checked={snapEnabled}
              onChange={v => dispatch({ type: 'SET_SNAP_LINE_LENGTH', payload: { tileTypeId, snap: v } })}
              label="Snap to neighbors"
            />
          </div>
        </>
      )}

      {/* Edge / Vertex Lines */}
      <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
        <Toggle
          checked={edgeEnabled}
          onChange={v => dispatch({ type: 'SET_EDGE_LINES_ENABLED', payload: { tileTypeId, enabled: v } })}
          label="Edge lines"
        />
        <Toggle
          checked={vertexEnabled}
          onChange={v => dispatch({ type: 'SET_VERTEX_LINES_ENABLED', payload: { tileTypeId, enabled: v } })}
          label="Vertex lines"
        />
      </div>

      {vertexEnabled && (
        <div style={{ marginTop: 8 }}>
          <Toggle
            checked={vertexDecoupled}
            onChange={v => dispatch({ type: 'SET_VERTEX_LINES_DECOUPLED', payload: { tileTypeId, decoupled: v } })}
            label="Decouple vertex params"
          />
          {vertexDecoupled && (
            <div style={{ marginTop: 8 }}>
              <FieldLabel label="Vertex angle" value={vertexAngle.toFixed(1)} unit="°" />
              <input
                type="range"
                className="pattern-slider"
                min={10} max={85} step={0.5}
                value={vertexAngle}
                onChange={e => dispatch({ type: 'SET_VERTEX_CONTACT_ANGLE', payload: { tileTypeId, angle: Number(e.target.value) } })}
              />

              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <Toggle
                  checked={vertexAutoLen}
                  onChange={v => dispatch({ type: 'SET_VERTEX_AUTO_LINE_LENGTH', payload: { tileTypeId, auto: v } })}
                  label="Auto vertex length"
                />
              </div>
              {!vertexAutoLen && (
                <>
                  <FieldLabel label="Vertex length" value={(vertexLineLength * 100).toFixed(0)} unit="%" />
                  <input
                    type="range"
                    className="pattern-slider"
                    min={10} max={500} step={1}
                    value={Math.round(vertexLineLength * 100)}
                    onChange={e => dispatch({ type: 'SET_VERTEX_LINE_LENGTH', payload: { tileTypeId, lineLength: Number(e.target.value) / 100 } })}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Curve */}
      <div style={{ marginTop: 12 }}>
        <Toggle
          checked={curveEnabled}
          onChange={v => dispatch({ type: 'SET_CURVE_ENABLED', payload: { tileTypeId, enabled: v } })}
          label="Curve lines"
        />
      </div>

      {curveEnabled && (
        <div style={{ marginTop: 8 }}>
          {/* Same / Alternating mode selector */}
          <FieldLabel label="Curve mode" />
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {(['same', 'alternating'] as const).map(mode => {
              const isActive = mode === 'alternating' ? curveAlternating : !curveAlternating
              return (
                <button
                  key={mode}
                  onClick={() => dispatch({ type: 'SET_CURVE_ALTERNATING', payload: { tileTypeId, alternating: mode === 'alternating' } })}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase' as const,
                    cursor: 'pointer',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    background: isActive ? 'var(--accent-bg)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {mode}
                </button>
              )
            })}
          </div>

          {/* Direction selector: L / R — only relevant when alternating */}
          {curveAlternating && (
            <>
              <FieldLabel label="Direction" />
              <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
                {(['left', 'right'] as const).map(dir => {
                  const isActive = curveDirection === dir
                  return (
                    <button
                      key={dir}
                      onClick={() => dispatch({ type: 'SET_CURVE_DIRECTION', payload: { tileTypeId, direction: dir } })}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontFamily: "'Cinzel', Georgia, serif",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const,
                        cursor: 'pointer',
                        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        background: isActive ? 'var(--accent-bg)' : 'transparent',
                        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {dir === 'left' ? 'L' : 'R'}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <FieldLabel label="Control points" value={String(curvePoints.length)} />
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => dispatch({ type: 'SET_CURVE_POINT_COUNT', payload: { tileTypeId, count: n } })}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  border: `1px solid ${curvePoints.length === n ? 'var(--accent)' : 'var(--border)'}`,
                  background: curvePoints.length === n ? 'var(--accent-bg)' : 'transparent',
                  color: curvePoints.length === n ? 'var(--accent)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {curvePoints.map((cp, i) => (
            <div key={i} style={{ marginBottom: i < curvePoints.length - 1 ? 10 : 0 }}>
              {curvePoints.length > 1 && (
                <span style={{
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em',
                }}>
                  Point {i + 1}
                </span>
              )}
              <FieldLabel label="Position" value={(cp.position * 100).toFixed(0)} unit="%" />
              <input
                type="range"
                className="pattern-slider"
                min={5} max={95} step={1}
                value={Math.round(cp.position * 100)}
                onChange={e => dispatch({
                  type: 'SET_CURVE_POINT',
                  payload: { tileTypeId, index: i, point: { position: Number(e.target.value) / 100 } },
                })}
              />
              <FieldLabel label="Offset" value={(cp.offset * 100).toFixed(0)} unit="%" />
              <input
                type="range"
                className="pattern-slider"
                min={-100} max={100} step={1}
                value={Math.round(cp.offset * 100)}
                onChange={e => dispatch({
                  type: 'SET_CURVE_POINT',
                  payload: { tileTypeId, index: i, point: { offset: Number(e.target.value) / 100 } },
                })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main Sidebar ────────────────────────────────────────── */

export function Sidebar({
  config, dispatch, showTileLayer, onToggleTileLayer,
  onExportSVG, onExportPNG, onExportUnwovenSVG, onSaveJSON, onLoadJSON,
  open, onClose,
}: Props) {
  const { theme, toggleTheme } = useTheme()
  const def = TILINGS[config.tiling.type]
  // Derive tile types: use explicit tileTypes if defined, else one per unique side count
  const tileTypes: TileTypeInfo[] = def
    ? (def.tileTypes ?? [...new Set(def.vertexConfig)].sort((a, b) => a - b).map(s => ({
        id: String(s), sides: s, label: `${s}-gon`,
      })))
    : []

  return (
    <div className={`sidebar ${open ? 'sidebar--open' : ''}`}>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="sidebar-header">
        {/* Mobile close button */}
        <button
          className="sidebar-close"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Theme toggle */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Corner ornaments */}
        <div style={{ position: 'absolute', top: 10, left: 12, opacity: 0.25 }}>
          <OctaStar size={9} />
        </div>

        {/* Art Deco fan motif */}
        <div style={{ marginBottom: 10, marginTop: 2 }}>
          <svg viewBox="0 0 100 20" style={{ width: 100, height: 'auto', display: 'block', margin: '0 auto' }}>
            {Array.from({ length: 9 }, (_, i) => {
              const mid = 4
              const spread = 80
              const frac = i / 8
              const angleDeg = -90 - spread / 2 + frac * spread
              const rad = angleDeg * Math.PI / 180
              const len = 16 - Math.abs(i - mid) * 1.2
              const x = 50 + Math.cos(rad) * len
              const y = 18 + Math.sin(rad) * len
              return (
                <line key={i} x1="50" y1="18" x2={x} y2={y}
                  stroke="var(--accent)" strokeWidth="0.8" strokeLinecap="round"
                  opacity={0.5 - Math.abs(i - mid) * 0.07}
                />
              )
            })}
            <circle cx="50" cy="2.5" r="2" fill="var(--accent)" opacity="0.35" />
          </svg>
        </div>

        <h1 style={{
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--text)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          marginBottom: 5,
        }}>
          Geometric Atlas
        </h1>

        <p style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 12.5,
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          marginBottom: 12,
        }}>
          Islamic Patterns · PIC Method
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <div style={{ width: 20, height: 1, background: 'var(--border-accent)' }} />
          <div style={{ width: 4, height: 4, background: 'var(--accent)', transform: 'rotate(45deg)', opacity: 0.5 }} />
          <div style={{ width: 40, height: 1, background: 'var(--border-accent)' }} />
          <div style={{ width: 4, height: 4, background: 'var(--accent)', transform: 'rotate(45deg)', opacity: 0.5 }} />
          <div style={{ width: 20, height: 1, background: 'var(--border-accent)' }} />
        </div>
      </div>

      {/* ── Sections ────────────────────────────────────── */}
      <div className="sidebar-sections">

        {/* Tiling */}
        <div style={{ paddingTop: 20, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
          <SectionTitle>Tiling</SectionTitle>

          <FieldLabel label="Type" />
          <select
            value={config.tiling.type}
            onChange={e => dispatch({ type: 'SET_TILING_TYPE', payload: e.target.value })}
            className="pattern-select"
          >
            {SYMMETRY_GROUPS.map(group => (
              <optgroup key={group.fold} label={`${group.label} Symmetry`}>
                {group.tilings.map(name => (
                  <option key={name} value={name}>{TILINGS[name].label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <FieldLabel label="Scale" value={String(config.tiling.scale)} unit=" px" />
          <input
            type="range"
            className="pattern-slider"
            min={30} max={300} step={5}
            value={config.tiling.scale}
            onChange={e => dispatch({ type: 'SET_SCALE', payload: Number(e.target.value) })}
          />
          <div style={{ marginBottom: 4 }} />
        </div>

        {/* Figures */}
        <div style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
          <LotusDivider />
          <SectionTitle>Figures</SectionTitle>

          {tileTypes.map(tt => {
            const fig = config.figures[tt.id]
            const figType = fig?.type ?? 'star'
            const angle = fig?.contactAngle ?? 60
            const lineLength = fig?.lineLength ?? 1.0
            const autoLen = fig?.autoLineLength ?? true
            const snapEnabled = fig?.snapLineLength ?? false
            const rosetteQ = fig?.rosetteQ ?? 0.5
            const edgeEnabled = fig?.edgeLinesEnabled !== false
            const vertexEnabled = fig?.vertexLinesEnabled ?? false
            const vertexDecoupled = fig?.vertexLinesDecoupled ?? false
            const vertexAngle = fig?.vertexContactAngle ?? angle
            const vertexLineLength = fig?.vertexLineLength ?? lineLength
            const vertexAutoLen = fig?.vertexAutoLineLength ?? autoLen
            const curveEnabled = fig?.curve?.enabled ?? false
            const curvePoints = fig?.curve?.points ?? [{ position: 0.5, offset: 0.2 }]
            const curveAlternating = fig?.curve?.alternating ?? false
            const curveDirection = fig?.curve?.direction ?? 'left'
            return (
              <FigureControls
                key={tt.id}
                tileTypeId={tt.id}
                sides={tt.sides}
                displayLabel={tt.label}
                figType={figType}
                angle={angle}
                lineLength={lineLength}
                autoLen={autoLen}
                snapEnabled={snapEnabled}
                rosetteQ={rosetteQ}
                edgeEnabled={edgeEnabled}
                vertexEnabled={vertexEnabled}
                vertexDecoupled={vertexDecoupled}
                vertexAngle={vertexAngle}
                vertexLineLength={vertexLineLength}
                vertexAutoLen={vertexAutoLen}
                curveEnabled={curveEnabled}
                curvePoints={curvePoints}
                curveAlternating={curveAlternating}
                curveDirection={curveDirection}
                tilingType={config.tiling.type}
                allFigures={config.figures}
                dispatch={dispatch}
              />
            )
          })}
          <div style={{ marginBottom: 4 }} />
        </div>

        {/* Line thickness — always visible since strands render regardless of lacing */}
        <div style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
          <LotusDivider />
          <SectionTitle>Line Thickness</SectionTitle>

          <FieldLabel label="Stroke width" value={config.lacing.strandWidth.toFixed(1)} unit=" px" />
          <input
            type="range"
            className="pattern-slider"
            min={1} max={20} step={0.5}
            value={config.lacing.strandWidth}
            onChange={e => dispatch({ type: 'SET_LACING', payload: { strandWidth: Number(e.target.value) } })}
          />
          <div style={{ marginBottom: 4 }} />
        </div>

        {/* Lacing */}
        <div style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
          <LotusDivider />
          <SectionTitle>Lacing</SectionTitle>

          <Toggle
            checked={config.lacing.enabled}
            onChange={v => dispatch({ type: 'SET_LACING', payload: { enabled: v } })}
            label="Enable strand weaving"
          />

          {config.lacing.enabled && (
            <div style={{ marginTop: 4 }}>
              <FieldLabel label="Gap width" value={config.lacing.gapWidth.toFixed(1)} unit=" px" />
              <input
                type="range"
                className="pattern-slider"
                min={1} max={12} step={0.5}
                value={config.lacing.gapWidth}
                onChange={e => dispatch({ type: 'SET_LACING', payload: { gapWidth: Number(e.target.value) } })}
              />
            </div>
          )}
          <div style={{ marginBottom: 4 }} />
        </div>

        {/* Display */}
        <div style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
          <LotusDivider />
          <SectionTitle>Display</SectionTitle>

          <Toggle
            checked={showTileLayer}
            onChange={() => onToggleTileLayer()}
            label="Show tile grid"
          />
          <div style={{ marginBottom: 4 }} />
        </div>

        {/* Export */}
        <div style={{ paddingTop: 4, paddingBottom: 28 }}>
          <LotusDivider />
          <SectionTitle>Export</SectionTitle>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ExportBtn onClick={onExportSVG}>SVG</ExportBtn>
            <ExportBtn onClick={onExportPNG}>PNG</ExportBtn>
            <ExportBtn onClick={onExportUnwovenSVG}>Unwoven SVG</ExportBtn>
            <ExportBtn onClick={onSaveJSON} secondary>Save JSON</ExportBtn>
            <ExportBtn onClick={onLoadJSON} secondary>Load JSON</ExportBtn>
          </div>
        </div>

      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border-subtle)',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
        <OctaStar size={8} color="var(--border-accent)" opacity={1} />
        <span style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 10,
          color: 'var(--border-accent)',
          letterSpacing: '0.08em',
        }}>
          Kaplan 2005
        </span>
        <OctaStar size={8} color="var(--border-accent)" opacity={1} />
      </div>
    </div>
  )
}
