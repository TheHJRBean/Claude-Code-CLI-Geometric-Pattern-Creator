import { describe, it, expect } from 'vitest'
import type { PatternConfig } from '../types/pattern'
import { buildBugReport, bugReportFilename, bugReportMarkdown, toMeta } from './report'
import type { BugEnvironment, BugReport } from './types'

const env: BugEnvironment = {
  commit: 'e9cc71f: docs: SESSION_STATE',
  appMode: 'lab',
  theme: 'dark',
  userAgent: 'TestAgent/1.0',
  viewport: { width: 1440, height: 900 },
  devicePixelRatio: 2,
  timeZone: 'Europe/London',
}

const config: PatternConfig = {
  version: 1,
  tiling: { type: '4.8.8', scale: 100 },
  figures: { '8': { type: 'star', contactAngle: 67.5, lineLength: 1, autoLineLength: true } },
  strand: { width: 4, color: '#111', background: '#eee' },
}

function report(over: Partial<Parameters<typeof buildBugReport>[0]> = {}): BugReport {
  return buildBugReport({
    title: 'Strands vanish at θ 45',
    note: 'Set the square to 45° and the strands disappeared.',
    severity: 'major',
    env,
    screen: { screen: 'Lab', facts: [{ label: 'Phase', value: 'Composition' }] },
    config,
    screenshot: null,
    console: [],
    now: new Date('2026-08-02T09:15:00.000Z'),
    idSuffix: 'abc123',
    ...over,
  })
}

describe('buildBugReport', () => {
  it('stamps a sortable id and derives the config summary', () => {
    const r = report()
    expect(r.id).toBe('bug-2026-08-02T09-15-00-000Z-abc123')
    expect(r.createdAt).toBe('2026-08-02T09:15:00.000Z')
    expect(r.configSummary?.tiling).toBe('4.8.8')
  })

  it('keeps an untitled report rather than rejecting it — the note carries it', () => {
    expect(report({ title: '   ' }).title).toBe('Untitled report')
  })

  it('trims the note and title', () => {
    const r = report({ title: '  spacey  ', note: '  padded  ' })
    expect(r.title).toBe('spacey')
    expect(r.note).toBe('padded')
  })

  it('tolerates a screen with no config (the Gallery)', () => {
    const r = report({ config: null, screen: { screen: 'Gallery', facts: [] } })
    expect(r.config).toBeNull()
    expect(r.configSummary).toBeNull()
  })
})

describe('bugReportMarkdown', () => {
  it('leads with the note, then screen, then pattern', () => {
    const md = bugReportMarkdown(report(), { includeConfigJson: false })
    expect(md.indexOf('## What happened')).toBeLessThan(md.indexOf('## Screen — Lab'))
    expect(md.indexOf('## Screen — Lab')).toBeLessThan(md.indexOf('## Pattern'))
    expect(md).toContain('Set the square to 45° and the strands disappeared.')
    expect(md).toContain('| Phase | Composition |')
    expect(md).toContain('e9cc71f')
  })

  it('renders a Figure-recipe row per tile type', () => {
    const md = bugReportMarkdown(report(), { includeConfigJson: false })
    expect(md).toContain('### Figure recipes')
    expect(md).toContain('| 8 | 67.5° | auto | yes | no |')
  })

  it('embeds the config JSON only when asked', () => {
    expect(bugReportMarkdown(report())).toContain('<details><summary>Full PatternConfig JSON</summary>')
    expect(bugReportMarkdown(report(), { includeConfigJson: false })).not.toContain('PatternConfig JSON')
  })

  it('escapes pipes so a value cannot break the table', () => {
    const md = bugReportMarkdown(
      report({ screen: { screen: 'Lab', facts: [{ label: 'Overlays', value: 'a | b' }] } }),
      { includeConfigJson: false },
    )
    expect(md).toContain('| Overlays | a \\| b |')
  })

  it('says plainly when nothing was captured', () => {
    const md = bugReportMarkdown(report({ console: [], screenshot: null }), { includeConfigJson: false })
    expect(md).toContain('_Not captured._')
    expect(md).not.toContain('## Console')
  })

  it('includes the console log when there is one', () => {
    const md = bugReportMarkdown(report({
      console: [{ at: '2026-08-02T09:14:00.000Z', level: 'error', source: 'console', text: 'boom' }],
    }), { includeConfigJson: false })
    expect(md).toContain('## Console (1)')
    expect(md).toContain('[error/console] 2026-08-02T09:14:00.000Z — boom')
  })

  it('handles a note-only report from a screen that contributed nothing', () => {
    const md = bugReportMarkdown(
      report({ screen: null, config: null, note: 'it broke' }),
      { includeConfigJson: false },
    )
    expect(md).toContain('it broke')
    expect(md).not.toContain('## Pattern')
    // Falls back to the app mode so the workspace row is never blank.
    expect(md).toContain('| Workspace | lab |')
  })
})

describe('bugReportFilename', () => {
  it('slugs the title and keeps the id prefix', () => {
    expect(bugReportFilename(report(), 'md')).toBe('bug-2026-08-02T09-15-00-000Z-abc123-strands-vanish-at-45.md')
  })

  it('falls back when a title slugs to nothing', () => {
    // '???' survives the title trim (it is non-empty) but slugs to nothing,
    // so the filename — not the title — takes the fallback.
    expect(bugReportFilename(report({ title: '???' }), 'png')).toMatch(/-report\.png$/)
  })
})

describe('toMeta', () => {
  it('strips the screenshot but records that there was one', () => {
    const meta = toMeta(report({ screenshot: 'data:image/png;base64,AAAA' }))
    expect(meta.hasScreenshot).toBe(true)
    expect('screenshot' in meta).toBe(false)
  })
})
