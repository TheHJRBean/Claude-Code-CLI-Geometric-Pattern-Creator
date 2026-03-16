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

// ── Sandstone palette constants ───────────────────────────────────────────────
const C = {
  sand:       '#EAD8A8',  // papyrus — main background
  stone:      '#D4AC6A',  // temple stone — header background
  stoneDark:  '#C49848',  // deeper stone — header border
  border:     '#C4963A',  // terracotta-gold — borders
  borderFaint:'#DCC87A',  // faint gold — subtle dividers
  brownDeep:  '#2C1806',  // espresso — primary text
  brownMid:   '#5A3A14',  // walnut — secondary text / labels
  brownMuted: '#8A6034',  // muted amber — tertiary / placeholders
  amber:      '#7A4E08',  // dark amber — accent on light bg
  amberLight: '#9A6418',  // lighter amber — hover
  svgStroke:  '#8A5E14',  // SVG decorations
  svgFaint:   '#C4963A',  // SVG faint elements
} as const

// ── Decorative SVG components ─────────────────────────────────────────────────

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
        stroke={C.svgStroke}
        strokeWidth={isMain ? 1.5 : 0.5}
        opacity={isMain ? 0.5 : 0.2}
      />
    )
  })

  return (
    <svg width={W} height={78} viewBox={`0 0 ${W} 78`} style={{ display: 'block' }}>
      {rays}
      <path d={`M ${cx + 30} 0 A 30 30 0 0 1 ${cx - 30} 0`} fill="none" stroke={C.svgStroke} strokeWidth="0.75" opacity="0.3" />
      <path d={`M ${cx + 52} 0 A 52 52 0 0 1 ${cx - 52} 0`} fill="none" stroke={C.svgStroke} strokeWidth="0.5" opacity="0.2" />
      <path d={`M ${cx + 76} 0 A 76 76 0 0 1 ${cx - 76} 0`} fill="none" stroke={C.svgStroke} strokeWidth="0.4" opacity="0.15" />
      <circle cx={cx} cy={0} r={13} fill="none" stroke={C.svgStroke} strokeWidth="1.5" opacity="0.5" />
      <circle cx={cx} cy={0} r={7}  fill={C.svgStroke} opacity="0.4" />
      <circle cx={cx} cy={0} r={3}  fill={C.amber}     opacity="0.9" />
    </svg>
  )
}

function PyramidBorder() {
  const unit = 4
  const steps = 4
  const h = steps * unit

  function pyramidUnit(offsetX: number): string {
    let d = ''
    for (let s = 0; s < steps; s++) {
      d += ` L ${offsetX + s * unit},${h - s * unit - unit}`
      d += ` L ${offsetX + s * unit + unit},${h - s * unit - unit}`
    }
    for (let s = steps - 1; s >= 0; s--) {
      d += ` L ${offsetX + (steps * 2 - s - 1) * unit},${h - s * unit - unit}`
      d += ` L ${offsetX + (steps * 2 - s) * unit},${h - s * unit - unit}`
    }
    return d
  }

  let d = `M 0,${h}`
  for (let i = 0; i < 10; i++) d += pyramidUnit(i * (W / 10))
  d += ` L ${W},${h}`

  return (
    <svg width={W} height={h} viewBox={`0 0 ${W} ${h}`} style={{ display: 'block', flexShrink: 0 }}>
      <path d={d} fill="none" stroke={C.svgStroke} strokeWidth="1.5" opacity="0.5" />
    </svg>
  )
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${C.border})` }} />
      <span style={{
        fontFamily: "'Josefin Sans', sans-serif",
        fontSize: 9,
        fontWeight: 300,
        color: C.amber,
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
      <div style={{ flex: 1, height: 1, background: `linear-gradient(270deg, transparent, ${C.border})` }} />
    </div>
  )
}

function FieldRow({ label, value, unit, children }: {
  label: string; value?: string; unit?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
        <span style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 14,
          fontWeight: 400,
          color: C.brownMid,
          letterSpacing: '0.03em',
        }}>
          {label}
        </span>
        {value !== undefined && (
          <span style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 12,
            color: C.amber,
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
  checked: boolean; onChange: (v: boolean) => void; label: string
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: 'pointer',
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      fontStyle: 'italic',
      fontSize: 14,
      fontWeight: 400,
      color: checked ? C.brownDeep : C.brownMuted,
      letterSpacing: '0.03em',
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
  children: React.ReactNode; onClick: () => void; secondary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={secondary ? 'export-btn-secondary' : 'export-btn-primary'}
      style={{
        background: secondary ? 'transparent' : C.brownMid,
        color: secondary ? C.brownMid : C.sand,
        border: `1px solid ${secondary ? C.border : C.brownMid}`,
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
        background: C.sand,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\'%3E%3Crect x=\'8\' y=\'8\' width=\'4\' height=\'4\' fill=\'none\' stroke=\'%238A5E14\' stroke-width=\'0.4\' opacity=\'.08\' transform=\'rotate(45 10 10)\'/%3E%3C/svg%3E")',
        color: C.brownDeep,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
        borderRight: `1px solid ${C.stoneDark}`,
      }}
    >
      {/* ── Pyramid crown ── */}
      <div style={{ background: C.stone }}>
        <PyramidBorder />
      </div>

      {/* ── Header ── */}
      <div style={{
        padding: '0 24px 22px',
        background: C.stone,
        borderBottom: `2px solid ${C.stoneDark}`,
        textAlign: 'center',
      }}>
        <SunDisk />

        {/* Cartouche / title frame */}
        <div style={{
          border: `1px solid ${C.stoneDark}`,
          borderTop: 'none',
          padding: '14px 18px 16px',
          margin: '0 10px',
          position: 'relative',
        }}>
          {/* Corner brackets */}
          {([
            { top: -1, left: -1,  borderTop: `2px solid ${C.amber}`, borderLeft: `2px solid ${C.amber}`  },
            { top: -1, right: -1, borderTop: `2px solid ${C.amber}`, borderRight: `2px solid ${C.amber}` },
            { bottom: -1, left: -1,  borderBottom: `2px solid ${C.amber}`, borderLeft: `2px solid ${C.amber}`  },
            { bottom: -1, right: -1, borderBottom: `2px solid ${C.amber}`, borderRight: `2px solid ${C.amber}` },
          ] as React.CSSProperties[]).map((style, i) => (
            <div key={i} style={{ position: 'absolute', width: 8, height: 8, ...style }} />
          ))}

          <div style={{
            fontFamily: "'Poiret One', sans-serif",
            fontSize: 13,
            fontWeight: 400,
            color: C.brownMuted,
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
            color: C.brownDeep,
            letterSpacing: '0.5em',
            textTransform: 'uppercase',
            lineHeight: 1,
            marginBottom: 12,
          }}>
            Atlas
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, marginBottom: 10,
          }}>
            <div style={{ width: 20, height: 1, background: C.stoneDark }} />
            <div style={{ width: 4, height: 4, background: C.amber, transform: 'rotate(45deg)', opacity: 0.7 }} />
            <div style={{ width: 20, height: 1, background: C.stoneDark }} />
          </div>

          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 11,
            fontWeight: 400,
            color: C.brownMuted,
            letterSpacing: '0.14em',
          }}>
            Islamic Patterns · PIC Method
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ padding: '0 22px', flex: 1 }}>

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
          <input type="range" className="pattern-slider" min={30} max={300} step={5}
            value={config.tiling.scale}
            onChange={e => dispatch({ type: 'SET_SCALE', payload: Number(e.target.value) })}
          />
        </FieldRow>

        <SectionDivider title="Contact Angles" />
        {polygonTypes.map(sides => {
          const angle = config.figures[sides]?.contactAngle ?? 60
          return (
            <FieldRow key={sides} label={`${sides}-gon`} value={angle.toFixed(1)} unit="°">
              <input type="range" className="pattern-slider" min={10} max={85} step={0.5}
                value={angle}
                onChange={e => dispatch({ type: 'SET_CONTACT_ANGLE', payload: { sides, angle: Number(e.target.value) } })}
              />
            </FieldRow>
          )
        })}

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
              <input type="range" className="pattern-slider" min={1} max={20} step={0.5}
                value={config.lacing.strandWidth}
                onChange={e => dispatch({ type: 'SET_LACING', payload: { strandWidth: Number(e.target.value) } })}
              />
            </FieldRow>
            <FieldRow label="Gap width" value={config.lacing.gapWidth.toFixed(1)} unit=" px">
              <input type="range" className="pattern-slider" min={1} max={12} step={0.5}
                value={config.lacing.gapWidth}
                onChange={e => dispatch({ type: 'SET_LACING', payload: { gapWidth: Number(e.target.value) } })}
              />
            </FieldRow>
          </>
        )}

        <SectionDivider title="Display" />
        <div style={{ marginBottom: 16 }}>
          <Toggle checked={showTileLayer} onChange={onToggleTileLayer} label="Show tile grid" />
        </div>

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
        borderTop: `1px solid ${C.stoneDark}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: C.stone,
      }}>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${C.border})` }} />
        <span style={{
          fontFamily: "'Josefin Sans', sans-serif",
          fontSize: 8,
          fontWeight: 100,
          color: C.brownMuted,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
        }}>
          Kaplan 2005
        </span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(270deg, transparent, ${C.border})` }} />
      </div>
    </div>
  )
}
