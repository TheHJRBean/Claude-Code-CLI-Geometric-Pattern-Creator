import type { PatternConfig } from '../types/pattern'
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
]

export const LAB_PRESETS_BY_ID: Record<string, LabPreset> = Object.fromEntries(
  LAB_PRESETS.map(p => [p.id, p]),
)
