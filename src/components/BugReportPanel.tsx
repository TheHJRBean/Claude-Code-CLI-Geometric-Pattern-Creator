import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useBugReporter } from '../bugreport/context'
import type { BugCaptureSnapshot } from '../bugreport/context'
import { summarisePatternConfig } from '../bugreport/summary'
import { buildBugReport, bugReportMarkdown } from '../bugreport/report'
import { deleteReport, getReport, listReports, saveReport } from '../bugreport/store'
import {
  copyReportMarkdown,
  downloadReportJson,
  downloadReportMarkdown,
  downloadReportScreenshot,
  saveOutcomeMessage,
} from '../bugreport/actions'
import { BUG_SEVERITIES, BUG_SEVERITY_LABELS } from '../bugreport/types'
import type { BugReport, BugReportMeta, BugSeverity, ConfigSummary } from '../bugreport/types'

/**
 * The **Bug capture** panel: write a note, see exactly what was captured with
 * it, and get it back out as Markdown / JSON / PNG.
 *
 * Two tabs rather than two entry points — filing and reviewing are the same
 * mental task ("what did I hit and what did I already report"), and a report
 * is only useful once it can be handed on, so the export affordances have to
 * sit next to the list.
 *
 * The captured context is shown *before* saving, not hidden behind a
 * disclosure the user never opens: a report is only trustworthy if the person
 * filing it can see what they are about to hand over.
 */

const SEVERITY_DEFAULT: BugSeverity = 'major'

export function BugReportPanel() {
  const reporter = useBugReporter()
  const [tab, setTab] = useState<'new' | 'saved'>('new')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [severity, setSeverity] = useState<BugSeverity>(SEVERITY_DEFAULT)
  const [saved, setSaved] = useState<BugReportMeta[]>([])
  const [selected, setSelected] = useState<BugReport | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  /** A composed report the store refused to keep — held so it can still be
   *  exported before the panel closes. */
  const [unstored, setUnstored] = useState<BugReport | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const isOpen = reporter?.isOpen ?? false
  const snapshot = reporter?.snapshot ?? null

  const showFlash = useCallback((msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(current => (current === msg ? null : current)), 2600)
  }, [])

  const refreshSaved = useCallback(() => {
    void listReports().then(setSaved)
  }, [])

  // Fresh form each time the panel opens — a stale title from a report filed
  // ten minutes ago is worse than an empty field.
  useEffect(() => {
    if (!isOpen) return
    setTab('new')
    setTitle('')
    setNote('')
    setSeverity(SEVERITY_DEFAULT)
    setSelected(null)
    setUnstored(null)
    refreshSaved()
    const handle = requestAnimationFrame(() => noteRef.current?.focus())
    return () => cancelAnimationFrame(handle)
  }, [isOpen, refreshSaved])

  // Esc closes, at window level so it works wherever focus sits.
  useEffect(() => {
    if (!isOpen || !reporter) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); reporter.close() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, reporter])

  if (!reporter || !isOpen) return null

  const compose = (): BugReport | null => {
    if (!snapshot) return null
    return buildBugReport({
      title,
      note,
      severity,
      env: snapshot.env,
      screen: snapshot.screen,
      config: snapshot.config,
      screenshot: snapshot.screenshot,
      console: snapshot.console,
    })
  }

  const handleSave = async (then?: (report: BugReport, stored: boolean) => void | Promise<void>) => {
    const report = compose()
    if (!report) return
    const stored = await saveReport(report)
    refreshSaved()
    // A report the store refused is held here so it stays exportable. Without
    // this it exists only in this closure and dies with the panel — which is
    // exactly when the user still could have rescued it.
    setUnstored(stored ? null : report)
    if (then) await then(report, stored)
    else showFlash(saveOutcomeMessage(stored))
  }

  const handleSaveAndCopy = () => handleSave(async (report, stored) => {
    const copied = await copyReportMarkdown(report)
    // The clipboard copy is what makes an unstored report survivable, so the
    // two outcomes are reported independently rather than blurred into "saved".
    if (copied) showFlash(stored ? 'Saved — Markdown copied to clipboard' : 'NOT stored, but the Markdown is on your clipboard — paste it somewhere now')
    else {
      downloadReportMarkdown(report)
      showFlash(stored ? 'Saved — clipboard blocked, downloaded the Markdown instead' : 'NOT stored and clipboard blocked — the Markdown was downloaded instead')
    }
  })

  const handleSelect = async (id: string) => {
    setSelected(await getReport(id))
  }

  const handleDelete = async (id: string) => {
    await deleteReport(id)
    if (selected?.id === id) setSelected(null)
    refreshSaved()
    showFlash('Report deleted')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bug capture"
      onMouseDown={e => { if (e.target === e.currentTarget) reporter.close() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(2px)',
        // Above every piece of app chrome: `.top-bar` is 150 and the export
        // menu's submenu reaches 201, and this panel is tall enough to run
        // under both. A modal the top bar paints over is worse than no modal —
        // it silently truncates the header and the tabs.
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 'min(860px, 100%)',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-accent)',
          boxShadow: '0 14px 38px rgba(0, 0, 0, 0.45)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-accent)',
          }}
        >
          <h2 style={headingStyle}>Bug capture</h2>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <TabButton active={tab === 'new'} onClick={() => setTab('new')}>New report</TabButton>
            <TabButton active={tab === 'saved'} onClick={() => setTab('saved')}>
              {`Saved${saved.length ? ` (${saved.length})` : ''}`}
            </TabButton>
          </nav>
          <button type="button" onClick={reporter.close} aria-label="Close" style={closeButtonStyle}>×</button>
        </header>

        {/* `minHeight: 0` is load-bearing: a flex child defaults to
            `min-height: auto`, so without it this refuses to shrink below its
            content, pushes the dialog past its own `maxHeight`, and — because
            the backdrop centres it — the overflow is split top and bottom,
            clipping the header off-screen. */}
        <div style={{ overflowY: 'auto', padding: '18px 20px', flex: 1, minHeight: 0 }}>
          {tab === 'new'
            ? (
              <ComposeTab
                title={title}
                onTitle={setTitle}
                note={note}
                onNote={setNote}
                noteRef={noteRef}
                severity={severity}
                onSeverity={setSeverity}
                capturing={reporter.capturing}
                snapshot={snapshot}
                onRecapture={reporter.recapture}
                unstored={unstored}
                onFlash={showFlash}
              />
            )
            : (
              <SavedTab
                saved={saved}
                selected={selected}
                onSelect={handleSelect}
                onDelete={handleDelete}
                onFlash={showFlash}
              />
            )}
        </div>

        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px',
            borderTop: '1px solid var(--border-accent)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
            {flash ?? (tab === 'new' ? 'Captured automatically — screen state, pattern config, canvas, console.' : '')}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" onClick={reporter.close} style={buttonStyle(false)}>Close</button>
            {tab === 'new' && (
              <>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!note.trim() || !snapshot}
                  style={buttonStyle(false, !note.trim() || !snapshot)}
                >
                  Save report
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveAndCopy()}
                  disabled={!note.trim() || !snapshot}
                  style={buttonStyle(true, !note.trim() || !snapshot)}
                >
                  Save &amp; copy
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ── New report ─────────────────────────────────────────────────────────── */

interface ComposeProps {
  title: string
  onTitle: (v: string) => void
  note: string
  onNote: (v: string) => void
  noteRef: React.Ref<HTMLTextAreaElement>
  severity: BugSeverity
  onSeverity: (v: BugSeverity) => void
  capturing: boolean
  snapshot: BugCaptureSnapshot | null
  onRecapture: () => void
  /** Set when the store refused the last save — see `UnstoredBanner`. */
  unstored: BugReport | null
  onFlash: (msg: string) => void
}

function ComposeTab({
  title, onTitle, note, onNote, noteRef, severity, onSeverity, capturing, snapshot, onRecapture,
  unstored, onFlash,
}: ComposeProps) {
  const summary = summarisePatternConfig(snapshot?.config)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {unstored && <UnstoredBanner report={unstored} onFlash={onFlash} />}
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ flex: 1, ...fieldWrapStyle }}>
          <span style={fieldLabelStyle}>Title</span>
          <input
            type="text"
            value={title}
            onChange={e => onTitle(e.target.value)}
            placeholder="Short summary (optional)"
            style={inputStyle}
          />
        </label>
        <label style={{ width: 220, ...fieldWrapStyle }}>
          <span style={fieldLabelStyle}>Severity</span>
          <select
            value={severity}
            onChange={e => onSeverity(e.target.value as BugSeverity)}
            style={inputStyle}
          >
            {BUG_SEVERITIES.map(s => <option key={s} value={s}>{BUG_SEVERITY_LABELS[s]}</option>)}
          </select>
        </label>
      </div>

      <label style={fieldWrapStyle}>
        <span style={fieldLabelStyle}>What happened</span>
        <textarea
          ref={noteRef}
          value={note}
          onChange={e => onNote(e.target.value)}
          rows={6}
          placeholder="What you did, what you expected, what you got instead."
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </label>

      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <h3 style={subHeadingStyle}>Captured with this report</h3>
          <button type="button" onClick={onRecapture} style={linkButtonStyle}>Recapture</button>
        </div>

        {!snapshot
          ? <p style={mutedStyle}>Capturing…</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Screenshot dataUrl={snapshot.screenshot} capturing={capturing} />
              {snapshot.screen && (
                <FactTable
                  heading={`Screen — ${snapshot.screen.screen}`}
                  rows={snapshot.screen.facts.map(f => [f.label, f.value])}
                />
              )}
              {summary && <FactTable heading="Pattern" rows={configSummaryRows(summary)} />}
              <p style={mutedStyle}>
                {snapshot.console.length
                  ? `${snapshot.console.length} console error/warning${snapshot.console.length === 1 ? '' : 's'} attached.`
                  : 'No console errors or warnings recorded.'}
                {snapshot.config ? ' Full pattern config attached.' : ' No pattern config on this screen.'}
              </p>
            </div>
          )}
      </section>
    </div>
  )
}

/**
 * Shown when the store refused a save. The report is gone the moment this
 * panel closes, so the only useful thing to offer is an immediate way out —
 * a download, which needs no permission and cannot be silently blocked the
 * way the clipboard can.
 */
function UnstoredBanner({ report, onFlash }: { report: BugReport; onFlash: (msg: string) => void }) {
  return (
    <div style={{ border: '1px solid var(--accent)', background: 'var(--accent-bg)', padding: '10px 12px' }}>
      <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)' }}>
        <strong>This report was not stored.</strong> Browser storage refused the write — it may be full,
        blocked in a private window, or unavailable. Export it now; closing this panel loses it.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={buttonStyle(true)} onClick={() => downloadReportJson(report)}>
          Download JSON
        </button>
        <button type="button" style={buttonStyle(false)} onClick={() => downloadReportMarkdown(report)}>
          Download .md
        </button>
        <button
          type="button"
          style={buttonStyle(false)}
          onClick={() => void copyReportMarkdown(report).then(ok => {
            if (ok) onFlash('Markdown copied — paste it somewhere now')
            else { downloadReportMarkdown(report); onFlash('Clipboard blocked — downloaded instead') }
          })}
        >
          Copy Markdown
        </button>
      </div>
    </div>
  )
}

function Screenshot({ dataUrl, capturing }: { dataUrl: string | null; capturing: boolean }) {
  if (capturing) return <p style={mutedStyle}>Rendering canvas screenshot…</p>
  if (!dataUrl) return <p style={mutedStyle}>No pattern canvas on this screen — no screenshot captured.</p>
  return (
    <img
      src={dataUrl}
      alt="Captured pattern canvas"
      style={{
        display: 'block',
        width: '100%',
        maxHeight: 260,
        objectFit: 'contain',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-input)',
      }}
    />
  )
}

/* ── Saved reports ──────────────────────────────────────────────────────── */

interface SavedProps {
  saved: BugReportMeta[]
  selected: BugReport | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onFlash: (msg: string) => void
}

function SavedTab({ saved, selected, onSelect, onDelete, onFlash }: SavedProps) {
  if (saved.length === 0) return <p style={mutedStyle}>No reports filed yet.</p>

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: 280, flexShrink: 0 }}>
        {saved.map(meta => (
          <li key={meta.id}>
            <button
              type="button"
              onClick={() => onSelect(meta.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                marginBottom: 4,
                cursor: 'pointer',
                background: selected?.id === meta.id ? 'var(--accent-bg)' : 'transparent',
                border: `1px solid ${selected?.id === meta.id ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                color: 'var(--text)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
              }}
            >
              <span style={{ display: 'block' }}>{meta.title}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                {new Date(meta.createdAt).toLocaleString()} · {meta.severity}
                {meta.hasScreenshot ? ' · 📷' : ''}
                {meta.console.length ? ` · ${meta.console.length} log` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!selected
          ? <p style={mutedStyle}>Pick a report to preview and export it.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  style={buttonStyle(true)}
                  onClick={() => void copyReportMarkdown(selected).then(ok => {
                    if (ok) onFlash('Markdown copied')
                    else { downloadReportMarkdown(selected); onFlash('Clipboard blocked — downloaded instead') }
                  })}
                >
                  Copy Markdown
                </button>
                <button type="button" style={buttonStyle(false)} onClick={() => downloadReportJson(selected)}>
                  Download JSON
                </button>
                <button type="button" style={buttonStyle(false)} onClick={() => downloadReportMarkdown(selected)}>
                  Download .md
                </button>
                <button
                  type="button"
                  style={buttonStyle(false, !selected.screenshot)}
                  disabled={!selected.screenshot}
                  onClick={() => downloadReportScreenshot(selected)}
                >
                  Download PNG
                </button>
                <button type="button" style={buttonStyle(false)} onClick={() => onDelete(selected.id)}>
                  Delete
                </button>
              </div>
              {selected.screenshot && <Screenshot dataUrl={selected.screenshot} capturing={false} />}
              <pre
                style={{
                  margin: 0,
                  maxHeight: 300,
                  overflow: 'auto',
                  padding: 10,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {bugReportMarkdown(selected, { includeConfigJson: false })}
              </pre>
            </div>
          )}
      </div>
    </div>
  )
}

/* ── Shared bits ────────────────────────────────────────────────────────── */

function FactTable({ heading, rows }: { heading: string; rows: [string, string][] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <h4 style={{ ...subHeadingStyle, marginBottom: 6 }}>{heading}</h4>
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, max-content) 1fr',
          gap: '2px 14px',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
        }}
      >
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
            <dd style={{ margin: 0, color: 'var(--text)', wordBreak: 'break-word' }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Flatten a `ConfigSummary` into the rows the panel shows. Kept next to the
 *  table it feeds — the Markdown renderer has its own, richer version. */
export function configSummaryRows(summary: ConfigSummary): [string, string][] {
  const rows: [string, string][] = [
    ['Substrate', summary.substrate === 'patch' ? 'Builder Patch' : summary.substrate === 'legacy' ? 'Legacy tiling' : 'Nothing selected'],
    ['Tiling', summary.tiling],
  ]
  if (summary.configuration) rows.push(['Configuration', summary.configuration])
  if (summary.cells.length) {
    rows.push(['Cells', summary.cells.map(c => `${c.id} (${c.shape}, ${c.tiles} tiles, sym ${c.symmetry})`).join('; ')])
    rows.push(['Tiles total', String(summary.totalTiles)])
  }
  if (summary.guides) rows.push(['Guides', `${summary.guides}${summary.guideTiles ? ` (+${summary.guideTiles} world-space Tiles)` : ''}`])
  if (summary.frame) rows.push(['Frame', summary.frame])
  if (summary.morph) rows.push(['Morph', summary.morph])
  if (summary.decoration) rows.push(['Decoration', summary.decoration])
  if (summary.figures.length) {
    rows.push(['Figure recipes', summary.figures.map(f => `${f.tileTypeId}: θ ${f.contactAngle}°${f.extraSets.length ? ` +${f.extraSets.length} set(s)` : ''}`).join('; ')])
  }
  rows.push(['Strand', summary.strand])
  return rows
}

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
}

const subHeadingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
}

const fieldWrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 }

const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  color: 'var(--text)',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)',
  outline: 'none',
  boxSizing: 'border-box',
}

const mutedStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  color: 'var(--text-muted)',
}

const closeButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 2px',
}

const linkButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: 'var(--accent)',
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  textDecoration: 'underline',
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px',
        cursor: 'pointer',
        fontFamily: 'var(--font-display)',
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
      }}
    >
      {children}
    </button>
  )
}

function buttonStyle(primary: boolean, disabled = false): CSSProperties {
  return {
    padding: '6px 14px',
    fontFamily: 'var(--font-display)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-subtle)'}`,
    background: primary ? 'var(--accent-bg)' : 'transparent',
    color: primary ? 'var(--accent)' : 'var(--text-muted)',
    opacity: disabled ? 0.4 : 1,
    transition: 'all 0.15s',
  }
}

export { FactTable }
