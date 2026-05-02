import type { CompositionConfig, MandalaConfig, PatternConfig } from '../types/pattern'
import { TILINGS } from '../tilings/index'

export interface LabPreset {
  id: string
  label: string
  category: 'archimedean' | 'rosette-patch' | 'mandala' | 'composition'
  config: PatternConfig
}

const baseLacing: PatternConfig['lacing'] = {
  enabled: false,
  strandWidth: 4,
  gapWidth: 3,
  strandColor: '#1a1a2e',
  gapColor: '#f5f0e8',
}

function tessellationPreset(
  tilingName: string,
  label: string,
  scale: number,
): LabPreset {
  const def = TILINGS[tilingName]
  if (!def) {
    throw new Error(`labPresets: unknown tiling "${tilingName}"`)
  }
  return {
    id: `tess.${tilingName}`,
    label,
    category: def.category,
    config: {
      tiling: { type: tilingName, scale },
      figures: { ...(def.defaultConfig.figures ?? {}) },
      lacing: { ...baseLacing },
    },
  }
}

function mandalaPreset(
  id: string,
  label: string,
  scale: number,
  mandala: MandalaConfig,
): LabPreset {
  const def = TILINGS['layered-mandala']
  if (!def) {
    throw new Error('labPresets: layered-mandala tiling missing')
  }
  return {
    id: `mandala.${id}`,
    label,
    category: 'mandala',
    config: {
      tiling: { type: 'layered-mandala', scale },
      figures: { ...(def.defaultConfig.figures ?? {}) },
      lacing: { ...baseLacing },
      mandala,
    },
  }
}

function compositionPreset(
  id: string,
  label: string,
  composition: CompositionConfig,
): LabPreset {
  const def = TILINGS['composition']
  if (!def) {
    throw new Error('labPresets: composition tiling missing')
  }
  const centreFigures = TILINGS[composition.centre]?.defaultConfig.figures ?? {}
  const backgroundFigures = TILINGS[composition.background]?.defaultConfig.figures ?? {}
  return {
    id: `composition.${id}`,
    label,
    category: 'composition',
    config: {
      tiling: { type: 'composition', scale: 100 },
      // Centre's defaults take priority on tile-type collisions — the
      // centre is the focal point of a composition.
      figures: { ...backgroundFigures, ...centreFigures },
      lacing: { ...baseLacing },
      composition,
    },
  }
}

/**
 * v1 catalogue — tessellation-named only. No strand-pattern names like
 * "Khatem Sulemani" until those become composable in later steps.
 */
export const LAB_PRESETS: LabPreset[] = [
  tessellationPreset('square', 'Square (4,4)', 100),
  tessellationPreset('4.8.8', 'Square-Octagon (4.8.8)', 100),
  tessellationPreset('hexagonal', 'Hexagonal (6,3)', 100),
  tessellationPreset('3.6.3.6', 'Trihexagonal (3.6.3.6)', 100),
  tessellationPreset('4.6.12', 'Truncated Hex (4.6.12)', 90),
  tessellationPreset('3.12.12', 'Triakis Trunc Hex (3.12.12)', 90),
  tessellationPreset('decagonal-rosette', 'Decagonal Rosette', 90),
  tessellationPreset('hexadecagonal-rosette', 'Hexadecagonal Rosette', 90),
  mandalaPreset('octagonal-8-4', 'Octagonal (8+4)', 250, {
    outerFold: 8,
    layers: [{ fold: 4, scale: 0.55 }],
  }),
  mandalaPreset('hexagonal-12-6-3', 'Hexagonal (12+6+3)', 250, {
    outerFold: 12,
    layers: [
      { fold: 6, scale: 0.7 },
      { fold: 3, scale: 0.4 },
    ],
  }),
  mandalaPreset('sultan-hassan-16-8-4', 'Sultan Hassan (16+8+4)', 250, {
    outerFold: 16,
    layers: [
      { fold: 8, scale: 0.7 },
      { fold: 4, scale: 0.4 },
    ],
  }),
  mandalaPreset('decagonal-10-5', 'Decagonal (10+5)', 250, {
    outerFold: 10,
    layers: [{ fold: 5, scale: 0.55 }],
  }),
  compositionPreset('16-in-4.8.8', '16-gon in 4.8.8', {
    centre: 'hexadecagonal-rosette',
    background: '4.8.8',
    centreScale: 90,
    backgroundScale: 100,
    regionRadius: 280,
    frameEnabled: true,
    frameColor: 'var(--accent)',
  }),
  compositionPreset('12-in-hexagonal', '12-gon in Hexagonal', {
    centre: '4.6.12',
    background: 'hexagonal',
    centreScale: 80,
    backgroundScale: 110,
    regionRadius: 260,
    frameEnabled: true,
    frameColor: 'var(--accent)',
  }),
  compositionPreset('16-in-square', '16-gon in Square', {
    centre: 'hexadecagonal-rosette',
    background: 'square',
    centreScale: 90,
    backgroundScale: 90,
    regionRadius: 260,
    frameEnabled: true,
    frameColor: 'var(--accent)',
  }),
  compositionPreset('10-in-hexagonal', '10-gon in Hexagonal', {
    centre: 'decagonal-rosette',
    background: 'hexagonal',
    centreScale: 80,
    backgroundScale: 110,
    regionRadius: 240,
    frameEnabled: true,
    frameColor: 'var(--accent)',
  }),
]

export const LAB_PRESETS_BY_ID: Record<string, LabPreset> = Object.fromEntries(
  LAB_PRESETS.map(p => [p.id, p]),
)
