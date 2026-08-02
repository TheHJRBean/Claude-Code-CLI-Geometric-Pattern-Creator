import { downloadBlob } from '../export/download'
import { bugReportFilename, bugReportMarkdown } from './report'
import type { BugReport } from './types'

/**
 * What a filed report can be turned into: a JSON bundle, a Markdown file, a
 * PNG, or the clipboard.
 *
 * The three outputs exist because reports are consumed three ways — pasted
 * into a triage session (Markdown, clipboard), attached to a GitHub issue
 * (`.md` + `.png`), or reloaded to reproduce the state (JSON, which carries
 * the verbatim `PatternConfig` the Lab's Load JSON already understands).
 */

/**
 * What to tell the user after a save attempt.
 *
 * The failure string is load-bearing and was wrong in the first cut: it said
 * "saved to this session only", which reads as *partly* safe. Nothing retains
 * a report whose store write failed — it lives in one closure and dies with
 * the panel. A message that understates the loss is worse than none, because
 * it is precisely the moment the user could still rescue the report by
 * exporting it.
 */
export function saveOutcomeMessage(stored: boolean): string {
  return stored
    ? 'Report saved'
    : 'NOT stored — browser storage refused the write. Export it now or it is lost.'
}

/** Decode a `data:` URL to a Blob. Returns null on anything malformed —
 *  callers treat that as "no screenshot" rather than failing the download. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const [, mime, base64, payload] = match
  try {
    if (!base64) return new Blob([decodeURIComponent(payload)], { type: mime })
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  } catch {
    return null
  }
}

/** The full report as JSON — screenshot data URL included, so the bundle is a
 *  single self-contained file. */
export function downloadReportJson(report: BugReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  downloadBlob(blob, bugReportFilename(report, 'json'))
}

export function downloadReportMarkdown(report: BugReport): void {
  const blob = new Blob([bugReportMarkdown(report)], { type: 'text/markdown' })
  downloadBlob(blob, bugReportFilename(report, 'md'))
}

/** No-op when the report has no screenshot. */
export function downloadReportScreenshot(report: BugReport): void {
  if (!report.screenshot) return
  const blob = dataUrlToBlob(report.screenshot)
  if (blob) downloadBlob(blob, bugReportFilename(report, 'png'))
}

/**
 * Copy the report's Markdown to the clipboard. Resolves false when the
 * Clipboard API is unavailable or denied (insecure context, permission
 * refused) so the caller can fall back to a download.
 */
export async function copyReportMarkdown(report: BugReport, opts?: { includeConfigJson?: boolean }): Promise<boolean> {
  const text = bugReportMarkdown(report, opts)
  try {
    if (!navigator.clipboard) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
