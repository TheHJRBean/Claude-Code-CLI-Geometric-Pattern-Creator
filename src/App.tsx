import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { TessellationLabMode } from './components/TessellationLabMode'
import { GeneratorMode } from './components/GeneratorMode'
import { reducer } from './state/reducer'
import { LAB_DEFAULT_CONFIG, loadLabState, saveLabState } from './state/labDefaults'
import { GalleryBrowser } from './components/gallery/GalleryBrowser'
import { resolveEditInLab } from './components/gallery/galleryBrowser.logic'
import { patternLibrary } from './state/patternLibrary'
import type { PatternConfig } from './types/pattern'
import type { AppMode } from './types/appMode'

export default function App() {
  // Post-convergence (ADR-0006) the Lab is where patterns are authored, so a
  // fresh profile opens there; the Gallery is the saved-patterns browser. A
  // returning user's persisted choice — including an explicit 'main' or
  // 'generator' — is respected. Internal value + localStorage key are
  // unchanged (Q9).
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      const saved = localStorage.getItem('app-mode')
      return saved === 'main' || saved === 'generator' ? saved : 'lab'
    } catch { return 'lab' }
  })
  const persistMode = (next: AppMode) => {
    try { localStorage.setItem('app-mode', next) } catch { /* ignore */ }
  }
  const selectMode = useCallback((next: AppMode) => {
    setMode(next)
    persistMode(next)
  }, [])
  const goToLab = useCallback(() => selectMode('lab'), [selectMode])

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
    goToLab()
  }, [labDispatch, goToLab])

  if (mode === 'lab') {
    return (
      <TessellationLabMode
        mode={mode}
        onSelectMode={selectMode}
        config={labConfig}
        dispatch={labDispatch}
        showStrands={labShowStrands}
        onToggleShowStrands={setLabShowStrands}
        outlineWidth={labOutlineWidth}
        onSetOutlineWidth={setLabOutlineWidth}
      />
    )
  }

  if (mode === 'generator') {
    return (
      <div className="app-shell">
        <TopBar mode={mode} onSelectMode={selectMode} title="Generator" exportItems={[]} />
        <div className="app-layout">
          <GeneratorMode onOpenInLab={handleEditInLab} />
        </div>
      </div>
    )
  }

  // Gallery = the saved-patterns browser (ADR-0006). The tuning sidebar is gone
  // — authoring lives in the Lab; the empty state points there.
  return (
    <div className="app-shell">
      <TopBar mode={mode} onSelectMode={selectMode} title="Gallery" exportItems={[]} />
      <div className="app-layout">
        <GalleryBrowser
          library={patternLibrary}
          onEditInLab={handleEditInLab}
          onGoToLab={goToLab}
        />
      </div>
    </div>
  )
}
