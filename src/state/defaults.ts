import type { PatternConfig } from '../types/pattern'

export const DEFAULT_CONFIG: PatternConfig = {
  tiling: {
    type: 'square',
    scale: 100,
  },
  figures: {
    4: { type: 'star', contactAngle: 67.5, lineLength: 1.0, autoLineLength: true },
  },
  strand: {
    width: 4,
    color: '#1a1a2e',
    background: '#f5f0e8',
  },
}
