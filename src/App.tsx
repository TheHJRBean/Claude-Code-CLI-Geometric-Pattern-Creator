import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { TessellationLabMode } from './components/TessellationLabMode'
import { GeneratorMode } from './components/GeneratorMode'
import { reducer } from './state/reducer'
import { LAB_DEFAULT_CONFIG, loadLabState, saveLabState } from './state/labDefaults'
import { GalleryBrowser } from './components/gallery/GalleryBrowser'
import { linkedSavedIdFor, resolveEditInLab } from './components/gallery/galleryBrowser.logic'
import { patternLibrary } from './state/patternLibrary'
import { BugReportProvider } from './bugreport/context'
import { BugReportPanel } from './components/BugReportPanel'
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
  // Which library entry the Lab's working config is linked to ('' = unlinked,
  // so the library panel's Save prompts for a name and creates a new entry).
  // Lives here rather than in the Lab so "Edit in Lab" can set it as it hands
  // the config over. The persisted id is re-validated — the entry may have
  // been deleted since, in which case the config comes back unlinked.
  const [labSavedId, setLabSavedId] = useState<string>(
    () => (initialLab.savedId && patternLibrary.get(initialLab.savedId) ? initialLab.savedId : ''),
  )

  useEffect(() => {
    saveLabState({
      config: labConfig,
      showStrands: labShowStrands,
      outlineWidth: labOutlineWidth,
      savedId: labSavedId,
    })
  }, [labConfig, labShowStrands, labOutlineWidth, labSavedId])

  // "Edit in Lab" from the Gallery browser: load the (converted) config into
  // the Lab reducer and switch workspaces. Editor saves load verbatim; tier-1
  // legacy presets convert one-way (the saved copy is untouched — see
  // resolveEditInLab). Non-convertible legacy saves never reach here (the
  // detail view's button is disabled), so a null result is a safe no-op.
  //
  // A verbatim load stays *linked* to the save it came from, so the Lab's
  // Save overwrites that entry instead of forking an untitled copy. A
  // converted preset deliberately does not: the saved entry is still the
  // legacy render, and overwriting it with the derived Patch would destroy
  // the original the conversion promises to leave alone.
  const handleEditInLab = useCallback((cfg: PatternConfig, savedId = '') => {
    const resolved = resolveEditInLab(cfg)
    if (!resolved) return
    labDispatch({ type: 'LOAD_CONFIG', payload: resolved.config })
    setLabSavedId(linkedSavedIdFor(resolved, savedId))
    goToLab()
  }, [labDispatch, goToLab])

  const workspace = mode === 'lab'
    ? (
      <TessellationLabMode
        mode={mode}
        onSelectMode={selectMode}
        config={labConfig}
        dispatch={labDispatch}
        showStrands={labShowStrands}
        onToggleShowStrands={setLabShowStrands}
        outlineWidth={labOutlineWidth}
        onSetOutlineWidth={setLabOutlineWidth}
        savedId={labSavedId}
        onSetSavedId={setLabSavedId}
      />
    )
    : mode === 'generator'
      ? (
        <div className="app-shell">
          <TopBar mode={mode} onSelectMode={selectMode} title="Generator" exportItems={[]} />
          <div className="app-layout">
            <GeneratorMode onOpenInLab={handleEditInLab} />
          </div>
        </div>
      )
      // Gallery = the saved-patterns browser (ADR-0006). The tuning sidebar is
      // gone — authoring lives in the Lab; the empty state points there.
      : (
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

  // Bug capture wraps all three workspaces: the top bar's button, the
  // Ctrl+Shift+B shortcut and the screens' context contributors all need the
  // same provider, and the panel has to outrank every workspace's own chrome.
  return (
    <BugReportProvider appMode={mode}>
      {workspace}
      <BugReportPanel />
    </BugReportProvider>
  )
}
