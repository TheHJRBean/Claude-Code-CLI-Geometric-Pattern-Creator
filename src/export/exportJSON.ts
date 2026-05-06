import type { PatternConfig } from '../types/pattern'
import { ConfigValidationError, loadPatternConfig } from '../state/configValidation'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function saveJSON(config: PatternConfig) {
  const json = JSON.stringify(config, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, 'islamic-pattern.json')
}

export function loadJSON(): Promise<PatternConfig> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new Error('No file selected'))
      const reader = new FileReader()
      reader.onload = e => {
        let parsed: unknown
        try {
          parsed = JSON.parse(e.target!.result as string)
        } catch {
          return reject(new Error('Invalid JSON file'))
        }
        try {
          resolve(loadPatternConfig(parsed))
        } catch (err) {
          if (err instanceof ConfigValidationError) reject(err)
          else reject(new Error('Could not load pattern config.'))
        }
      }
      reader.readAsText(file)
    }
    input.click()
  })
}
