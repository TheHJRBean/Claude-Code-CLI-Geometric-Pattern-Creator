import { useReducer, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar } from './components/Sidebar'
import { reducer, DEFAULT_CONFIG } from './state/reducer'
import { exportSVG, exportPNG } from './export/exportSVG'
import { saveJSON, loadJSON } from './export/exportJSON'

export default function App() {
  const [config, dispatch] = useReducer(reducer, DEFAULT_CONFIG)
  const [showTileLayer, setShowTileLayer] = useState(false)
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
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <Sidebar
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
