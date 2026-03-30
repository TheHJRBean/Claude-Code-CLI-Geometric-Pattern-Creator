import type { TilingDefinition, SymmetryGroup } from '../types/tiling'

export const TILINGS: Record<string, TilingDefinition> = {
  // ── 3-fold ──────────────────────────────────────────
  'triangular': {
    name: 'triangular',
    label: 'Triangular {3,6}',
    vertexConfig: [3, 3, 3, 3, 3, 3],
    seedSides: 3,
    foldSymmetry: 3,
    category: 'archimedean',
    defaultConfig: {
      figures: { 3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 } },
    },
  },

  // ── 4-fold ──────────────────────────────────────────
  'square': {
    name: 'square',
    label: 'Square {4,4}',
    vertexConfig: [4, 4, 4, 4],
    seedSides: 4,
    foldSymmetry: 4,
    category: 'archimedean',
    defaultConfig: {
      figures: { 4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 } },
    },
  },
  '3.3.3.4.4': {
    name: '3.3.3.4.4',
    label: 'Elongated Triangular 3.3.3.4.4',
    vertexConfig: [3, 3, 3, 4, 4],
    seedSides: 4,
    foldSymmetry: 4,
    category: 'archimedean',
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
      },
    },
  },
  '3.3.4.3.4': {
    name: '3.3.4.3.4',
    label: 'Snub Square 3.3.4.3.4',
    vertexConfig: [3, 3, 4, 3, 4],
    seedSides: 4,
    foldSymmetry: 4,
    category: 'archimedean',
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
      },
    },
  },

  // ── 5-fold (rosette patch) ──────────────────────────
  'pentagonal-rosette': {
    name: 'pentagonal-rosette',
    label: 'Pentagonal Rosette',
    vertexConfig: [5, 4],
    seedSides: 5,
    foldSymmetry: 5,
    category: 'rosette-patch',
    tileTypes: [
      { id: '5', sides: 5, label: 'Pentagon' },
      { id: '4.1', sides: 4, label: '4-gon (thin rhombus)' },
      { id: '4.2', sides: 4, label: '4-gon (wide rhombus)' },
    ],
    defaultConfig: {
      figures: {
        '4.1': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
        '4.2': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
        '5': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 },
      },
    },
  },

  // ── 6-fold ──────────────────────────────────────────
  'hexagonal': {
    name: 'hexagonal',
    label: 'Hexagonal {6,3}',
    vertexConfig: [6, 6, 6],
    seedSides: 6,
    foldSymmetry: 6,
    category: 'archimedean',
    defaultConfig: {
      figures: { 6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 } },
    },
  },
  '3.3.3.3.6': {
    name: '3.3.3.3.6',
    label: 'Snub Hexagonal 3.3.3.3.6',
    vertexConfig: [3, 3, 3, 3, 6],
    seedSides: 6,
    foldSymmetry: 6,
    category: 'archimedean',
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
      },
    },
  },
  '3.4.6.4': {
    name: '3.4.6.4',
    label: 'Small Rhombitrihexagonal 3.4.6.4',
    vertexConfig: [3, 4, 6, 4],
    seedSides: 6,
    foldSymmetry: 6,
    category: 'archimedean',
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
      },
    },
  },
  '3.6.3.6': {
    name: '3.6.3.6',
    label: 'Trihexagonal 3.6.3.6',
    vertexConfig: [3, 6, 3, 6],
    seedSides: 6,
    foldSymmetry: 6,
    category: 'archimedean',
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
      },
    },
  },

  // ── 7-fold (rosette patch) ──────────────────────────
  'heptagonal-rosette': {
    name: 'heptagonal-rosette',
    label: 'Heptagonal Rosette',
    vertexConfig: [7, 5],
    seedSides: 7,
    foldSymmetry: 7,
    category: 'rosette-patch',
    defaultConfig: {
      figures: {
        5: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 },
        7: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 64.3 },
      },
    },
  },

  // ── 8-fold ──────────────────────────────────────────
  '4.8.8': {
    name: '4.8.8',
    label: 'Square-Octagon 4.8.8',
    vertexConfig: [4, 8, 8],
    seedSides: 8,
    foldSymmetry: 8,
    category: 'archimedean',
    defaultConfig: {
      figures: {
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
        8: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
      },
    },
  },

  // ── 9-fold (rosette patch) ──────────────────────────
  'nonagonal-rosette': {
    name: 'nonagonal-rosette',
    label: 'Nonagonal Rosette',
    vertexConfig: [9, 6, 5],
    seedSides: 9,
    foldSymmetry: 9,
    category: 'rosette-patch',
    defaultConfig: {
      figures: {
        5: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        9: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 70 },
      },
    },
  },

  // ── 10-fold (rosette patch) ─────────────────────────
  'decagonal-rosette': {
    name: 'decagonal-rosette',
    label: 'Decagonal Rosette (Girih)',
    vertexConfig: [10, 6, 4],
    seedSides: 10,
    foldSymmetry: 10,
    category: 'rosette-patch',
    tileTypes: [
      { id: '10', sides: 10, label: 'Decagon' },
      { id: '4', sides: 4, label: 'Rhombus' },
      { id: '6.1', sides: 6, label: '6-gon (bowtie)' },
      { id: '6.2', sides: 6, label: '6-gon (hexagon)' },
      { id: '6.3', sides: 6, label: '6-gon (elongated)' },
    ],
    defaultConfig: {
      figures: {
        '10': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 },
        '4': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 },
        '6.1': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 },
        '6.2': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 },
        '6.3': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 },
      },
    },
  },

  // ── 11-fold (rosette patch) ─────────────────────────
  'hendecagonal-rosette': {
    name: 'hendecagonal-rosette',
    label: 'Hendecagonal Rosette',
    vertexConfig: [11, 4, 3],
    seedSides: 11,
    foldSymmetry: 11,
    category: 'rosette-patch',
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 73.6 },
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 73.6 },
        11: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 73.6 },
      },
    },
  },

  // ── 12-fold ─────────────────────────────────────────
  '3.12.12': {
    name: '3.12.12',
    label: 'Triakis Truncated Hexagonal 3.12.12',
    vertexConfig: [3, 12, 12],
    seedSides: 12,
    foldSymmetry: 12,
    category: 'archimedean',
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        12: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 75 },
      },
    },
  },
  '4.6.12': {
    name: '4.6.12',
    label: 'Truncated Hexagonal 4.6.12',
    vertexConfig: [4, 6, 12],
    seedSides: 12,
    foldSymmetry: 12,
    category: 'archimedean',
    defaultConfig: {
      figures: {
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        12: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 75 },
      },
    },
  },
}

export const TILING_NAMES = Object.keys(TILINGS)

export const SYMMETRY_GROUPS: SymmetryGroup[] = [
  { fold: 3,  label: '3-fold',  tilings: ['triangular'] },
  { fold: 4,  label: '4-fold',  tilings: ['square', '3.3.3.4.4', '3.3.4.3.4'] },
  { fold: 5,  label: '5-fold',  tilings: ['pentagonal-rosette'] },
  { fold: 6,  label: '6-fold',  tilings: ['hexagonal', '3.3.3.3.6', '3.4.6.4', '3.6.3.6'] },
  { fold: 7,  label: '7-fold',  tilings: ['heptagonal-rosette'] },
  { fold: 8,  label: '8-fold',  tilings: ['4.8.8'] },
  { fold: 9,  label: '9-fold',  tilings: ['nonagonal-rosette'] },
  { fold: 10, label: '10-fold', tilings: ['decagonal-rosette'] },
  { fold: 11, label: '11-fold', tilings: ['hendecagonal-rosette'] },
  { fold: 12, label: '12-fold', tilings: ['3.12.12', '4.6.12'] },
]
