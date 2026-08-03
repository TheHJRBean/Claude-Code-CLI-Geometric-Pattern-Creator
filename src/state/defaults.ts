import type { PatternConfig } from '../types/pattern'

/**
 * The app's sandy paper tone — the canvas backdrop every substrate starts on,
 * the raster-export flatten colour, and the "Reset" target of the Decoration
 * panel's background control. One constant because the Decoration control made
 * `strand.background` user-editable: a second literal elsewhere would drift
 * into a Reset that doesn't match what a fresh pattern actually looks like.
 */
export const DEFAULT_CANVAS_BACKGROUND = '#f5f0e8'

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
    background: DEFAULT_CANVAS_BACKGROUND,
  },
}
