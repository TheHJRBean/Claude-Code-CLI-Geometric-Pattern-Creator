import { describe, it, expect, beforeEach } from 'vitest'
import { runPIC } from './index'
import { generateTiling } from '../tilings/archimedean'
import { generateTapratsTiling } from '../tilings/tapratsTiling'
import { TILINGS } from '../tilings/index'
import { DEFAULT_CONFIG } from '../state/defaults'
import { resetIds } from '../tilings/shared'
import type { PatternConfig } from '../types/pattern'
import type { Viewport } from '../tilings/archimedean'

beforeEach(() => resetIds())

const viewport: Viewport = { x: -200, y: -200, width: 400, height: 400 }

describe('runPIC — full pipeline integration', () => {
  it('produces segments for the default square tiling', () => {
    const polys = generateTiling(TILINGS['square'], viewport, DEFAULT_CONFIG.tiling.scale)
    const segs = runPIC(polys, DEFAULT_CONFIG)
    // Critical: must produce at least one segment, or the canvas is blank
    expect(segs.length).toBeGreaterThan(0)
  })

  it('produces segments for hexagonal tiling', () => {
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'hexagonal', scale: 80 },
      figures: { 6: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 } },
    }
    const polys = generateTiling(TILINGS['hexagonal'], viewport, config.tiling.scale)
    const segs = runPIC(polys, config)
    expect(segs.length).toBeGreaterThan(0)
  })

  it('produces segments for triangular tiling', () => {
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'triangular', scale: 60 },
      figures: { 3: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 60 } },
    }
    const polys = generateTiling(TILINGS['triangular'], viewport, config.tiling.scale)
    const segs = runPIC(polys, config)
    expect(segs.length).toBeGreaterThan(0)
  })

  it('produces segments for 4.8.8 tiling', () => {
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: '4.8.8', scale: 60 },
      figures: {
        4: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 45 },
        8: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 67.5 },
      },
    }
    const polys = generateTiling(TILINGS['4.8.8'], viewport, config.tiling.scale)
    const segs = runPIC(polys, config)
    expect(segs.length).toBeGreaterThan(0)
  })

  it('skips polygons with no figure config', () => {
    const polys = generateTiling(TILINGS['square'], viewport, 100)
    // Empty figures — no polygon types configured
    const emptyConfig: PatternConfig = { ...DEFAULT_CONFIG, figures: {} }
    const segs = runPIC(polys, emptyConfig)
    expect(segs.length).toBe(0)
  })

  it('segment count scales with number of polygons', () => {
    // Small viewport → fewer polygons → fewer segments
    const vpSmall: Viewport = { x: -50, y: -50, width: 100, height: 100 }
    const vpLarge: Viewport = { x: -300, y: -300, width: 600, height: 600 }
    const polysSmall = generateTiling(TILINGS['square'], vpSmall, 100)
    const polysLarge = generateTiling(TILINGS['square'], vpLarge, 100)
    const segsSmall = runPIC(polysSmall, DEFAULT_CONFIG)
    const segsLarge = runPIC(polysLarge, DEFAULT_CONFIG)
    expect(segsLarge.length).toBeGreaterThan(segsSmall.length)
  })

  it('all segment endpoints have finite coordinates', () => {
    const polys = generateTiling(TILINGS['square'], viewport, 100)
    const segs = runPIC(polys, DEFAULT_CONFIG)
    for (const seg of segs) {
      expect(isFinite(seg.from.x)).toBe(true)
      expect(isFinite(seg.from.y)).toBe(true)
      expect(isFinite(seg.to.x)).toBe(true)
      expect(isFinite(seg.to.y)).toBe(true)
    }
  })

  // Regression: irregular-polygon Cairo at θ in the working range emits
  // rays from every edge (10 origin keys).
  it('Cairo pentagonal — every edge contributes rays at θ=22°', () => {
    const vp: Viewport = { x: -50, y: -50, width: 100, height: 100 }
    const polys = generateTapratsTiling('cairo-pentagonal', vp, 50)
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'cairo-pentagonal', scale: 50 },
      figures: { '5': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 22 } },
    }
    const segs = runPIC(polys, config)
    const poly = polys[0]
    if (!poly) throw new Error('no Cairo polygon generated')
    const polySegs = segs.filter(s => s.polygonId === poly.id && s.kind === 'star-arm')
    const originKeys = new Set(polySegs.map(s => `${Math.round(s.edgeMidpoint.x * 1e3)},${Math.round(s.edgeMidpoint.y * 1e3)}|${s.side}`))
    expect(originKeys.size).toBeGreaterThanOrEqual(10)
  })

  // Regression: in the degenerate θ band (25-32°), Cairo's short edge
  // orphan rays emit as tiny stubs (~1.6 units from the midpoint) and the
  // V0/V4 asymmetric forwards meet at an offset point ~1.6 units inside
  // the short edge midpoint. Both artifacts get filtered: stub by
  // length, offset-meeting by endpoint-near-non-self-edge. The 3 working
  // pair-A vertices (V1, V2, V3) still emit, giving 6 origin keys; every
  // emitted segment is substantially longer than the artifact threshold.
  it('Cairo pentagonal — degenerate θ drops artifacts, keeps working pairs', () => {
    const vp: Viewport = { x: -50, y: -50, width: 100, height: 100 }
    const polys = generateTapratsTiling('cairo-pentagonal', vp, 50)
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'cairo-pentagonal', scale: 50 },
      figures: { '5': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 27.5 } },
    }
    const segs = runPIC(polys, config)
    const poly = polys[0]
    if (!poly) throw new Error('no Cairo polygon generated')
    const polySegs = segs.filter(s => s.polygonId === poly.id && s.kind === 'star-arm')
    const originKeys = new Set(polySegs.map(s => `${Math.round(s.edgeMidpoint.x * 1e3)},${Math.round(s.edgeMidpoint.y * 1e3)}|${s.side}`))
    expect(originKeys.size).toBeGreaterThanOrEqual(6)
    for (const seg of polySegs) {
      const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y)
      expect(len).toBeGreaterThan(5)
    }
  })
})
