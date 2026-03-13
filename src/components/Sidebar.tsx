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

const SIDEBAR_WIDTH = 280

export function Sidebar({
  config, dispatch, showTileLayer, onToggleTileLayer,
  onExportSVG, onExportPNG, onSaveJSON, onLoadJSON,
}: Props) {
  // Collect which polygon side counts are present in this tiling
  const def = TILINGS[config.tiling.type]
  const polygonTypes = def ? [...new Set(def.vertexConfig)].sort((a, b) => a - b) : []

  return (
    <div style={{
      width: SIDEBAR_WIDTH,
      height: '100%',
      background: '#1a1a2e',
      color: '#e8e4d9',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, sans-serif',
      fontSize: 13,
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #2d2d4e' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#c9a96e', marginBottom: 2 }}>
          Islamic Pattern Generator
        </h1>
        <p style={{ fontSize: 11, color: '#888', margin: 0 }}>PIC method · Kaplan 2005</p>
      </div>

      <Section title="Tiling">
        <Label>Type</Label>
        <select
          value={config.tiling.type}
          onChange={e => dispatch({ type: 'SET_TILING_TYPE', payload: e.target.value })}
          style={selectStyle}
        >
          {TILING_NAMES.map(name => (
            <option key={name} value={name}>{TILINGS[name].label}</option>
          ))}
        </select>

        <Label>Tile Scale</Label>
        <SliderRow
          value={config.tiling.scale}
          min={30} max={300} step={5}
          onChange={v => dispatch({ type: 'SET_SCALE', payload: v })}
        />
      </Section>

      <Section title="Contact Angles">
        {polygonTypes.map(sides => {
          const fig = config.figures[sides]
          const angle = fig?.contactAngle ?? 60
          return (
            <div key={sides}>
              <Label>{sides}-gon  ({angle.toFixed(1)}°)</Label>
              <SliderRow
                value={angle}
                min={10} max={85} step={0.5}
                onChange={v => dispatch({ type: 'SET_CONTACT_ANGLE', payload: { sides, angle: v } })}
              />
            </div>
          )
        })}
      </Section>

      <Section title="Lacing">
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={config.lacing.enabled}
            onChange={e => dispatch({ type: 'SET_LACING', payload: { enabled: e.target.checked } })}
            style={{ marginRight: 8 }}
          />
          Enable lacing
        </label>
        {config.lacing.enabled && (
          <>
            <Label>Strand width ({config.lacing.strandWidth}px)</Label>
            <SliderRow
              value={config.lacing.strandWidth}
              min={1} max={20} step={0.5}
              onChange={v => dispatch({ type: 'SET_LACING', payload: { strandWidth: v } })}
            />
            <Label>Gap width ({config.lacing.gapWidth}px)</Label>
            <SliderRow
              value={config.lacing.gapWidth}
              min={1} max={12} step={0.5}
              onChange={v => dispatch({ type: 'SET_LACING', payload: { gapWidth: v } })}
            />
          </>
        )}
      </Section>

      <Section title="Display">
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={showTileLayer}
            onChange={onToggleTileLayer}
            style={{ marginRight: 8 }}
          />
          Show tile outlines
        </label>
      </Section>

      <Section title="Export">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Button onClick={onExportSVG}>Export SVG</Button>
          <Button onClick={onExportPNG}>Export PNG</Button>
          <Button onClick={onSaveJSON}>Save JSON</Button>
          <Button onClick={onLoadJSON} variant="secondary">Load JSON</Button>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d2d4e' }}>
      <h2 style={{ fontSize: 11, fontWeight: 600, color: '#c9a96e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4, marginTop: 8 }}>{children}</div>
}

function SliderRow({ value, min, max, step, onChange }: {
  value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="range"
      min={min} max={max} step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: '100%', accentColor: '#c9a96e' }}
    />
  )
}

function Button({ children, onClick, variant = 'primary' }: {
  children: React.ReactNode
  onClick: () => void
  variant?: 'primary' | 'secondary'
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: variant === 'primary' ? '#c9a96e' : 'transparent',
        color: variant === 'primary' ? '#1a1a2e' : '#c9a96e',
        border: `1px solid #c9a96e`,
        borderRadius: 4,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </button>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: '#2d2d4e',
  color: '#e8e4d9',
  border: '1px solid #3d3d5e',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
}

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  fontSize: 12,
}
