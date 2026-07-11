import type { CardModel } from './galleryBrowser.logic'

/**
 * One saved-pattern card in the Gallery browser grid (ADR-0006, slice 5).
 * Thumbnail (or a placeholder while it backfills), name, a legacy-path badge
 * for BFS/Taprats saves, and the manage actions. Clicking the thumbnail opens
 * the detail view; the pure `CardModel` decides the badge + edit path.
 */
interface Props {
  model: CardModel
  thumbUrl?: string
  onOpen: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  onExport: () => void
}

export function PatternCard({ model, thumbUrl, onOpen, onRename, onDuplicate, onDelete, onExport }: Props) {
  return (
    <div className="gallery-card">
      <button className="gallery-card__thumb" onClick={onOpen} title={`Open "${model.name}"`}>
        {thumbUrl
          ? <img src={thumbUrl} alt={model.name} className="gallery-card__img" draggable={false} />
          : <span className="gallery-card__placeholder" aria-label="Rendering preview">◈</span>}
        {model.badge && <span className="gallery-card__badge">{model.badge}</span>}
      </button>
      <div className="gallery-card__body">
        <div className="gallery-card__name" title={model.name}>{model.name}</div>
        <div className="gallery-card__actions">
          <button className="gallery-card__action" onClick={onRename}>Rename</button>
          <button className="gallery-card__action" onClick={onDuplicate}>Duplicate</button>
          <button className="gallery-card__action" onClick={onExport} title="Save JSON">Export</button>
          <button className="gallery-card__action gallery-card__action--danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  )
}
