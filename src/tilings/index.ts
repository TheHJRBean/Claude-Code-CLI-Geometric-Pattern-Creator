import type { TilingDefinition } from '../types/tiling'

export const TILINGS: Record<string, TilingDefinition> = {
  'square': {
    name: 'square',
    label: 'Square {4,4}',
    vertexConfig: [4, 4, 4, 4],
    seedSides: 4,
    defaultConfig: {
      figures: { 4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 } },
    },
  },
  'hexagonal': {
    name: 'hexagonal',
    label: 'Hexagonal {6,3}',
    vertexConfig: [6, 6, 6],
    seedSides: 6,
    defaultConfig: {
      figures: { 6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 } },
    },
  },
  'triangular': {
    name: 'triangular',
    label: 'Triangular {3,6}',
    vertexConfig: [3, 3, 3, 3, 3, 3],
    seedSides: 3,
    defaultConfig: {
      figures: { 3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 } },
    },
  },
  '4.8.8': {
    name: '4.8.8',
    label: 'Square-Octagon 4.8.8',
    vertexConfig: [4, 8, 8],
    seedSides: 8,
    defaultConfig: {
      figures: {
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45 },
        8: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
      },
    },
  },
  '3.4.6.4': {
    name: '3.4.6.4',
    label: 'Small Rhombitrihexagonal 3.4.6.4',
    vertexConfig: [3, 4, 6, 4],
    seedSides: 6,
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
      },
    },
  },
  '3.6.3.6': {
    name: '3.6.3.6',
    label: 'Trihexagonal 3.6.3.6',
    vertexConfig: [3, 6, 3, 6],
    seedSides: 6,
    defaultConfig: {
      figures: {
        3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
      },
    },
  },
  '3.12.12': {
    name: '3.12.12',
    label: 'Triakis Truncated Hexagonal 3.12.12',
    vertexConfig: [3, 12, 12],
    seedSides: 12,
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
    defaultConfig: {
      figures: {
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45 },
        6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 },
        12: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 75 },
      },
    },
  },
}

export const TILING_NAMES = Object.keys(TILINGS)
