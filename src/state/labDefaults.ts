import type { PatternConfig } from '../types/pattern'

/**
 * Lab starts with no tessellation selected. Strands are off by default
 * (Lab focuses on the polygon tessellation; PIC overlay is opt-in).
 * Mandala config is omitted here; the reducer seeds DEFAULT_MANDALA_CONFIG
 * the first time `layered-mandala` is selected.
 */
export const LAB_DEFAULT_CONFIG: PatternConfig = {
  tiling: { type: '', scale: 100 },
  figures: {},
  lacing: {
    enabled: false,
    strandWidth: 4,
    gapWidth: 3,
    strandColor: '#1a1a2e',
    gapColor: '#f5f0e8',
  },
}
