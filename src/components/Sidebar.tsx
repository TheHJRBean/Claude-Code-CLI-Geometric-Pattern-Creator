import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS, TILING_NAMES } from '../tilings/index'

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

const W = 320

// ── Decorative SVG components ─────────────────────────────────────────────────

/** Art Deco sun disk radiating from the top of the header */
function SunDisk() {
  const cx = W / 2
  const numRays = 21
  const innerR = 14
  const outerR = 76

  const rays = Array.from({ length: numRays }, (_, i) => {
    const angle = (i / (numRays - 1)) * Math.PI
    const x1 = cx + innerR * Math.cos(angle)
    const y1 = innerR * Math.sin(angle)
    const x2 = cx + outerR * Math.cos(angle)
    const y2 = outerR * Math.sin(angle)
    const isMain = i % 4 === 0 || i === Math.floor(numRays / 2)
    return (
      <line
        key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#c8a84b"
        strokeWidth={isMain ? 1.5 : 0.5}
        opacity={isMain ? 0.6 : 0.18}
      />
    )
  })

  return (
    <svg width={W} height={78} viewBox={`0 0 ${W} 78`} style={{ display: 'block' }}>
      {rays}
      <path d={`M ${cx + 30} 0 A 30 30 0 0 1 ${cx - 30} 0`} fill="none" stroke="#c8a84b" strokeWidth="0.75" opacity="0.3" />
      <path d={`M ${cx + 52} 0 A 52 52 0 0 1 ${cx - 52} 0`} fill="none" stroke="#c8a84b" strokeWidth="0.5" opacity="0.2" />
      <path d={`M ${cx + 76} 0 A 76 76 0 0 1 ${cx - 76} 0`} fill="none" stroke="#c8a84b" strokeWidth="0.4" opacity="0.15" />
      {/* Central solar disk */}
      <circle cx={cx} cy={0} r={13} fill="none" stroke="#c8a84b" strokeWidth="1.5" opacity="0.55" />
      <circle cx={cx} cy={0} r={7}  fill="#c8a84b" opacity="0.45" />
      <circle cx={cx} cy={0} r={3}  fill="#f0d870" opacity="0.9" />
    </svg>
  )
}

/** Stepped pyramid border — 10 pyramid units across 320px */
function PyramidBorder() {
  const unit = 4
  const steps = 4
  const h = steps * unit  // 16px

  // Build one pyramid unit path (32px wide)
  function pyramidUnit(offsetX: number): string {
    let d = ''
    // Ascend
    for (let s = 0; s < steps; s++) {
      d += ` L ${offsetX + s * unit},${h - s * unit - unit}`
      d += ` L ${offsetX + s * unit + unit},${h - s * unit - unit}`
    }
    // Descend
    for (let s = steps - 1; s >= 0; s--) {
      d += ` L ${offsetX + (steps * 2 - s - 1) * unit},${h - s * unit - unit}`
      d += ` L ${offsetX + (steps * 2 - s) * unit},${h - s * unit - unit}`
    }
    return d
  }

  const totalUnits = 10
  const unitWidth = W / totalUnits  // 32px
  let d = `M 0,${h}`
  for (let i = 0; i < totalUnits; i++) {
    d += pyramidUnit(i * unitWidth)
  }
  d += ` L ${W},${h}`

  return (
    <svg width={W} height={h} viewBox={`0 0 ${W} ${h}`} style={{ display: 'block', flexShrink: 0 }}>
      <path d={d} fill="none" stroke="#c8a84b" strokeWidth="1" opacity="0.4" />
    </svg>
  )
}

/** Section divider with flanking speed-lines and gold label */
function SectionDivider({ title }: { title: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      margin: '22px 0 16px',
    }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #2e2410)' }} />
      <span style={{
        fontFamily: "'Josefin Sans', sans-serif",
        fontSize: 9,
        fontWeight: 300,
        color: '#c8a84b',
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        whiteSpace: 'nowrap',
      }}>
        <span style={{ opacity: 0.5, fontSize: 10 }}>≪</span>
        {title}
        <span style={{ opacity: 0.5, fontSize: 10 }}>≫</span>
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #2e2410)' }} />
    </div>
  )
}

/** Label + right-aligned value row, with children (slider/select) below */
function FieldRow({ label, value, unit, children }: {
  label: string
  value?: string
  unit?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 9,
      }}>
        <span style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 13,
          fontWeight: 300,
          color: '#7a6848',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
        {value !== undefined && (
          <span style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 11,
            color: '#c8a84b',
            letterSpacing: '0.06em',
          }}>
            {value}{unit}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: 'pointer',
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      fontStyle: 'italic',
      fontSize: 13,
      fontWeight: 300,
      color: checked ? '#c8a84b' : '#4a3e28',
      letterSpacing: '0.04em',
      transition: 'color 0.2s',
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

function ExportBtn({ children, onClick, secondary = false }: {
  children: React.ReactNode
  onClick: () => void
  secondary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={secondary ? 'export-btn-secondary' : 'export-btn-primary'}
      style={{
        background: secondary ? 'transparent' : 'linear-gradient(180deg, #d4b450 0%, #c8a84b 40%, #9a7c28 100%)',
        color: secondary ? '#5a4a28' : '#06050a',
        border: `1px solid ${secondary ? '#1e1808' : '#c8a84b'}`,
        padding: '9px 8px',
        fontFamily: "'Josefin Sans', sans-serif",
        fontSize: 9,
        fontWeight: 300,
        letterSpacing: '0.22em',
        textTransform: 'uppercase' as const,
        cursor: 'pointer',
        transition: 'filter 0.15s, border-color 0.15s, color 0.15s',
        display: 'block',
        width: '100%',
      }}
    >
      {children}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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
        background: '#06050a',
        backgroundImage: [
          'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\'%3E%3Crect x=\'8\' y=\'8\' width=\'4\' height=\'4\' fill=\'none\' stroke=\'%23c8a84b\' stroke-width=\'0.4\' opacity=\'.05\' transform=\'rotate(45 10 10)\'/%3E%3C/svg%3E")',
        ].join(','),
        color: '#d4b896',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
        borderRight: '1px solid #140f06',
      }}
    >
      {/* ── Stepped pyramid crown ── */}
      <PyramidBorder />

      {/* ── Header ── */}
      <div style={{
        padding: '0 24px 22px',
        borderBottom: '1px solid #140f06',
        textAlign: 'center',
        position: 'relative',
      }}>
        <SunDisk />

        {/* Cartouche / title frame */}
        <div style={{
          border: '1px solid #2a1e08',
          borderTop: 'none',
          padding: '14px 18px 16px',
          margin: '0 10px',
          position: 'relative',
        }}>
          {/* Gold corner brackets */}
          {([
            { top: -1, left: -1,  borderTop: '2px solid #c8a84b', borderLeft: '2px solid #c8a84b'  },
            { top: -1, right: -1, borderTop: '2px solid #c8a84b', borderRight: '2px solid #c8a84b' },
            { bottom: -1, left: -1,  borderBottom: '2px solid #c8a84b', borderLeft: '2px solid #c8a84b'  },
            { bottom: -1, right: -1, borderBottom: '2px solid #c8a84b', borderRight: '2px solid #c8a84b' },
          ] as React.CSSProperties[]).map((style, i) => (
            <div key={i} style={{ position: 'absolute', width: 8, height: 8, ...style }} />
          ))}

          <div style={{
            fontFamily: "'Poiret One', sans-serif",
            fontSize: 13,
            fontWeight: 400,
            color: '#8a7040',
            letterSpacing: '0.45em',
            textTransform: 'uppercase',
            lineHeight: 1,
            marginBottom: 4,
          }}>
            Geometric
          </div>
          <div style={{
            fontFamily: "'Poiret One', sans-serif",
            fontSize: 30,
            fontWeight: 400,
            color: '#c8a84b',
            letterSpacing: '0.5em',
            textTransform: 'uppercase',
            lineHeight: 1,
            marginBottom: 12,
            textShadow: '0 0 30px rgba(200,168,75,0.25)',
          }}>
            Atlas
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 10,
          }}>
            <div style={{ width: 20, height: 1, background: '#2a1e08' }} />
            <div style={{ width: 4, height: 4, background: '#c8a84b', transform: 'rotate(45deg)', opacity: 0.5 }} />
            <div style={{ width: 20, height: 1, background: '#2a1e08' }} />
          </div>

          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 11,
            fontWeight: 300,
            color: '#4a3e28',
            letterSpacing: '0.14em',
          }}>
            Islamic Patterns · PIC Method
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ padding: '0 22px', flex: 1 }}>

        {/* Tiling */}
        <SectionDivider title="Tiling" />
        <FieldRow label="Type">
          <select
            value={config.tiling.type}
            onChange={e => dispatch({ type: 'SET_TILING_TYPE', payload: e.target.value })}
            className="pattern-select"
          >
            {TILING_NAMES.map(name => (
              <option key={name} value={name}>{TILINGS[name].label}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Scale" value={String(config.tiling.scale)} unit=" px">
          <input
            type="range" className="pattern-slider"
            min={30} max={300} step={5}
            value={config.tiling.scale}
            onChange={e => dispatch({ type: 'SET_SCALE', payload: Number(e.target.value) })}
          />
        </FieldRow>

        {/* Contact Angles */}
        <SectionDivider title="Contact Angles" />
        {polygonTypes.map(sides => {
          const angle = config.figures[sides]?.contactAngle ?? 60
          return (
            <FieldRow key={sides} label={`${sides}-gon`} value={angle.toFixed(1)} unit="°">
              <input
                type="range" className="pattern-slider"
                min={10} max={85} step={0.5}
                value={angle}
                onChange={e => dispatch({ type: 'SET_CONTACT_ANGLE', payload: { sides, angle: Number(e.target.value) } })}
              />
            </FieldRow>
          )
        })}

        {/* Lacing */}
        <SectionDivider title="Lacing" />
        <div style={{ marginBottom: 16 }}>
          <Toggle
            checked={config.lacing.enabled}
            onChange={v => dispatch({ type: 'SET_LACING', payload: { enabled: v } })}
            label="Enable strand weaving"
          />
        </div>
        {config.lacing.enabled && (
          <>
            <FieldRow label="Strand width" value={config.lacing.strandWidth.toFixed(1)} unit=" px">
              <input
                type="range" className="pattern-slider"
                min={1} max={20} step={0.5}
                value={config.lacing.strandWidth}
                onChange={e => dispatch({ type: 'SET_LACING', payload: { strandWidth: Number(e.target.value) } })}
              />
            </FieldRow>
            <FieldRow label="Gap width" value={config.lacing.gapWidth.toFixed(1)} unit=" px">
              <input
                type="range" className="pattern-slider"
                min={1} max={12} step={0.5}
                value={config.lacing.gapWidth}
                onChange={e => dispatch({ type: 'SET_LACING', payload: { gapWidth: Number(e.target.value) } })}
              />
            </FieldRow>
          </>
        )}

        {/* Display */}
        <SectionDivider title="Display" />
        <div style={{ marginBottom: 16 }}>
          <Toggle
            checked={showTileLayer}
            onChange={onToggleTileLayer}
            label="Show tile grid"
          />
        </div>

        {/* Export */}
        <SectionDivider title="Export" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingBottom: 32 }}>
          <ExportBtn onClick={onExportSVG}>Export SVG</ExportBtn>
          <ExportBtn onClick={onExportPNG}>Export PNG</ExportBtn>
          <ExportBtn onClick={onSaveJSON} secondary>Save JSON</ExportBtn>
          <ExportBtn onClick={onLoadJSON} secondary>Load JSON</ExportBtn>
        </div>

      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '10px 22px',
        borderTop: '1px solid #140f06',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #1e1608)' }} />
        <span style={{
          fontFamily: "'Josefin Sans', sans-serif",
          fontSize: 8,
          fontWeight: 100,
          color: '#2e2410',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
        }}>
          Kaplan 2005
        </span>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #1e1608)' }} />
      </div>
    </div>
  )
}
