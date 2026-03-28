/**
 * Taprats-format tiling generator for non-Archimedean (rosette) tilings.
 *
 * Based on Craig Kaplan's Taprats tiling data format. Each tiling defines:
 * - Translation vectors (t1, t2) for the periodic lattice
 * - Tile types: either regular n-gons or irregular polygons with explicit vertices
 * - Affine transforms placing copies of each tile within the fundamental domain
 *
 * Taprats convention for regular n-gons:
 *   - Inradius = 1 (not edge length = 1)
 *   - Circumradius R = 1/cos(π/n)
 *   - Edge length = 2·tan(π/n)
 *   - Vertex k at angle π/n + 2πk/n from center
 */
import type { Polygon } from '../types/geometry'
import type { Viewport } from './archimedean'
import type { Vec2 } from '../utils/math'
import { nextId, resetIds } from './shared'

const PI = Math.PI

// ── Types ────────────────────────────────────────────────

interface AffineTransform {
  a: number; b: number; tx: number
  c: number; d: number; ty: number
}

interface TileType {
  sides: number
  regular: boolean
  /** Canonical vertices for irregular polygons (Taprats coordinate space) */
  vertices?: Vec2[]
  /** Affine transforms for each copy within the fundamental domain */
  transforms: AffineTransform[]
}

interface TapratsTilingData {
  t1: Vec2
  t2: Vec2
  tiles: TileType[]
}

// ── Canonical regular polygon ────────────────────────────

function regularVertices(n: number): Vec2[] {
  const R = 1 / Math.cos(PI / n)
  const verts: Vec2[] = []
  for (let k = 0; k < n; k++) {
    const angle = PI / n + (2 * PI * k) / n
    verts.push({ x: R * Math.cos(angle), y: R * Math.sin(angle) })
  }
  return verts
}

// ── Affine transform application ─────────────────────────

function applyAffine(v: Vec2, t: AffineTransform): Vec2 {
  return {
    x: t.a * v.x + t.b * v.y + t.tx,
    y: t.c * v.x + t.d * v.y + t.ty,
  }
}

// ── Compute canonical edge length ────────────────────────

function computeCanonicalEdgeLen(data: TapratsTilingData): number {
  for (const tile of data.tiles) {
    if (tile.regular) {
      // Check if the first transform includes scaling
      const t = tile.transforms[0]
      const det = t.a * t.d - t.b * t.c
      const scaleFactor = Math.sqrt(Math.abs(det))
      return 2 * Math.tan(PI / tile.sides) * scaleFactor
    }
  }
  // Fallback: compute from first irregular polygon's first edge
  for (const tile of data.tiles) {
    if (tile.vertices && tile.vertices.length >= 2) {
      const v0 = applyAffine(tile.vertices[0], tile.transforms[0])
      const v1 = applyAffine(tile.vertices[1], tile.transforms[0])
      return Math.sqrt((v1.x - v0.x) ** 2 + (v1.y - v0.y) ** 2)
    }
  }
  return 1
}

// ── Tiling generation ────────────────────────────────────

function intersectsViewport(verts: Vec2[], vp: Viewport): boolean {
  for (const v of verts) {
    if (v.x >= vp.x && v.x <= vp.x + vp.width &&
        v.y >= vp.y && v.y <= vp.y + vp.height) return true
  }
  const xs = verts.map(v => v.x)
  const ys = verts.map(v => v.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return maxX >= vp.x && minX <= vp.x + vp.width &&
         maxY >= vp.y && minY <= vp.y + vp.height
}

const MAX_POLYGONS = 2000

export function generateTapratsTiling(
  tilingKey: string,
  viewport: Viewport,
  edgeLen: number,
): Polygon[] {
  const data = TAPRATS_DATA[tilingKey]
  if (!data) return []

  resetIds()

  const canonicalEdge = computeCanonicalEdgeLen(data)
  const scale = edgeLen / canonicalEdge

  // Scale translation vectors
  const t1: Vec2 = { x: data.t1.x * scale, y: data.t1.y * scale }
  const t2: Vec2 = { x: data.t2.x * scale, y: data.t2.y * scale }

  // Pre-compute tile canonical vertices (in scaled coordinates)
  const tileVertices: Vec2[][] = data.tiles.map(tile => {
    const canonical = tile.regular ? regularVertices(tile.sides) : tile.vertices!
    return canonical.map(v => ({ x: v.x * scale, y: v.y * scale }))
  })

  // Scale transform translations (rotation/scale parts stay the same)
  const tileTransforms: AffineTransform[][] = data.tiles.map(tile =>
    tile.transforms.map(t => ({
      a: t.a, b: t.b, tx: t.tx * scale,
      c: t.c, d: t.d, ty: t.ty * scale,
    }))
  )

  // Viewport center for lattice origin
  const cx = viewport.x + viewport.width / 2
  const cy = viewport.y + viewport.height / 2

  // Padded viewport for edge tiles
  const pad = edgeLen * 3
  const paddedVP: Viewport = {
    x: viewport.x - pad,
    y: viewport.y - pad,
    width: viewport.width + 2 * pad,
    height: viewport.height + 2 * pad,
  }

  // Determine lattice range
  const diag = Math.sqrt(viewport.width ** 2 + viewport.height ** 2) / 2 + pad
  const t1Len = Math.sqrt(t1.x ** 2 + t1.y ** 2)
  const t2Len = Math.sqrt(t2.x ** 2 + t2.y ** 2)
  const maxI = Math.ceil(diag / t1Len) + 1
  const maxJ = Math.ceil(diag / t2Len) + 1

  const polygons: Polygon[] = []

  // Deduplication by polygon center
  const placedCenters = new Set<string>()
  const centerKey = (c: Vec2): string =>
    `${Math.round(c.x * 100)},${Math.round(c.y * 100)}`

  for (let i = -maxI; i <= maxI; i++) {
    for (let j = -maxJ; j <= maxJ; j++) {
      const ox = cx + i * t1.x + j * t2.x
      const oy = cy + i * t1.y + j * t2.y

      for (let tileIdx = 0; tileIdx < data.tiles.length; tileIdx++) {
        const tile = data.tiles[tileIdx]
        const canonVerts = tileVertices[tileIdx]
        const transforms = tileTransforms[tileIdx]

        for (const transform of transforms) {
          // Apply transform then lattice translation
          const vertices: Vec2[] = canonVerts.map(v => {
            const tv = applyAffine(v, transform)
            return { x: tv.x + ox, y: tv.y + oy }
          })

          if (!intersectsViewport(vertices, paddedVP)) continue

          // Compute center
          let sx = 0, sy = 0
          for (const v of vertices) { sx += v.x; sy += v.y }
          const center: Vec2 = { x: sx / vertices.length, y: sy / vertices.length }

          const key = centerKey(center)
          if (placedCenters.has(key)) continue
          placedCenters.add(key)

          polygons.push({
            id: nextId(),
            sides: tile.sides,
            vertices,
            center,
          })

          if (polygons.length >= MAX_POLYGONS) return polygons
        }
      }
    }
  }

  return polygons
}

// ── Embedded Taprats tiling data ─────────────────────────
// Data extracted from Craig Kaplan's Taprats .tiling files.
// Convention: regular polygons have inradius=1, irregular polygons
// use the same coordinate scale.

const TAPRATS_DATA: Record<string, TapratsTilingData> = {
  // ── 5-fold: var_5 (pentagons + rhombi) ────────────────
  'pentagonal-rosette': {
    t1: { x: 5.0, y: -0.726542528005361 },
    t2: { x: 1.3819660112501055, y: 1.9021130325903064 },
    tiles: [
      {
        sides: 4, regular: false,
        vertices: [
          { x: -0.6108513047783548, y: -2.1270858174611336 },
          { x: -0.6108513047783557, y: -3.580170873471857 },
          { x: 0.7711147064717497, y: -3.1311428968922725 },
          { x: 0.77111470647175, y: -1.6780578408815492 },
        ],
        transforms: [
          { a: 1, b: 0, tx: 1.3819660112501062, c: 0, d: 1, ty: 1.9021130325903082 },
        ],
      },
      {
        sides: 5, regular: true,
        transforms: [
          { a: 0.8090169943749475, b: -0.5877852522924729, tx: -1.8469192822781433,
            c: 0.5877852522924729, d: 0.8090169943749475, ty: 0.22405519170875854 },
          { a: 0.3090169943749477, b: -0.9510565162951533, tx: -0.22888529352824927,
            c: 0.9510565162951533, d: 0.3090169943749477, ty: -0.951515312876188 },
        ],
      },
      {
        sides: 4, regular: false,
        vertices: [
          { x: -1.464953271028038, y: 1.3996256962937044 },
          { x: -0.6108513047783539, y: 0.2240551917087581 },
          { x: 0.771114706471751, y: -0.22497278487082784 },
          { x: -0.08298725977793286, y: 0.9505977197141181 },
        ],
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
        ],
      },
    ],
  },

  // ── 7-fold: pbn_7 (heptagons + pentagons) ─────────────
  'heptagonal-rosette': {
    t1: { x: 2.445041867912629, y: -1.9498558243636483 },
    t2: { x: 0.0, y: 3.899711648727295 },
    tiles: [
      {
        sides: 7, regular: true,
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
          { a: 0.9009688679024193, b: 0.43388373911755795, tx: -0.44504186791262884,
            c: -0.43388373911755795, d: 0.9009688679024193, ty: 1.9498558243636475 },
        ],
      },
      {
        sides: 5, regular: false,
        vertices: [
          { x: 0.24697960371746683, y: 2.817623302598764 },
          { x: 0.6648743962621135, y: 1.9498558243636477 },
          { x: 1.3351256037378867, y: 1.949855824363648 },
          { x: 1.753020396282533, y: 2.817623302598764 },
          { x: 0.9999999999999998, y: 3.418137029919767 },
        ],
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
          { a: -1, b: 0, tx: 2, c: 0, d: -1, ty: 3.8997116487272954 },
        ],
      },
    ],
  },

  // ── 9-fold: 9.6 (nonagons + pentagons + hexagons) ─────
  'nonagonal-rosette': {
    t1: { x: 0, y: -4.479528227023502 },
    t2: { x: 3.8793852415718195, y: -2.239764113511752 },
    tiles: [
      {
        sides: 9, regular: true,
        transforms: [
          { a: 1.4905938356746224, b: 0.5425317875662494, tx: -5.172513655429092,
            c: -0.5425317875662494, d: 1.4905938356746224, ty: 4.479528227023504 },
        ],
      },
      {
        sides: 5, regular: false,
        vertices: [
          { x: -3.8793852415718186, y: 5.564591802156002 },
          { x: -3.4844543979371183, y: 4.479528227023504 },
          { x: -3.03535561282583, y: 5.257390140453712 },
          { x: -2.137158042603261, y: 5.257390140453709 },
          { x: -2.8793852415718186, y: 6.141942071345627 },
        ],
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
          { a: -0.5, b: 0.8660254037844398, tx: -7.758770483143649,
            c: -0.8660254037844398, d: -0.5, ty: 4.479528227023504 },
          { a: -0.5, b: -0.866025403784439, tx: 0,
            c: 0.866025403784439, d: -0.5, ty: 8.95905645404701 },
        ],
      },
      {
        sides: 6, regular: true,
        transforms: [
          { a: 1, b: 0, tx: -3.8793852415718186,
            c: 0, d: 1, ty: 2.2397641135117525 },
          { a: 0.6736481776669262, b: 0.3889309567151031, tx: -2.5862568277145477,
            c: -0.3889309567151031, d: 0.6736481776669262, ty: 4.479528227023508 },
        ],
      },
    ],
  },

  // ── 10-fold: Girih Tiles (decagons + pentagons + hexagons + quads) ──
  'decagonal-rosette': {
    t1: { x: 3.472135954999581, y: -1.128165359777815 },
    t2: { x: 0.9270509831248424, y: 3.8279286375841797 },
    tiles: [
      {
        sides: 6, regular: false,
        vertices: [
          { x: 0.9999999999999998, y: 0.3249196962329062 },
          { x: 0.9999999999999998, y: -0.3249196962329064 },
          { x: 1.6180339887498947, y: -0.12410828034667931 },
          { x: 2.2360679774997894, y: -0.3249196962329066 },
          { x: 2.2360679774997894, y: 0.3249196962329056 },
          { x: 1.6180339887498947, y: 0.12410828034667865 },
        ],
        transforms: [
          { a: 0.3090169943749473, b: -0.9510565162951544, tx: 0.6180339887498948,
            c: 0.9510565162951544, d: 0.3090169943749473, ty: -1.9021130325903082 },
        ],
      },
      {
        sides: 10, regular: true,
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
        ],
      },
      {
        sides: 5, regular: true,
        transforms: [
          { a: 0.44721359549995787, b: 0, tx: -0.44721359549995776,
            c: 0, d: 0.44721359549995787, ty: 1.3763819204711734 },
        ],
      },
      {
        sides: 4, regular: false,
        vertices: [
          { x: 0.0, y: 1.7013016167040798 },
          { x: 0.0, y: 1.051462224238267 },
          { x: 0.6180339887498947, y: 0.8506508083520399 },
          { x: 0.6180339887498949, y: 1.5004902008178527 },
        ],
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
        ],
      },
      {
        sides: 6, regular: false,
        vertices: [
          { x: 2.618033988749895, y: 0.8506508083520394 },
          { x: 2.2360679774997894, y: 0.3249196962329056 },
          { x: 2.2360679774997894, y: -0.3249196962329066 },
          { x: 2.6180339887498945, y: -0.8506508083520405 },
          { x: 3.0, y: -0.3249196962329066 },
          { x: 3.0, y: 0.3249196962329055 },
        ],
        transforms: [
          { a: 0.8090169943749481, b: -0.5877852522924734, tx: -1.0000000000000018,
            c: 0.5877852522924734, d: 0.8090169943749481, ty: -0.7265425280053611 },
        ],
      },
    ],
  },

  // ── 11-fold: constructed hendecagonal rosette ──────────
  // 11-fold patterns are extremely rare in Islamic art.
  // Two hendecagons per cell sharing one edge, positioned
  // analogously to the pbn_7 heptagonal tiling.
  'hendecagonal-rosette': {
    t1: { x: 3.3097214678905702, y: -1.5114991487085165 },
    t2: { x: 0.0, y: 3.022998297417033 },
    tiles: [
      {
        sides: 11, regular: true,
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
          { a: 0.9594929736144974, b: 0.28173255684142967, tx: -1.3097214678905702,
            c: -0.28173255684142967, d: 0.9594929736144974, ty: 1.5114991487085165 },
        ],
      },
    ],
  },
}
