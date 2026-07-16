import { useCallback, useEffect, useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { Canvas } from './Canvas'
import { faithfulRenderFlags } from '../rendering/faithfulRender'
import { sampleRandomPattern, type GeneratedPattern } from '../generator/randomPattern'
import { sampleGuidedPattern, GUIDED_CANDIDATES } from '../generator/guidedPattern'
import { trainTasteModel, MIN_TRAINING_SAMPLES, type TasteModel } from '../generator/tasteModel'
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

type SampleSource = 'random' | 'guided'

interface Props {
  /** Hand off the current sample to the Lab, converting + switching
   * workspaces (same resolution `resolveEditInLab` gives the Gallery). */
  onOpenInLab: (config: PatternConfig) => void
}

/**
 * Generator — third top-level mode (ADR-0007, ticket #19). Shows one random
 * finished pattern at a time (full-bleed, via the shared `Canvas` — the same
 * read-only render path the Gallery detail view and thumbnails use, so
 * there's no new renderer to maintain) and lets the user rate it: drag the
 * 0–10 slider and release to score-and-advance, `Space` skips (no record —
 * nothing to learn from an unrated sample), `F` flags it broken. Every
 * scored or flagged sample persists to IndexedDB with its full config as
 * ground truth (the seed is provenance only, never used to regenerate).
 */
export function GeneratorMode({ onOpenInLab }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const [sample, setSample] = useState<GeneratedPattern>(() => sampleRandomPattern(randomSeed()))
  const [ratedCount, setRatedCount] = useState(0)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  // 0–10 slider position; recentred to the neutral midpoint on every new
  // sample so it never shows the previous pattern's score.
  const [sliderValue, setSliderValue] = useState(5)
  // Guided source (ticket #35): the taste model retrains from IndexedDB once
  // per mode open (the closed-form ridge is instant at this dataset size).
  // undefined = still training, null = too few scored samples; either way
  // the Guided toggle stays disabled.
  const [model, setModel] = useState<TasteModel | null | undefined>(undefined)
  const [source, setSource] = useState<SampleSource>('random')
  // The model's estimate for the CURRENT sample when it came from Guided;
  // shown so the user can calibrate the model against their own reaction.
  const [predicted, setPredicted] = useState<number | null>(null)

  useEffect(() => { void countRecords().then(setRatedCount) }, [])
  useEffect(() => { void allRecords().then(records => setModel(trainTasteModel(records))) }, [])
  useEffect(() => { setSliderValue(5) }, [sample])

  const flashMessage = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(f => (f === msg ? null : f)), 1600)
  }

  // The source that produced the CURRENT sample — captured at generation time
  // so a mid-sample toggle flip can't mislabel the record.
  const sampleSourceRef = useRef<SampleSource>('random')

  const advance = useCallback(() => {
    if (source === 'guided' && model) {
      const seeds = Array.from({ length: GUIDED_CANDIDATES }, randomSeed)
      const guided = sampleGuidedPattern(model, seeds)
      sampleSourceRef.current = 'guided'
      setPredicted(guided.predictedScore)
      setSample(guided.sample)
    } else {
      sampleSourceRef.current = 'random'
      setPredicted(null)
      setSample(sampleRandomPattern(randomSeed()))
    }
  }, [source, model])

  // Score (0–10) or flag the CURRENT sample, persist it, then advance. Skips
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
      source: sampleSourceRef.current,
    }
    void addRecord(record).then(() => setRatedCount(c => c + 1))
    advance()
  }, [sample, advance])

  // Score is slider-driven now (drag-to-release, see the dock below);
  // Space/F stay keyboard shortcuts.
  useEffect(() => {
    // Don't hijack typing in the Save-to-library name prompt — gated on the
    // modal's open state (not just focus) so a stray keystroke can't rate a
    // sample out from under an open dialog.
    if (saveModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      // Only text-like inputs are off-limits; the score slider is itself an
      // <input type="range"> and must keep Space/F working while focused.
      if (target instanceof HTMLTextAreaElement) return
      if (target instanceof HTMLInputElement && target.type !== 'range') return
      if (e.key === ' ') { e.preventDefault(); advance(); return }
      if (e.key.toLowerCase() === 'f') { rateAndAdvance(null, true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rateAndAdvance, advance, saveModalOpen])

  const commitScore = (value: number) => rateAndAdvance(value, false)
  const onSliderKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      commitScore(Number(e.currentTarget.value))
    }
  }

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
        <div className="generator-source" role="group" aria-label="Sample source">
          <button
            className={`generator-source__btn${source === 'random' ? ' generator-source__btn--on' : ''}`}
            onClick={() => setSource('random')}
          >
            Random
          </button>
          <button
            className={`generator-source__btn${source === 'guided' ? ' generator-source__btn--on' : ''}`}
            onClick={() => setSource('guided')}
            disabled={!model}
            title={model
              ? `Best of ${GUIDED_CANDIDATES} candidates by your taste model`
              : `Needs at least ${MIN_TRAINING_SAMPLES} scored samples`}
          >
            Guided
          </button>
        </div>
        <span className="generator-view__count generator-view__model" title="Taste model fit — 5-fold cross-validated correlation between predicted and actual scores">
          {model
            ? `Model r=${model.cv.pearsonR.toFixed(2)} · n=${model.nSamples}`
            : model === undefined
              ? 'Model: training…'
              : `Model: needs ≥${MIN_TRAINING_SAMPLES} scored`}
        </span>
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
          {predicted !== null && (
            <span className="generator-dock__predicted" title="The taste model's estimate for this sample">
              ≈{predicted.toFixed(1)}
            </span>
          )}
          <span className="generator-dock__slider-value">{sliderValue}</span>
          <input
            type="range"
            className="pattern-slider generator-dock__slider"
            min={0}
            max={10}
            step={1}
            value={sliderValue}
            onChange={e => setSliderValue(Number(e.target.value))}
            onPointerUp={e => commitScore(Number(e.currentTarget.value))}
            onKeyUp={onSliderKeyUp}
            aria-label="Score, 0 to 10 — release to submit"
            title="Drag and release to score"
          />
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
