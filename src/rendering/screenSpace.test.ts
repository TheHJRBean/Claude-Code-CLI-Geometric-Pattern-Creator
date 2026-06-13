import { describe, it, expect } from 'vitest'
import { worldToScreen } from './screenSpace'
import type { ViewTransform } from '../hooks/usePanZoom'

const vt = (over: Partial<ViewTransform> = {}): ViewTransform => ({
  x: 0, y: 0, zoom: 1, rotation: 0, ...over,
})

const near = (a: { x: number; y: number }, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 6)
  expect(a.y).toBeCloseTo(y, 6)
}

describe('worldToScreen', () => {
  it('maps the world origin to the top-left when pan/zoom are identity', () => {
    near(worldToScreen({ x: 0, y: 0 }, vt(), 100, 100), 0, 0)
  })

  it('maps the viewBox centre to the screen centre', () => {
    // identity pan, zoom 1, 100×100 → centre world = (50,50)
    near(worldToScreen({ x: 50, y: 50 }, vt(), 100, 100), 50, 50)
  })

  it('scales pixel offset by zoom', () => {
    // zoom 2: viewBox is 50×50, centre world = (25,25) → screen centre (50,50)
    near(worldToScreen({ x: 25, y: 25 }, vt({ zoom: 2 }), 100, 100), 50, 50)
    // world origin stays at screen (0,0)
    near(worldToScreen({ x: 0, y: 0 }, vt({ zoom: 2 }), 100, 100), 0, 0)
  })

  it('accounts for pan (vt.x / vt.y) so the panned centre stays centred', () => {
    // pan (10,20): centre world = (60,70) → screen centre (50,50)
    near(worldToScreen({ x: 60, y: 70 }, vt({ x: 10, y: 20 }), 100, 100), 50, 50)
  })

  it('rotates about the viewBox centre', () => {
    // +90°: a point 10 to the right of centre lands 10 below centre
    near(worldToScreen({ x: 60, y: 50 }, vt({ rotation: 90 }), 100, 100), 50, 60)
    // a point 10 above centre lands 10 to the right of centre
    near(worldToScreen({ x: 50, y: 40 }, vt({ rotation: 90 }), 100, 100), 60, 50)
  })

  it('combines pan, zoom and rotation', () => {
    // zoom 2 (viewBox 50×50), pan (10,20) → centre world = (35,45), screen centre (50,50).
    // 180° rotation: a point 5 right + 5 below centre lands 5 left + 5 above, ×zoom 2.
    near(worldToScreen({ x: 40, y: 50 }, vt({ x: 10, y: 20, zoom: 2, rotation: 180 }), 100, 100), 40, 40)
  })
})
