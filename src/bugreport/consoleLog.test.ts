import { describe, it, expect, beforeEach } from 'vitest'
import {
  CONSOLE_BUFFER_LIMIT,
  CONSOLE_ENTRY_MAX_CHARS,
  clearConsoleEntries,
  formatConsoleArg,
  formatConsoleArgs,
  recentConsoleEntries,
  recordConsoleEntry,
} from './consoleLog'

beforeEach(() => clearConsoleEntries())

describe('formatConsoleArg', () => {
  it('keeps strings verbatim', () => {
    expect(formatConsoleArg('plain')).toBe('plain')
  })

  it('renders an Error with its stack — the whole point of capturing one', () => {
    const err = new Error('boom')
    const text = formatConsoleArg(err)
    expect(text).toContain('Error: boom')
    expect(text).toContain('at ')
  })

  it('serialises plain objects', () => {
    expect(formatConsoleArg({ a: 1 })).toBe('{"a":1}')
  })

  it('degrades to the constructor name on a cyclic object instead of throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(formatConsoleArg(cyclic)).toBe('[Object]')
  })

  it('distinguishes null from undefined', () => {
    expect(formatConsoleArg(null)).toBe('null')
    expect(formatConsoleArg(undefined)).toBe('undefined')
  })

  it('joins multiple args the way console does', () => {
    expect(formatConsoleArgs(['count', 3])).toBe('count 3')
  })
})

describe('the ring buffer', () => {
  it('keeps entries oldest-first', () => {
    recordConsoleEntry({ level: 'warn', source: 'console', text: 'first' })
    recordConsoleEntry({ level: 'error', source: 'console', text: 'second' })
    expect(recentConsoleEntries().map(e => e.text)).toEqual(['first', 'second'])
  })

  it('drops the oldest past the cap, so a render loop cannot crowd out the rest', () => {
    for (let i = 0; i < CONSOLE_BUFFER_LIMIT + 10; i++) {
      recordConsoleEntry({ level: 'error', source: 'console', text: `entry ${i}` })
    }
    const entries = recentConsoleEntries()
    expect(entries).toHaveLength(CONSOLE_BUFFER_LIMIT)
    expect(entries[0].text).toBe('entry 10')
    expect(entries[entries.length - 1].text).toBe(`entry ${CONSOLE_BUFFER_LIMIT + 9}`)
  })

  it('truncates one huge entry rather than letting it bloat the report', () => {
    recordConsoleEntry({ level: 'error', source: 'console', text: 'x'.repeat(CONSOLE_ENTRY_MAX_CHARS + 500) })
    const [entry] = recentConsoleEntries()
    expect(entry.text.length).toBeLessThan(CONSOLE_ENTRY_MAX_CHARS + 50)
    expect(entry.text).toMatch(/truncated\)$/)
  })

  it('returns a copy, so a caller cannot mutate the buffer', () => {
    recordConsoleEntry({ level: 'error', source: 'console', text: 'kept' })
    recentConsoleEntries().push({ at: 'x', level: 'error', source: 'console', text: 'injected' })
    expect(recentConsoleEntries()).toHaveLength(1)
  })

  it('stamps a timestamp when none is given', () => {
    recordConsoleEntry({ level: 'warn', source: 'window', text: 'stamped' })
    expect(recentConsoleEntries()[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
