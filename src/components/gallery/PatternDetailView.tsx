import { useRef, useState } from 'react'
import type { Segment } from '../../types/geometry'
import type { SavedConfig } from '../../state/configLibrary'
import { Canvas } from '../Canvas'
import { faithfulRenderFlags } from '../../rendering/faithfulRender'
import { exportSVG, exportPNG } from '../../export/exportSVG'
import { saveJSON } from '../../export/exportJSON'
import type { EditAvailability } from './galleryBrowser.logic'

/**
 * Full-view inspector for a saved pattern (ADR-0006, slice 5). Renders the save
 * as its finished artifact via the shared read-only `Canvas` (pan/zoom, faithful
 * decoration + frame — same renderer the thumbnail uses), with a header that
 * carries Back, Edit in Lab, and image/JSON export against the live `<svg>`.
 */
interface Props {
  save: SavedConfig
  badge: string | null
  editAvailability: EditAvailability
  onBack: () => void
  onEditInLab: () => void
}

export function PatternDetailView({ save, badge, editAvailability, onBack, onEditInLab }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const flags = faithfulRenderFlags(save.config)

  const editTitle =
    editAvailability === 'unavailable'
      ? "This pattern can't be edited in the Lab yet"
      : editAvailability === 'convert'
        ? 'Convert to an editable Patch (your saved copy is kept)'
        : 'Open in the Lab'

  const exportPngNow = () => {
    const el = svgRef.current
    if (!el) return
    const cw = el.clientWidth || 1200
    const ch = el.clientHeight || 900
    void exportPNG(el, { width: 2048, height: Math.max(1, Math.round(2048 * (ch / cw))) })
  }

  return (
    <div className="gallery-detail">
      <div className="gallery-detail__bar">
        <button className="gallery-detail__btn" onClick={onBack}>← Gallery</button>
        <span className="gallery-detail__name" title={save.name}>{save.name}</span>
        {badge && <span className="gallery-card__badge gallery-detail__badge">{badge}</span>}
        <div className="gallery-detail__spacer" />
        <div className="gallery-detail__export">
          <button className="gallery-detail__btn" onClick={() => setExportOpen(o => !o)} aria-expanded={exportOpen}>
            Export ▾
          </button>
          {exportOpen && (
            <div className="gallery-detail__export-menu" role="menu">
              <button role="menuitem" onClick={() => { if (svgRef.current) exportSVG(svgRef.current); setExportOpen(false) }}>SVG</button>
              <button role="menuitem" onClick={() => { exportPngNow(); setExportOpen(false) }}>PNG</button>
              <button role="menuitem" onClick={() => { saveJSON(save.config); setExportOpen(false) }}>JSON</button>
            </div>
          )}
        </div>
        <button
          className="gallery-detail__btn gallery-detail__btn--primary"
          onClick={onEditInLab}
          disabled={editAvailability === 'unavailable'}
          title={editTitle}
        >
          Edit in Lab
        </button>
      </div>
      <div className="gallery-detail__canvas">
        <Canvas
          config={save.config}
          svgRef={svgRef}
          segmentsRef={segmentsRef}
          cpVisible={{}}
          cpActive={{}}
          {...flags}
        />
      </div>
    </div>
  )
}
