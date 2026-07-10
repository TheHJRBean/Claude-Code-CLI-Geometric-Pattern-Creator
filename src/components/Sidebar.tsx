import { useState } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS, SYMMETRY_GROUPS } from '../tilings/index'
import { tilingRepeatLength } from '../tilings/archimedean'
import type { TileTypeInfo } from '../types/tiling'
import { FieldLabel } from './ui/FieldLabel'
import { Toggle } from './ui/Toggle'
import { StrandStyleControls } from './ui/StrandStyleControls'
import { FigureControls } from './strands/FigureControls'
import { patternLibrary } from '../state/patternLibrary'
import { ConfigLibraryPanel } from './ConfigLibraryPanel'
import type { FrameConfig, FrameShape } from '../types/editor'
import { DEFAULT_FRAME_SIZE, frameUnitModel, frameUnitsToPx } from '../editor/frame'

interface Props {
  mode: 'main' | 'lab'
  config: PatternConfig
  dispatch: React.Dispatch<Action>
  showTileLayer: boolean
  onToggleTileLayer: () => void
  showLines: boolean
  onToggleLines: () => void
  cpVisible: Record<string, boolean>
  onToggleCpVisible: (tileTypeId: string) => void
  onCurvePointActivity: (tileTypeId: string, index: number) => void
  open: boolean
  onClose: () => void
  desktopCollapsed: boolean
  onToggleDesktopCollapsed: () => void
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

function SectionChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      className="section-chevron"
      style={{
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        transition: 'transform 0.2s ease, opacity 0.15s',
        flexShrink: 0,
        color: 'var(--accent)',
        opacity: 0.5,
      }}
      aria-hidden="true"
    >
      <polyline points="2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SectionTitle({ children, open, onToggle, tooltip }: {
  children: React.ReactNode
  open?: boolean
  onToggle?: () => void
  tooltip?: string
}) {
  const interactive = typeof onToggle === 'function'
  const isOpen = open ?? true
  const inner = (
    <>
      <OctaStar size={10} opacity={0.7} />
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--accent)',
        letterSpacing: '0.20em',
        textTransform: 'uppercase' as const,
        textDecoration: tooltip ? 'underline dotted var(--text-muted)' : 'none',
        textUnderlineOffset: 4,
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--divider), transparent)' }} />
      {interactive && <SectionChevron open={isOpen} />}
    </>
  )
  if (!interactive) {
    return (
      <div
        title={tooltip}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginBottom: 14,
          cursor: tooltip ? 'help' : 'default',
        }}
      >
        {inner}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      title={tooltip}
      className="section-title-button"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        marginBottom: isOpen ? 14 : 2,
        width: '100%',
        background: 'transparent',
        border: 'none',
        padding: '6px 0',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'margin-bottom 0.2s ease',
      }}
    >
      {inner}
    </button>
  )
}

/**
 * Collapsible sidebar section shell. Dedupes the wrapper chrome (border row +
 * optional Lotus divider + collapsible `SectionTitle`) that every control group
 * repeated by hand. The heterogeneous bodies stay inline as `children`; only
 * the chrome is shared. `divider` defaults on (off for the first section);
 * `style` overrides padding/border for the first/last sections.
 */
function Section({ title, tooltip, open, onToggle, divider = true, style, children }: {
  title: React.ReactNode
  tooltip?: string
  open: boolean
  onToggle: () => void
  divider?: boolean
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  return (
    <div style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)', ...style }}>
      {divider && <LotusDivider />}
      <SectionTitle open={open} onToggle={onToggle} tooltip={tooltip}>{title}</SectionTitle>
      {open && children}
    </div>
  )
}

/** Lightweight sub-group divider used inside a Section (secondary colour, so
 *  it reads below the accent SectionTitle). */
function SubHeading({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  return (
    <div
      title={tooltip}
      style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 20, marginBottom: 6 }}
    >
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--fs-micro)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        cursor: tooltip ? 'help' : 'default',
        textDecoration: tooltip ? 'underline dotted var(--text-muted)' : 'none',
        textUnderlineOffset: 3,
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--divider), transparent)' }} />
    </div>
  )
}

/* ── Main Sidebar ────────────────────────────────────────── */

export function Sidebar({
  mode,
  config, dispatch, showTileLayer, onToggleTileLayer, showLines, onToggleLines,
  cpVisible, onToggleCpVisible, onCurvePointActivity,
  open, onClose,
  desktopCollapsed, onToggleDesktopCollapsed,
}: Props) {
  const def = TILINGS[config.tiling.type]
  const tileTypes: TileTypeInfo[] = def
    ? (def.tileTypes ?? [...new Set(def.vertexConfig)].sort((a, b) => a - b).map(s => ({
        id: String(s), sides: s, label: `${s}-gon`,
      })))
    : []

  // Step 17 follow-up — Main "My Patterns" library. Active-entry id stays
  // until the user explicitly loads a different starting point (Load JSON
  // or another saved entry); slider tweaks do not reset it so the user
  // can re-Save a modified version against the original name.
  const [activePatternId, setActivePatternId] = useState<string>('')

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar-collapsed-sections')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('sidebar-collapsed-sections', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const isOpen = (key: string) => !collapsedSections[key]

  // Mirror Lab — Figures panel starts with basic per-tile-type controls
  // (contact angle, Ray length). Ticking "Show advanced" reveals the
  // vertex Rays, decoupled vertex angle, snap, and curve recipe sections.
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Gallery clip-only Frame — only `type: 'shape'` is ever stored here. The
  // shape `select`'s empty value clears the Frame; choosing a shape seeds
  // sensible defaults. Slider edits merge into the existing config.
  const galleryFrame = config.frame
  const frameShape: FrameShape | '' = galleryFrame?.type === 'shape' ? (galleryFrame.shape ?? 'square') : ''
  const setGalleryFrame = (patch: Partial<FrameConfig> | null) => {
    if (patch === null) { dispatch({ type: 'SET_GALLERY_FRAME', payload: null }); return }
    const base: FrameConfig = galleryFrame ?? {
      type: 'shape', shape: 'square', size: DEFAULT_FRAME_SIZE, aspect: 1, rotation: 0,
    }
    dispatch({ type: 'SET_GALLERY_FRAME', payload: { ...base, type: 'shape', ...patch } })
  }
  // Tier B — size the Frame in whole tiling **repeat units** rather than raw
  // px. One unit = the tiling's nearest same-orientation translate `|t1|` at
  // the current scale; `size` stays stored in px so the world geometry and
  // validation are unchanged — the slider just snaps to integer multiples of
  // the live repeat. `mode === 'main'` guarantees a real (non-editor) tiling;
  // fall back to the edge length if the definition is somehow missing.
  const frameTilingDef = TILINGS[config.tiling.type]
  const frameRepeat = frameTilingDef
    ? tilingRepeatLength(frameTilingDef, config.tiling.scale)
    : config.tiling.scale
  const frameSizePx = galleryFrame?.size ?? DEFAULT_FRAME_SIZE
  const { min: frameMinUnits, max: frameMaxUnits, units: frameUnits } = frameUnitModel(frameRepeat, frameSizePx)
  const setFrameUnits = (units: number) => {
    setGalleryFrame({ size: frameUnitsToPx(units, frameRepeat) })
  }

  return (
    <div className={`sidebar ${open ? 'sidebar--open' : ''} ${desktopCollapsed ? 'sidebar--desktop-collapsed' : ''}`}>
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

        {/* Desktop collapse button */}
        <button
          className="sidebar-collapse-desktop"
          onClick={onToggleDesktopCollapsed}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>

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

        <p style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 12.5,
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          marginTop: 2,
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
        <Section title="Tiling" open={isOpen('tiling')} onToggle={() => toggleSection('tiling')} divider={false} style={{ paddingTop: 20 }}>
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
        </Section>

        {/* Frame (Gallery only) — clip the pattern to a parametric Shape Frame. */}
        {mode === 'main' && (
          <Section title="Frame" open={isOpen('frame')} onToggle={() => toggleSection('frame')}>
                <FieldLabel label="Shape" />
                <select
                  value={frameShape}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '') setGalleryFrame(null)
                    else setGalleryFrame({ shape: v as FrameShape })
                  }}
                  className="pattern-select"
                >
                  <option value="">None</option>
                  <option value="square">Square</option>
                  <option value="pentagon">Pentagon</option>
                  <option value="hexagon">Hexagon</option>
                  <option value="octagon">Octagon</option>
                </select>

                {galleryFrame && (
                  <>
                    <FieldLabel label="Size" value={String(frameUnits)} unit={`${frameUnits === 1 ? ' unit' : ' units'} · ${Math.round(frameSizePx)} px`} tooltip="Frame size in whole tiling repeat units (one unit = one lattice translate)." />
                    <input
                      type="range"
                      className="pattern-slider"
                      min={frameMinUnits} max={frameMaxUnits} step={1}
                      value={frameUnits}
                      onChange={e => setFrameUnits(Number(e.target.value))}
                    />

                    <FieldLabel label="Aspect" value={(galleryFrame.aspect ?? 1).toFixed(2)} unit="×" />
                    <input
                      type="range"
                      className="pattern-slider"
                      min={0.5} max={2} step={0.01}
                      value={galleryFrame.aspect ?? 1}
                      onChange={e => setGalleryFrame({ aspect: Number(e.target.value) })}
                    />

                    <FieldLabel label="Rotation" value={String(Math.round(((galleryFrame.rotation ?? 0) * 180) / Math.PI))} unit="°" />
                    <input
                      type="range"
                      className="pattern-slider"
                      min={0} max={360} step={1}
                      value={Math.round(((galleryFrame.rotation ?? 0) * 180) / Math.PI)}
                      onChange={e => setGalleryFrame({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
                    />
                    <div style={{ marginBottom: 4 }} />
                  </>
                )}
          </Section>
        )}

        {/* Strands — per-Tile-type Figure recipes + global Strand styling.
            Absorbs the former Figures / Strand-style / Figure-routing / Curves
            sections into one parent with sub-groups. */}
        <Section
          title="Strands"
          open={isOpen('strands')}
          onToggle={() => toggleSection('strands')}
          tooltip="Per-Tile-type Figure recipes plus global Strand styling. A Strand is a chain of Rays across polygons; most sliders adjust individual Rays and the Strand emerges from them."
        >
          {tileTypes.map(tt => {
            const fig = config.figures[tt.id]
            const angle = fig?.contactAngle ?? 60
            const lineLength = fig?.lineLength ?? 1.0
            const autoLen = fig?.autoLineLength ?? true
            const snapEnabled = fig?.snapLineLength ?? false
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
            const vertexCurve = fig?.vertexCurve ?? fig?.curve
            const vertexCurveEnabled = vertexCurve?.enabled ?? false
            const vertexCurvePoints = vertexCurve?.points ?? curvePoints
            const vertexCurveAlternating = vertexCurve?.alternating ?? false
            const vertexCurveDirection = vertexCurve?.direction ?? 'left'
            return (
              <FigureControls
                key={tt.id}
                tileTypeId={tt.id}
                sides={tt.sides}
                displayLabel={tt.label}
                angle={angle}
                lineLength={lineLength}
                autoLen={autoLen}
                snapEnabled={snapEnabled}
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
                vertexCurveEnabled={vertexCurveEnabled}
                vertexCurvePoints={vertexCurvePoints}
                vertexCurveAlternating={vertexCurveAlternating}
                vertexCurveDirection={vertexCurveDirection}
                cpShown={cpVisible[tt.id] ?? false}
                onToggleCpShown={() => onToggleCpVisible(tt.id)}
                tilingType={config.tiling.type}
                allFigures={config.figures}
                dispatch={dispatch}
                onCurvePointActivity={onCurvePointActivity}
                advanced={showAdvanced}
              />
            )
          })}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 6,
            cursor: 'pointer',
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: 13.5,
            color: showAdvanced ? 'var(--text)' : 'var(--text-muted)',
            transition: 'color 0.15s',
          }}>
            <input
              type="checkbox"
              className="pattern-checkbox"
              checked={showAdvanced}
              onChange={e => setShowAdvanced(e.target.checked)}
            />
            Show advanced
          </label>
          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET_FIGURES' })}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '6px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
            title="Reset every Tile-type's Strand parameters (contact angle, line length, vertex Rays, curves) back to the tiling defaults."
          >
            Reset parameters
          </button>

          {/* Strand style — global stroke width / line style / lacing */}
          <SubHeading tooltip="Stroke width, line style, and the over–under Lacing applied to every rendered Strand. Strand-level, not Ray-level.">
            Strand style
          </SubHeading>
          <StrandStyleControls strand={config.strand} dispatch={dispatch} />

          {/* Figure routing (advanced) — how degenerate pair-A meetings on
              irregular polygons are handled. */}
          {showAdvanced && (
            <>
              <SubHeading tooltip="On irregular tilings (kisrhombille, floret, deltoid, heptagonal-rosette) the natural ray meeting can fall outside the polygon. This picks how that case is handled. Auto keeps strands interior; Edge brings back the visible boundary slide.">
                Figure routing
              </SubHeading>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 2 }}>
                {(['auto', 'edge', 'centroid'] as const).map(routeMode => {
                  const active = (config.figureRouting ?? 'auto') === routeMode
                  return (
                    <button
                      key={routeMode}
                      type="button"
                      onClick={() => dispatch({ type: 'SET_FIGURE_ROUTING', payload: routeMode })}
                      style={{
                        padding: '5px 0',
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--fs-micro)',
                        fontWeight: 600,
                        letterSpacing: '0.10em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        border: active ? '1px solid var(--text)' : '1px solid var(--border-subtle)',
                        background: active ? 'var(--accent-soft, rgba(0,0,0,0.04))' : 'transparent',
                        color: active ? 'var(--text)' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                      title={
                        routeMode === 'auto'
                          ? 'Centroid V on convex polygons; original edge-slide on concave (default).'
                          : routeMode === 'edge'
                            ? 'Always emit the original edge-slide. Brings back the "running along the edge" look on irregular tilings.'
                            : 'Force centroid V on every convex polygon. Concave polygons still slide.'
                      }
                    >
                      {routeMode}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Curves (advanced) — global curve-rendering option */}
          {showAdvanced && (
            <>
              <SubHeading>Curves</SubHeading>
              <Toggle
                checked={config.smoothTransitions ?? false}
                onChange={v => dispatch({ type: 'SET_SMOOTH_TRANSITIONS', payload: v })}
                label="Smooth transitions"
              />
            </>
          )}

          <div style={{ marginBottom: 4 }} />
        </Section>

        {/* Display */}
        <Section title="Display" open={isOpen('display')} onToggle={() => toggleSection('display')}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <Toggle
                  checked={showLines}
                  onChange={() => onToggleLines()}
                  label="Show strands"
                />
                <Toggle
                  checked={showTileLayer}
                  onChange={() => onToggleTileLayer()}
                  label="Show tiling"
                />
              </div>
              <div style={{ marginBottom: 4 }} />
        </Section>

        {/* My Patterns — in-app library of saved configs (mirrors Lab's). Left
            as a raw section div on purpose: its trailing spacer renders OUTSIDE
            the collapse gate (unlike every other section), which `Section`
            can't express without changing that behaviour. */}
        <div style={{ paddingTop: 4, paddingBottom: 28 }}>
          <LotusDivider />
          <SectionTitle open={isOpen('library')} onToggle={() => toggleSection('library')}>My Patterns</SectionTitle>
          {isOpen('library') && (
            <ConfigLibraryPanel
              library={patternLibrary}
              currentConfig={config}
              onLoad={c => dispatch({ type: 'LOAD_CONFIG', payload: c })}
              nounSingular="pattern"
              activeId={activePatternId}
              onActiveIdChange={setActivePatternId}
            />
          )}
          <div style={{ marginBottom: 4 }} />
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
