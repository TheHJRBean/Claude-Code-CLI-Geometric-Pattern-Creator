import { useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS, TILING_NAMES } from '../tilings/index'
import { computeSnapPoints, snapToNearest } from '../pic/snapPoints'

interface Props {
  config: PatternConfig
  dispatch: React.Dispatch<Action>
  showTileLayer: boolean
  onToggleTileLayer: () => void
  onExportSVG: () => void
  onExportPNG: () => void
  onSaveJSON: () => void
  onLoadJSON: () => void
}

const W = 300

// Generates points for an 8-pointed star polygon
function starPoints(cx: number, cy: number, r1: number, r2: number): string {
  return Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI / 8) - Math.PI / 2
    const r = i % 2 === 0 ? r1 : r2
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
  }).join(' ')
}

function OctaStar({ size = 20, color = '#c9943a', opacity = 1 }: { size?: number; color?: string; opacity?: number }) {
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <polygon points={starPoints(c, c, c * 0.9, c * 0.42)} fill={color} opacity={opacity} />
    </svg>
  )
}

function DiamondDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 4 }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #2c2418)' }} />
      <div style={{ width: 5, height: 5, background: '#c9943a', transform: 'rotate(45deg)', opacity: 0.5 }} />
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #2c2418)' }} />
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
      <OctaStar size={10} color="#c9943a" opacity={0.7} />
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        color: '#c9943a',
        letterSpacing: '0.20em',
        textTransform: 'uppercase' as const,
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #2c2418, transparent)' }} />
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
        fontSize: 13,
        color: '#a09880',
        letterSpacing: '0.02em',
      }}>
        {label}
      </span>
      {value !== undefined && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: '#c9943a',
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
      fontSize: 13,
      color: checked ? '#ede8dc' : '#7a7060',
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
        background: secondary ? 'transparent' : 'linear-gradient(180deg, #c9943a 0%, #a87830 100%)',
        color: secondary ? '#c9943a' : '#07070f',
        border: `1px solid ${secondary ? '#2c2418' : '#c9943a'}`,
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
        if (secondary) el.style.borderColor = '#c9943a66'
        else el.style.opacity = '0.85'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        if (secondary) el.style.borderColor = '#2c2418'
        else el.style.opacity = '1'
      }}
    >
      {children}
    </button>
  )
}

function FigureControls({
  sides, figType, angle, lineLength, autoLen, snapEnabled, rosetteQ,
  tilingType, allFigures, dispatch,
}: {
  sides: number
  figType: 'star' | 'rosette' | 'infer'
  angle: number
  lineLength: number
  autoLen: boolean
  snapEnabled: boolean
  rosetteQ: number
  tilingType: string
  allFigures: Record<number, { contactAngle: number }>
  dispatch: React.Dispatch<Action>
}) {
  // Stable key from all contact angles so useMemo only recomputes when angles change
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
    dispatch({ type: 'SET_LINE_LENGTH', payload: { sides, lineLength: ll } })
  }

  const sliderMin = 10, sliderMax = 500
  const toTrackPct = (val: number) =>
    Math.max(0, Math.min(100, ((val * 100 - sliderMin) / (sliderMax - sliderMin)) * 100))

  return (
    <div style={{ marginBottom: 16 }}>
      <FieldLabel label={`${sides}-gon · figure`} />
      <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
        {(['star', 'rosette'] as const).map(ft => (
          <button
            key={ft}
            onClick={() => dispatch({ type: 'SET_FIGURE_TYPE', payload: { sides, figureType: ft } })}
            style={{
              flex: 1,
              padding: '5px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              border: `1px solid ${figType === ft ? '#c9943a' : '#1a1a2e'}`,
              background: figType === ft ? 'rgba(201,148,58,0.15)' : 'transparent',
              color: figType === ft ? '#c9943a' : '#5a5440',
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
        onChange={e => dispatch({ type: 'SET_CONTACT_ANGLE', payload: { sides, angle: Number(e.target.value) } })}
      />

      {figType === 'rosette' && (
        <>
          <FieldLabel label="Petal shape (q)" value={rosetteQ.toFixed(2)} />
          <input
            type="range"
            className="pattern-slider"
            min={0} max={100} step={1}
            value={rosetteQ * 100}
            onChange={e => dispatch({ type: 'SET_ROSETTE_Q', payload: { sides, q: Number(e.target.value) / 100 } })}
          />
        </>
      )}

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <Toggle
          checked={autoLen}
          onChange={v => dispatch({ type: 'SET_AUTO_LINE_LENGTH', payload: { sides, auto: v } })}
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
                          ? '#c9943a'
                          : 'linear-gradient(180deg, #c9943a88, #c9943a33)',
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
              onChange={v => dispatch({ type: 'SET_SNAP_LINE_LENGTH', payload: { sides, snap: v } })}
              label="Snap to neighbors"
            />
          </div>
        </>
      )}
    </div>
  )
}

export function Sidebar({
  config, dispatch, showTileLayer, onToggleTileLayer,
  onExportSVG, onExportPNG, onSaveJSON, onLoadJSON,
}: Props) {
  const def = TILINGS[config.tiling.type]
  const polygonTypes = def ? [...new Set(def.vertexConfig)].sort((a, b) => a - b) : []

  return (
    <div
      className="sidebar"
      style={{
        width: W,
        height: '100%',
        background: '#07070f',
        color: '#ede8dc',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
        borderRight: '1px solid #14141f',
      }}
    >
      {/* ── Header ──────────────────────────────────────── */}
      <div style={{
        padding: '28px 22px 22px',
        borderBottom: '1px solid #14141f',
        background: 'linear-gradient(180deg, #0d0d1e 0%, #07070f 100%)',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Corner ornaments */}
        <div style={{ position: 'absolute', top: 10, left: 12, opacity: 0.25 }}>
          <OctaStar size={9} color="#c9943a" />
        </div>
        <div style={{ position: 'absolute', top: 10, right: 12, opacity: 0.25 }}>
          <OctaStar size={9} color="#c9943a" />
        </div>

        {/* Rule + star + rule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, justifyContent: 'center' }}>
          <div style={{ width: 42, height: 1, background: 'linear-gradient(90deg, transparent, #c9943a66)' }} />
          <OctaStar size={22} color="#c9943a" />
          <div style={{ width: 42, height: 1, background: 'linear-gradient(270deg, transparent, #c9943a66)' }} />
        </div>

        <h1 style={{
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 15,
          fontWeight: 700,
          color: '#ede8dc',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          marginBottom: 5,
        }}>
          Geometric Atlas
        </h1>

        <p style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 12,
          color: '#5a5440',
          letterSpacing: '0.06em',
          marginBottom: 14,
        }}>
          Islamic Patterns · PIC Method
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <div style={{ width: 20, height: 1, background: '#2c2418' }} />
          <div style={{ width: 4, height: 4, background: '#c9943a', transform: 'rotate(45deg)', opacity: 0.5 }} />
          <div style={{ width: 40, height: 1, background: '#2c2418' }} />
          <div style={{ width: 4, height: 4, background: '#c9943a', transform: 'rotate(45deg)', opacity: 0.5 }} />
          <div style={{ width: 20, height: 1, background: '#2c2418' }} />
        </div>
      </div>

      {/* ── Sections ────────────────────────────────────── */}
      <div style={{ padding: '0 20px', flex: 1 }}>

        {/* Tiling */}
        <div style={{ paddingTop: 20, paddingBottom: 4, borderBottom: '1px solid #14141f' }}>
          <SectionTitle>Tiling</SectionTitle>

          <FieldLabel label="Type" />
          <select
            value={config.tiling.type}
            onChange={e => dispatch({ type: 'SET_TILING_TYPE', payload: e.target.value })}
            className="pattern-select"
          >
            {TILING_NAMES.map(name => (
              <option key={name} value={name}>{TILINGS[name].label}</option>
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
        <div style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid #14141f' }}>
          <DiamondDivider />
          <SectionTitle>Figures</SectionTitle>

          {polygonTypes.map(sides => {
            const fig = config.figures[sides]
            const figType = fig?.type ?? 'star'
            const angle = fig?.contactAngle ?? 60
            const lineLength = fig?.lineLength ?? 1.0
            const autoLen = fig?.autoLineLength ?? true
            const snapEnabled = fig?.snapLineLength ?? false
            const rosetteQ = fig?.rosetteQ ?? 0.5
            return (
              <FigureControls
                key={sides}
                sides={sides}
                figType={figType}
                angle={angle}
                lineLength={lineLength}
                autoLen={autoLen}
                snapEnabled={snapEnabled}
                rosetteQ={rosetteQ}
                tilingType={config.tiling.type}
                allFigures={config.figures}
                dispatch={dispatch}
              />
            )
          })}
          <div style={{ marginBottom: 4 }} />
        </div>

        {/* Lacing */}
        <div style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid #14141f' }}>
          <DiamondDivider />
          <SectionTitle>Lacing</SectionTitle>

          <Toggle
            checked={config.lacing.enabled}
            onChange={v => dispatch({ type: 'SET_LACING', payload: { enabled: v } })}
            label="Enable strand weaving"
          />

          {config.lacing.enabled && (
            <div style={{ marginTop: 4 }}>
              <FieldLabel label="Strand width" value={config.lacing.strandWidth.toFixed(1)} unit=" px" />
              <input
                type="range"
                className="pattern-slider"
                min={1} max={20} step={0.5}
                value={config.lacing.strandWidth}
                onChange={e => dispatch({ type: 'SET_LACING', payload: { strandWidth: Number(e.target.value) } })}
              />
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
        <div style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid #14141f' }}>
          <DiamondDivider />
          <SectionTitle>Display</SectionTitle>

          <Toggle
            checked={showTileLayer}
            onChange={onToggleTileLayer}
            label="Show tile grid"
          />
          <div style={{ marginBottom: 4 }} />
        </div>

        {/* Export */}
        <div style={{ paddingTop: 4, paddingBottom: 28 }}>
          <DiamondDivider />
          <SectionTitle>Export</SectionTitle>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ExportBtn onClick={onExportSVG}>SVG</ExportBtn>
            <ExportBtn onClick={onExportPNG}>PNG</ExportBtn>
            <ExportBtn onClick={onSaveJSON} secondary>Save JSON</ExportBtn>
            <ExportBtn onClick={onLoadJSON} secondary>Load JSON</ExportBtn>
          </div>
        </div>

      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid #14141f',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
        <OctaStar size={8} color="#2c2418" opacity={1} />
        <span style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 10,
          color: '#2c2418',
          letterSpacing: '0.08em',
        }}>
          Kaplan 2005
        </span>
        <OctaStar size={8} color="#2c2418" opacity={1} />
      </div>
    </div>
  )
}
