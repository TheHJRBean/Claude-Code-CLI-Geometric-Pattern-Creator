import type { PatternConfig } from '../types/pattern'

export const DEFAULT_CONFIG: PatternConfig = {
  tiling: {
    type: 'square',
    scale: 100,
  },
  figures: {
    4: { type: 'star', contactAngle: 67.5 },
  },
  lacing: {
    enabled: false,
    strandWidth: 4,
    gapWidth: 3,
    strandColor: '#1a1a2e',
    gapColor: '#f5f0e8',
  },
}
