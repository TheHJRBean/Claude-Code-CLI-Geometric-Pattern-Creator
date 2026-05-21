import { describe, it, expect } from 'vitest'
import { generateTapratsTiling } from '../tilings/tapratsTiling'
import { computeContactRays } from './stellation'
import { rayRayIntersect } from './intersect'
import { EPSILON, pointInPolygon, dist } from '../utils/math'
import { runPIC } from './index'
import { DEFAULT_CONFIG } from '../state/defaults'
import type { Polygon } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Viewport } from '../tilings/archimedean'

/**
 * Diagnostic probe — not a regression test. Logs per-vertex pair-A status
 * across a θ sweep for tilings flagged in
 * memory/project_pic_irregular_polygon_bugs.md as having visible edge-slide
 * artifacts. Goal: find a discriminator between aesthetic slides (Cairo,
 * Tetrakis) and unaesthetic ones (floret / deltoid / kisrhombille /
 * heptagonal-rosette).
 *
 * Outputs CSV to console. Run with: `npx vitest run src/pic/probe.test.ts`
 */

const PROBES: { tiling: string; sides: number; thetaSweep: number[] }[] = [
  // ── Convex acute-vertex polygons (Bug 1: snap-in/out) ──
  { tiling: 'floret-pentagonal', sides: 5, thetaSweep: [20, 30, 40, 50, 54, 60, 67.5, 72] },
  { tiling: 'deltoidal-trihexagonal', sides: 4, thetaSweep: [20, 30, 40, 50, 60, 67.5, 72] },
  { tiling: 'kisrhombille', sides: 3, thetaSweep: [20, 30, 40, 50, 60, 67.5, 72] },
  { tiling: 'heptagonal-rosette', sides: 5, thetaSweep: [20, 30, 40, 50, 54, 60, 67.5] },
  // ── Concave polygons (Bug 2: cross-tile slide) ──
  { tiling: 'nonagonal-rosette', sides: 5, thetaSweep: [30, 40, 45, 50, 54, 60] },
  { tiling: 'decagonal-rosette', sides: 6, thetaSweep: [30, 45, 54, 60, 67.5] },
  // ── Reference: aesthetic slides ──
  { tiling: 'cairo-pentagonal', sides: 5, thetaSweep: [22, 27.5, 30, 45, 60] },
  { tiling: 'tetrakis-square', sides: 3, thetaSweep: [30, 40, 46, 50, 60] },
]

const SCALE = 50

function interiorAngle(v: Vec2[], k: number): number {
  const n = v.length
  const prev = v[(k - 1 + n) % n]
  const curr = v[k]
  const next = v[(k + 1) % n]
  const e1x = prev.x - curr.x, e1y = prev.y - curr.y
  const e2x = next.x - curr.x, e2y = next.y - curr.y
  const a1 = Math.atan2(e1y, e1x)
  const a2 = Math.atan2(e2y, e2x)
  let diff = a1 - a2
  while (diff < 0) diff += Math.PI * 2
  while (diff >= Math.PI * 2) diff -= Math.PI * 2
  // For CCW polygons the interior is on the left when walking edge-by-edge.
  // We sort by both possibilities and accept the smaller one as interior
  // when the polygon is convex; for concave just return the un-flipped value
  // and flag reflex separately.
  return diff
}

type Vec2 = { x: number; y: number }

function edgeLen(v: Vec2[], k: number): number {
  const n = v.length
  const a = v[k]
  const b = v[(k + 1) % n]
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function classify(
  poly: Polygon,
  theta: number,
  vertexIdx: number,
): {
  thetaDeg: number
  vIdx: number
  alpha: number   // interior angle deg
  ePrev: number
  eCurr: number
  pairAStatus: 'inside' | 'outside' | 'asym-fwd' | 'asym-back' | 'invalid'
  forwardLen: number  // distance from forward-ray origin to natural meeting (or 0 if invalid)
  meetingDist: number  // distance from meeting to polygon centroid (0 if invalid)
  prevEdgeMatchesFar: boolean  // would clip land on prev edge (edge of back ray)?
} {
  const rays = computeContactRays(poly, theta)
  const n = poly.sides
  const prevEdge = (vertexIdx - 1 + n) % n
  const currEdge = vertexIdx
  const rA1 = rays[prevEdge * 2 + 1]
  const rA2 = rays[currEdge * 2]
  const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
  const alpha = (interiorAngle(poly.vertices, vertexIdx) * 180) / Math.PI
  const ePrev = edgeLen(poly.vertices, prevEdge)
  const eCurr = edgeLen(poly.vertices, currEdge)
  if (!resA) {
    return { thetaDeg: theta, vIdx: vertexIdx, alpha, ePrev, eCurr, pairAStatus: 'invalid', forwardLen: 0, meetingDist: 0, prevEdgeMatchesFar: false }
  }
  const t1pos = resA.t1 > EPSILON
  const t2pos = resA.t2 > EPSILON
  if (!t1pos && !t2pos) {
    return { thetaDeg: theta, vIdx: vertexIdx, alpha, ePrev, eCurr, pairAStatus: 'invalid', forwardLen: 0, meetingDist: 0, prevEdgeMatchesFar: false }
  }
  if (t1pos && !t2pos) {
    // ray1 (prev edge) is forward; ray2 (curr edge) goes backward
    return { thetaDeg: theta, vIdx: vertexIdx, alpha, ePrev, eCurr, pairAStatus: 'asym-fwd', forwardLen: resA.t1, meetingDist: 0, prevEdgeMatchesFar: false }
  }
  if (!t1pos && t2pos) {
    return { thetaDeg: theta, vIdx: vertexIdx, alpha, ePrev, eCurr, pairAStatus: 'asym-back', forwardLen: resA.t2, meetingDist: 0, prevEdgeMatchesFar: false }
  }
  // Both positive
  const inside = pointInPolygon(resA.point, poly.vertices)
  const meetingDist = dist(resA.point, poly.center)
  return {
    thetaDeg: theta,
    vIdx: vertexIdx,
    alpha,
    ePrev,
    eCurr,
    pairAStatus: inside ? 'inside' : 'outside',
    forwardLen: Math.max(resA.t1, resA.t2),
    meetingDist,
    prevEdgeMatchesFar: false,
  }
}

describe('PIC probe — irregular polygon edge-slide diagnostic', () => {
  for (const probe of PROBES) {
    it(`logs ${probe.tiling} ${probe.sides}-gon across θ`, () => {
      const vp: Viewport = { x: -300, y: -300, width: 600, height: 600 }
      const polys = generateTapratsTiling(probe.tiling, vp, SCALE)
      const target = polys.find(p => p.sides === probe.sides)
      if (!target) {
        console.log(`SKIP ${probe.tiling}: no ${probe.sides}-gon found`)
        return
      }
      console.log(`\n=== ${probe.tiling} ${probe.sides}-gon ===`)
      // Compute polygon diameter for relative comparisons.
      let diameter = 0
      for (let i = 0; i < target.vertices.length; i++) {
        for (let j = i + 1; j < target.vertices.length; j++) {
          const d = Math.hypot(target.vertices[i].x - target.vertices[j].x, target.vertices[i].y - target.vertices[j].y)
          if (d > diameter) diameter = d
        }
      }
      let circumR = 0
      for (const v of target.vertices) {
        const d = Math.hypot(v.x - target.center.x, v.y - target.center.y)
        if (d > circumR) circumR = d
      }
      console.log(`(polygon diameter ${diameter.toFixed(1)}, circumR ${circumR.toFixed(1)})`)
      console.log('  θ°  vIdx  α°    ePrev  eCurr  pairAStatus  fwdLen  meetingDist')
      for (const theta of probe.thetaSweep) {
        for (let v = 0; v < target.sides; v++) {
          const c = classify(target, theta, v)
          const isOff = c.pairAStatus !== 'inside' && c.pairAStatus !== 'invalid'
          const flag = isOff ? ' <- slide/drop fires' : ''
          console.log(
            `  ${c.thetaDeg.toString().padStart(4)}  ${c.vIdx}   ` +
            `${c.alpha.toFixed(1).padStart(5)}  ${c.ePrev.toFixed(1).padStart(5)}  ${c.eCurr.toFixed(1).padStart(5)}  ` +
            `${c.pairAStatus.padEnd(12)} ${c.forwardLen.toFixed(2).padStart(6)}  ${c.meetingDist.toFixed(2).padStart(6)}${flag}`,
          )
        }
        // Per-θ runPIC pass: list every segment on the target polygon with its length
        const config: PatternConfig = {
          ...DEFAULT_CONFIG,
          tiling: { type: probe.tiling, scale: SCALE },
          figures: { [String(probe.sides)]: { type: 'star', lineLength: 1.0, autoLineLength: true, contactAngle: theta } },
        }
        const segs = runPIC([target], config)
        if (segs.length > 0) {
          const lengths = segs.map(s => Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y))
          const ratios = lengths.map(l => (l / diameter).toFixed(2))
          console.log(`     → ${segs.length} segs, lens: [${lengths.map(l => l.toFixed(1)).join(', ')}], /D: [${ratios.join(', ')}]`)
        }
      }
      // Always pass — this is a diagnostic, not a regression test.
      expect(true).toBe(true)
    })
  }
})
