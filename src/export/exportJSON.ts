import type { PatternConfig } from '../types/pattern'
import { ConfigValidationError, CURRENT_PATTERN_CONFIG_VERSION, loadPatternConfig } from '../state/configValidation'
import { downloadBlob } from './download'

/**
 * Write the working config to a `.json` file, stamped with the schema
 * generation that produced it — an exported file is the one carrier that can
 * outlive this build entirely, so it should say what wrote it rather than
 * import back as generation 0.
 */
export function saveJSON(config: PatternConfig) {
  const stamped: PatternConfig = { ...config, version: CURRENT_PATTERN_CONFIG_VERSION }
  const json = JSON.stringify(stamped, null, 2)
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
