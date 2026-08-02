import { describe, it, expect } from 'vitest'
import { dataUrlToBlob } from './actions'

describe('dataUrlToBlob', () => {
  it('decodes a base64 PNG data URL to a blob of the right type and length', async () => {
    // "hi" — 2 bytes, so a length check catches a base64 round-trip that
    // silently kept the encoded string instead of decoding it.
    const blob = dataUrlToBlob('data:image/png;base64,aGk=')!
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(2)
    expect(await blob.text()).toBe('hi')
  })

  it('decodes a non-base64 (percent-encoded) data URL', async () => {
    const blob = dataUrlToBlob('data:text/plain,hello%20world')!
    expect(await blob.text()).toBe('hello world')
  })

  it('returns null for anything that is not a data URL', () => {
    expect(dataUrlToBlob('https://example.com/x.png')).toBeNull()
    expect(dataUrlToBlob('')).toBeNull()
  })

  it('returns null on malformed base64 rather than throwing mid-download', () => {
    expect(dataUrlToBlob('data:image/png;base64,!!!not base64!!!')).toBeNull()
  })
})
