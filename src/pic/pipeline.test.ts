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
  // asymmetric vertices (V0/V4) trigger the asymmetric-edge-slide path:
  // the forward ray (e.g. e0.plus) is clipped to the polygon boundary
  // and a short slide along that boundary lands on the partner ray's
  // edge midpoint — closing the gap that would otherwise leave the
  // strand disconnected from the next tile's ray. Long edges contribute
  // their full pair-A rays via V1/V2/V3. Each strand piece (sum of
  // segments per origin midpoint + side) is substantive — no tiny
  // dangling stubs.
  // Regression: Bug 2 (2026-05-21). The nonagonal-rosette 5-gon is
  // concave (V2 is a reflex vertex). At θ=54° the natural pair-A meeting
  // at one vertex fell outside the polygon; the previous edge-slide
  // implementation clipped the forward ray at the FIRST boundary
  // crossing — which on a concave polygon could be the reflex notch on
  // the far side — and drew the slide straight across the polygon
  // interior (a 49-unit chord on a polygon of comparable diameter).
  // Same-edge slide guard now suppresses any slide whose clip edge ≠
  // back-ray edge.
  it('nonagonal-rosette 5-gon — no slide segment cuts across the polygon at θ=54°', () => {
    const vp: Viewport = { x: -300, y: -300, width: 600, height: 600 }
    const polys = generateTapratsTiling('nonagonal-rosette', vp, 50)
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'nonagonal-rosette', scale: 50 },
      figures: { '5': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 54 } },
    }
    const segs = runPIC(polys, config)
    const pentagons = polys.filter(p => p.sides === 5)
    expect(pentagons.length).toBeGreaterThan(0)
    for (const poly of pentagons) {
      // Polygon diameter: max pairwise distance between vertices.
      let diameter = 0
      for (let i = 0; i < poly.vertices.length; i++) {
        for (let j = i + 1; j < poly.vertices.length; j++) {
          const dx = poly.vertices[i].x - poly.vertices[j].x
          const dy = poly.vertices[i].y - poly.vertices[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d > diameter) diameter = d
        }
      }
      // No emitted segment should span more than 60% of the polygon's
      // diameter. Pre-fix, the cross-polygon slide on this 5-gon ran ~49
      // units (~64% of its 76-unit diameter). Post-fix the worst segment
      // is a legitimate ~40-unit forward arm.
      const polySegs = segs.filter(s => s.polygonId === poly.id && s.kind === 'star-arm')
      for (const seg of polySegs) {
        const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y)
        expect(len).toBeLessThan(diameter * 0.6)
      }
    }
  })

  // Regression: Bug 1 (2026-05-21). On the floret-pentagonal 5-gon at
  // θ=20°, the asymmetric pair at V0/V3 emitted a 67-unit forward arm
  // that ran most of the way across the polygon (diameter 132) before
  // a tiny 1.6-unit slide along the edge — user perceived it as
  // "rays continuing through to the edge." The arm-length cap in
  // emitStarArms drops the pair when the forward arm exceeds the
  // polygon's half-span. This regression ensures no star-arm exceeds
  // 50% of the polygon's diameter on the floret pentagon at θ=20°.
  it('floret-pentagonal — no asymmetric arm exceeds halfSpan at θ=20°', () => {
    const vp: Viewport = { x: -300, y: -300, width: 600, height: 600 }
    const polys = generateTapratsTiling('floret-pentagonal', vp, 50)
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'floret-pentagonal', scale: 50 },
      figures: { '5': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 20 } },
    }
    const segs = runPIC(polys, config)
    const pentagons = polys.filter(p => p.sides === 5)
    expect(pentagons.length).toBeGreaterThan(0)
    for (const poly of pentagons) {
      let diameter = 0
      for (let i = 0; i < poly.vertices.length; i++) {
        for (let j = i + 1; j < poly.vertices.length; j++) {
          const dx = poly.vertices[i].x - poly.vertices[j].x
          const dy = poly.vertices[i].y - poly.vertices[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d > diameter) diameter = d
        }
      }
      const polySegs = segs.filter(s => s.polygonId === poly.id && s.kind === 'star-arm')
      for (const seg of polySegs) {
        const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y)
        expect(len).toBeLessThanOrEqual(diameter * 0.5)
      }
    }
  })

  // Regression: Bug 1 borderline (2026-05-22). Pre-fix the 1.0 × halfSpan
  // cap left these emitting because their forward arms sat just under the
  // threshold:
  //   - floret-pentagonal θ=40°: arm 63.3 / halfSpan 66.15 = 0.96
  //   - kisrhombille θ=72°: arm 41.4 / halfSpan 50 = 0.83
  //   - deltoid θ=50°: arm 22.5 / halfSpan 28.87 = 0.78
  // These polygons all have shortest/longest edge ratio < 0.65 ("uneven").
  // Post-fix the cap on uneven polygons tightens to 0.75 × halfSpan so the
  // asymmetric branch drops these emissions.
  it('floret-pentagonal — no asymmetric arm exceeds 0.5 × diameter at θ=40°', () => {
    const vp: Viewport = { x: -300, y: -300, width: 600, height: 600 }
    const polys = generateTapratsTiling('floret-pentagonal', vp, 50)
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'floret-pentagonal', scale: 50 },
      figures: { '5': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 40 } },
    }
    const segs = runPIC(polys, config)
    const pentagons = polys.filter(p => p.sides === 5)
    expect(pentagons.length).toBeGreaterThan(0)
    for (const poly of pentagons) {
      let diameter = 0
      for (let i = 0; i < poly.vertices.length; i++) {
        for (let j = i + 1; j < poly.vertices.length; j++) {
          const dx = poly.vertices[i].x - poly.vertices[j].x
          const dy = poly.vertices[i].y - poly.vertices[j].y
          const d = Math.hypot(dx, dy)
          if (d > diameter) diameter = d
        }
      }
      const polySegs = segs.filter(s => s.polygonId === poly.id && s.kind === 'star-arm')
      for (const seg of polySegs) {
        const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y)
        expect(len).toBeLessThanOrEqual(diameter * 0.5)
      }
    }
  })

  it('kisrhombille — no asymmetric arm exceeds 0.5 × diameter at θ=72°', () => {
    const vp: Viewport = { x: -300, y: -300, width: 600, height: 600 }
    const polys = generateTapratsTiling('kisrhombille', vp, 50)
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'kisrhombille', scale: 50 },
      figures: { '3': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 72 } },
    }
    const segs = runPIC(polys, config)
    const triangles = polys.filter(p => p.sides === 3)
    expect(triangles.length).toBeGreaterThan(0)
    for (const poly of triangles) {
      let diameter = 0
      for (let i = 0; i < poly.vertices.length; i++) {
        for (let j = i + 1; j < poly.vertices.length; j++) {
          const dx = poly.vertices[i].x - poly.vertices[j].x
          const dy = poly.vertices[i].y - poly.vertices[j].y
          const d = Math.hypot(dx, dy)
          if (d > diameter) diameter = d
        }
      }
      const polySegs = segs.filter(s => s.polygonId === poly.id && s.kind === 'star-arm')
      for (const seg of polySegs) {
        const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y)
        expect(len).toBeLessThanOrEqual(diameter * 0.5)
      }
    }
  })

  // Regression: per-ray fallback cap (2026-05-22). At θ values where ALL
  // pair-A meetings on a polygon are degenerate (e.g. floret θ=30°), the
  // per-ray fallback handles every ray via Kaplan trim — pre-fix it could
  // emit 72-unit arms across the 132-diameter polygon (same "running
  // through to the edge" symptom). Capped at halfSpan / 0.75 × halfSpan.
  it('floret-pentagonal — per-ray fallback arms capped at θ=30°', () => {
    const vp: Viewport = { x: -300, y: -300, width: 600, height: 600 }
    const polys = generateTapratsTiling('floret-pentagonal', vp, 50)
    const config: PatternConfig = {
      ...DEFAULT_CONFIG,
      tiling: { type: 'floret-pentagonal', scale: 50 },
      figures: { '5': { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: 30 } },
    }
    const segs = runPIC(polys, config)
    const pentagons = polys.filter(p => p.sides === 5)
    for (const poly of pentagons) {
      let diameter = 0
      for (let i = 0; i < poly.vertices.length; i++) {
        for (let j = i + 1; j < poly.vertices.length; j++) {
          const dx = poly.vertices[i].x - poly.vertices[j].x
          const dy = poly.vertices[i].y - poly.vertices[j].y
          const d = Math.hypot(dx, dy)
          if (d > diameter) diameter = d
        }
      }
      const polySegs = segs.filter(s => s.polygonId === poly.id && s.kind === 'star-arm')
      for (const seg of polySegs) {
        const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y)
        expect(len).toBeLessThanOrEqual(diameter * 0.5)
      }
    }
  })

  it('Cairo pentagonal — degenerate θ emits asymmetric forwards with boundary slides', () => {
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
    expect(originKeys.size).toBeGreaterThanOrEqual(8)

    // Per-strand-piece length check: each (origin midpoint, side) tuple
    // sums all its segments — for asymmetric vertices this is forward +
    // slide; for normal pair-A vertices it's a single segment.
    const strandLen = new Map<string, number>()
    for (const seg of polySegs) {
      const key = `${Math.round(seg.edgeMidpoint.x * 1e3)},${Math.round(seg.edgeMidpoint.y * 1e3)}|${seg.side}`
      const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y)
      strandLen.set(key, (strandLen.get(key) ?? 0) + len)
    }
    for (const [, total] of strandLen) {
      expect(total).toBeGreaterThan(5)
    }
  })
})
