import { useReducer, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar } from './components/Sidebar'
import { reducer, DEFAULT_CONFIG } from './state/reducer'
import { exportSVG, exportPNG } from './export/exportSVG'
import { saveJSON, loadJSON } from './export/exportJSON'

export default function App() {
  const [config, dispatch] = useReducer(reducer, DEFAULT_CONFIG)
  const [showTileLayer, setShowTileLayer] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const handleExportSVG = () => { if (svgRef.current) exportSVG(svgRef.current) }
  const handleExportPNG = () => { if (svgRef.current) exportPNG(svgRef.current) }
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
        onSaveJSON={handleSaveJSON}
        onLoadJSON={handleLoadJSON}
      />
      <Canvas config={config} showTileLayer={showTileLayer} svgRef={svgRef} />
    </div>
  )
}
