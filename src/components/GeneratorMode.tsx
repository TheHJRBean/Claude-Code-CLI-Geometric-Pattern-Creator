import { useCallback, useEffect, useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { Canvas } from './Canvas'
import { faithfulRenderFlags } from '../rendering/faithfulRender'
import { sampleRandomPattern, type GeneratedPattern } from '../generator/randomPattern'
import { addRecord, allRecords, countRecords, SCORE_SCHEMA_VERSION, type NewDatasetRecord } from '../generator/datasetStore'
import { downloadDataset } from '../generator/datasetExport'
import { patternLibrary } from '../state/patternLibrary'
import { editAvailabilityFor } from './gallery/galleryBrowser.logic'
import { TILINGS } from '../tilings/index'
import { TextPromptModal } from './TextPromptModal'

/** A fresh 32-bit seed for the next sample. Not itself part of the
 * determinism contract — `sampleRandomPattern` is what must be reproducible
 * given a seed; how seeds are chosen for browsing is arbitrary. */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0
}

interface Props {
  /** Hand off the current sample to the Lab, converting + switching
   * workspaces (same resolution `resolveEditInLab` gives the Gallery). */
  onOpenInLab: (config: PatternConfig) => void
}

/**
 * Generator — third top-level mode (ADR-0007, ticket #19). Shows one random
 * finished pattern at a time (full-bleed, via the shared `Canvas` — the same
 * read-only render path the Gallery detail view and thumbnails use, so
 * there's no new renderer to maintain) and lets the user rate it with a
 * single keypress: `1`–`5` scores, `Space` skips (no record — nothing to
 * learn from an unrated sample), `F` flags it broken. Every scored or flagged
 * sample persists to IndexedDB with its full config as ground truth (the
 * seed is provenance only, never used to regenerate).
 */
export function GeneratorMode({ onOpenInLab }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const [sample, setSample] = useState<GeneratedPattern>(() => sampleRandomPattern(randomSeed()))
  const [ratedCount, setRatedCount] = useState(0)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => { void countRecords().then(setRatedCount) }, [])

  const flashMessage = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(f => (f === msg ? null : f)), 1600)
  }

  const advance = useCallback(() => {
    setSample(sampleRandomPattern(randomSeed()))
  }, [])

  // Score (1–5) or flag the CURRENT sample, persist it, then advance. Skips
  // never reach here — an unrated sample carries no taste signal.
  const rateAndAdvance = useCallback((score: number | null, flagged: boolean) => {
    const record: NewDatasetRecord = {
      seed: sample.seed,
      generatorVersion: sample.generatorVersion,
      scoreSchemaVersion: SCORE_SCHEMA_VERSION,
      config: sample.config,
      score,
      flagged,
      timestamp: Date.now(),
    }
    void addRecord(record).then(() => setRatedCount(c => c + 1))
    advance()
  }, [sample, advance])

  useEffect(() => {
    // Don't hijack typing in the Save-to-library name prompt — gated on the
    // modal's open state (not just focus) so a stray keystroke can't rate a
    // sample out from under an open dialog.
    if (saveModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key >= '1' && e.key <= '5') { rateAndAdvance(Number(e.key), false); return }
      if (e.key === ' ') { e.preventDefault(); advance(); return }
      if (e.key.toLowerCase() === 'f') { rateAndAdvance(null, true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rateAndAdvance, advance, saveModalOpen])

  const handleExport = () => {
    void allRecords().then(records => {
      if (records.length === 0) { flashMessage('Nothing rated yet'); return }
      downloadDataset(records)
    })
  }

  const suggestedName = `${TILINGS[sample.config.tiling.type]?.label ?? sample.config.tiling.type} (seed ${sample.seed})`
  const handleSaveConfirm = (name: string) => {
    setSaveModalOpen(false)
    const result = patternLibrary.save(name, sample.config)
    flashMessage(result.error ? result.error.message : 'Saved to library')
  }

  const editAvailability = editAvailabilityFor(sample.config)
  const openInLabTitle = editAvailability === 'unavailable'
    ? "This tiling can't be opened in the Lab yet"
    : 'Open in the Lab'

  const flags = faithfulRenderFlags(sample.config)

  return (
    <div className="generator-view">
      <div className="generator-view__bar">
        <span className="generator-view__count">Rated: {ratedCount}</span>
        <div className="generator-view__spacer" />
        <button className="gallery-detail__btn" onClick={() => setSaveModalOpen(true)}>
          Save to library
        </button>
        <button
          className="gallery-detail__btn"
          onClick={() => onOpenInLab(sample.config)}
          disabled={editAvailability === 'unavailable'}
          title={openInLabTitle}
        >
          Open in Lab
        </button>
        <button className="gallery-detail__btn gallery-detail__btn--primary" onClick={handleExport}>
          Export dataset
        </button>
      </div>
      <div className="generator-view__canvas">
        <Canvas
          config={sample.config}
          svgRef={svgRef}
          segmentsRef={segmentsRef}
          cpVisible={{}}
          cpActive={{}}
          {...flags}
        />
        <div className="generator-dock" role="toolbar" aria-label="Rate this pattern">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} className="generator-dock__btn" onClick={() => rateAndAdvance(n, false)} title={`Score ${n}`}>
              {n}
            </button>
          ))}
          <button className="generator-dock__btn generator-dock__btn--skip" onClick={advance} title="Skip (Space)">
            Skip
          </button>
          <button className="generator-dock__btn generator-dock__btn--flag" onClick={() => rateAndAdvance(null, true)} title="Flag broken (F)">
            Flag
          </button>
        </div>
        {flash && <div className="generator-flash">{flash}</div>}
      </div>
      <TextPromptModal
        open={saveModalOpen}
        title="Name this pattern"
        confirmLabel="Save"
        initialValue={suggestedName}
        onConfirm={handleSaveConfirm}
        onCancel={() => setSaveModalOpen(false)}
      />
    </div>
  )
}
