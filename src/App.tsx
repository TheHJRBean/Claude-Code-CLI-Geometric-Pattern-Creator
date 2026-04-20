import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar } from './components/Sidebar'
import { SandstoneEdge } from './components/SandstoneEdge'
import { reducer, DEFAULT_CONFIG } from './state/reducer'
import { exportSVG, exportPNG, exportUnwovenSVG } from './export/exportSVG'
import { saveJSON, loadJSON } from './export/exportJSON'
import type { Segment } from './types/geometry'
import type { ActiveCurvePoint } from './rendering/ControlPointLayer'

const CURVE_POINT_HIGHLIGHT_MS = 1500

export default function App() {
  const [config, dispatch] = useReducer(reducer, DEFAULT_CONFIG)
  const [showTileLayer, setShowTileLayer] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeCurvePoint, setActiveCurvePoint] = useState<ActiveCurvePoint | null>(null)
  const cpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])

  const pokeCurvePoint = useCallback((tileTypeId: string, index: number) => {
    setActiveCurvePoint({ tileTypeId, index })
    if (cpTimerRef.current) clearTimeout(cpTimerRef.current)
    cpTimerRef.current = setTimeout(() => setActiveCurvePoint(null), CURVE_POINT_HIGHLIGHT_MS)
  }, [])

  useEffect(() => () => {
    if (cpTimerRef.current) clearTimeout(cpTimerRef.current)
  }, [])

  const handleExportSVG = () => { if (svgRef.current) exportSVG(svgRef.current) }
  const handleExportPNG = () => { if (svgRef.current) exportPNG(svgRef.current) }
  const handleExportUnwovenSVG = () => {
    if (!svgRef.current) return
    const el = svgRef.current
    const viewBox = el.getAttribute('viewBox') || '0 0 100 100'
    const w = el.clientWidth || 1200
    const h = el.clientHeight || 900
    exportUnwovenSVG(segmentsRef.current, viewBox, w, h)
  }
  const handleSaveJSON = () => saveJSON(config)
  const handleLoadJSON = async () => {
    try {
      const loaded = await loadJSON()
      dispatch({ type: 'LOAD_CONFIG', payload: loaded })
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="app-layout">
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

      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-backdrop--visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        config={config}
        dispatch={dispatch}
        showTileLayer={showTileLayer}
        onToggleTileLayer={() => setShowTileLayer(s => !s)}
        onExportSVG={handleExportSVG}
        onExportPNG={handleExportPNG}
        onExportUnwovenSVG={handleExportUnwovenSVG}
        onSaveJSON={handleSaveJSON}
        onLoadJSON={handleLoadJSON}
        onCurvePointActivity={pokeCurvePoint}
      />
      <div className="sandstone-edge-wrapper" aria-hidden="true">
        <SandstoneEdge />
      </div>
      <Canvas
        config={config}
        showTileLayer={showTileLayer}
        svgRef={svgRef}
        segmentsRef={segmentsRef}
        activeCurvePoint={activeCurvePoint}
      />
    </div>
  )
}
