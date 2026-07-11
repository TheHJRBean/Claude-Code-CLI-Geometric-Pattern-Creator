import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar } from './components/Sidebar'
import { SandstoneEdge } from './components/SandstoneEdge'
import { TopBar } from './components/TopBar'
import { TILINGS } from './tilings/index'
import { TessellationLabMode } from './components/TessellationLabMode'
import { reducer, DEFAULT_CONFIG } from './state/reducer'
import { LAB_DEFAULT_CONFIG, loadLabState, saveLabState } from './state/labDefaults'
import { buildExportMenuItems } from './export/exportActions'
import { GalleryBrowser } from './components/gallery/GalleryBrowser'
import { resolveEditInLab } from './components/gallery/galleryBrowser.logic'
import { patternLibrary } from './state/patternLibrary'
import type { Segment } from './types/geometry'
import type { PatternConfig } from './types/pattern'

type AppMode = 'main' | 'lab'

export default function App() {
  const [mode, setMode] = useState<AppMode>(() => {
    try { return localStorage.getItem('app-mode') === 'lab' ? 'lab' : 'main' } catch { return 'main' }
  })
  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next: AppMode = prev === 'main' ? 'lab' : 'main'
      try { localStorage.setItem('app-mode', next) } catch { /* ignore */ }
      return next
    })
  }, [])
  // Gallery sub-view: the saved-patterns browser (default) vs the legacy tuning
  // sidebar. The tuning view stays reachable this ticket; it's removed in the
  // flip (#7).
  const [galleryView, setGalleryView] = useState<'browse' | 'tune'>('browse')

  const [config, dispatch] = useReducer(reducer, DEFAULT_CONFIG)
  // Lab state lives at App level so it persists across mode toggles, and
  // is restored from localStorage so it persists across page reloads.
  const initialLab = useRef(loadLabState()).current
  const [labConfig, labDispatch] = useReducer(reducer, initialLab.config ?? LAB_DEFAULT_CONFIG)
  const [labShowStrands, setLabShowStrands] = useState(initialLab.showStrands)
  const [labOutlineWidth, setLabOutlineWidth] = useState(initialLab.outlineWidth)

  useEffect(() => {
    saveLabState({
      config: labConfig,
      showStrands: labShowStrands,
      outlineWidth: labOutlineWidth,
    })
  }, [labConfig, labShowStrands, labOutlineWidth])

  // "Edit in Lab" from the Gallery browser: load the (converted) config into
  // the Lab reducer and switch workspaces. Editor saves load verbatim; tier-1
  // legacy presets convert one-way (the saved copy is untouched — see
  // resolveEditInLab). Non-convertible legacy saves never reach here (the
  // detail view's button is disabled), so a null result is a safe no-op.
  const handleEditInLab = useCallback((cfg: PatternConfig) => {
    const resolved = resolveEditInLab(cfg)
    if (!resolved) return
    labDispatch({ type: 'LOAD_CONFIG', payload: resolved.config })
    setMode('lab')
    try { localStorage.setItem('app-mode', 'lab') } catch { /* ignore */ }
  }, [labDispatch])
  const [showTileLayer, setShowTileLayer] = useState(false)
  const [showLines, setShowLines] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-desktop-collapsed') === 'true' } catch { return false }
  })
  const [cpVisible, setCpVisible] = useState<Record<string, boolean>>({})
  const [cpActive, setCpActive] = useState<Record<string, number>>({})
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const [pngTransparent, setPngTransparent] = useState(false)

  const toggleDesktopCollapsed = useCallback(() => {
    setDesktopCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar-desktop-collapsed', String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const toggleCpVisible = useCallback((tileTypeId: string) => {
    setCpVisible(prev => ({ ...prev, [tileTypeId]: !prev[tileTypeId] }))
  }, [])

  const setCpActiveIndex = useCallback((tileTypeId: string, index: number) => {
    setCpActive(prev => (prev[tileTypeId] === index ? prev : { ...prev, [tileTypeId]: index }))
  }, [])

  if (mode === 'lab') {
    return (
      <TessellationLabMode
        mode={mode}
        onToggleMode={toggleMode}
        config={labConfig}
        dispatch={labDispatch}
        showStrands={labShowStrands}
        onToggleShowStrands={setLabShowStrands}
        outlineWidth={labOutlineWidth}
        onSetOutlineWidth={setLabOutlineWidth}
      />
    )
  }

  // Gallery = the saved-patterns browser by default (ADR-0006). The legacy
  // tuning sidebar stays reachable via "New pattern" until the flip (#7).
  if (galleryView === 'browse') {
    return (
      <div className="app-shell">
        <TopBar mode={mode} onToggleMode={toggleMode} title="Gallery" exportItems={[]} />
        <div className="app-layout">
          <GalleryBrowser
            library={patternLibrary}
            onEditInLab={handleEditInLab}
            onOpenTuner={() => setGalleryView('tune')}
          />
        </div>
      </div>
    )
  }

  const exportItems = buildExportMenuItems({
    svgRef,
    segmentsRef,
    config,
    onLoad: loaded => dispatch({ type: 'LOAD_CONFIG', payload: loaded }),
    pngTransparent,
    onTogglePngTransparent: () => setPngTransparent(t => !t),
    includeUnwoven: true,
  })

  const galleryTitle = TILINGS[config.tiling.type]?.label ?? 'Pattern'

  return (
    <div className="app-shell">
      <TopBar
        mode={mode}
        onToggleMode={toggleMode}
        title={galleryTitle}
        exportItems={exportItems}
      />
      <button className="gallery-tune-back" onClick={() => setGalleryView('browse')} title="Back to saved patterns">
        ← My Patterns
      </button>
      <div className={`app-layout ${desktopCollapsed ? 'app-layout--sidebar-collapsed' : ''}`}>
      {/* Mobile sidebar toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(s => !s)}
        aria-label={sidebarOpen ? 'Close controls' : 'Open controls'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Desktop re-open button (visible only when collapsed) */}
      <button
        className="sidebar-reopen-desktop"
        onClick={toggleDesktopCollapsed}
        aria-label="Show controls"
        title="Show controls"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="13 17 18 12 13 7" />
          <polyline points="6 17 11 12 6 7" />
        </svg>
      </button>

      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-backdrop--visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        mode={mode}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        desktopCollapsed={desktopCollapsed}
        onToggleDesktopCollapsed={toggleDesktopCollapsed}
        config={config}
        dispatch={dispatch}
        showTileLayer={showTileLayer}
        onToggleTileLayer={() => setShowTileLayer(s => !s)}
        showLines={showLines}
        onToggleLines={() => setShowLines(s => !s)}
        cpVisible={cpVisible}
        onToggleCpVisible={toggleCpVisible}
        onCurvePointActivity={setCpActiveIndex}
      />
      <div className="sandstone-edge-wrapper" aria-hidden="true">
        <SandstoneEdge />
      </div>
      <Canvas
        config={config}
        showTileLayer={showTileLayer}
        showLines={showLines}
        svgRef={svgRef}
        segmentsRef={segmentsRef}
        cpVisible={cpVisible}
        cpActive={cpActive}
      />
      </div>
    </div>
  )
}
