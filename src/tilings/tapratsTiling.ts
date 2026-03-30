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
  /** Explicit tile type ID override (for grouping variants, e.g. all gap lobes as one type) */
  tileTypeId?: string
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

// ── Tile type ID assignment ──────────────────────────────

/**
 * Assign a unique tileTypeId to each tile entry.
 * If a tile has an explicit tileTypeId, use it.
 * Otherwise: unique side count → "N", duplicate → "N.1", "N.2", etc.
 */
function assignTileTypeIds(tiles: TileType[]): string[] {
  // Count how many tiles share each side count (ignoring explicit overrides)
  const sidesCounts = new Map<number, number>()
  for (const t of tiles) {
    if (!t.tileTypeId) sidesCounts.set(t.sides, (sidesCounts.get(t.sides) ?? 0) + 1)
  }

  const sidesSeen = new Map<number, number>()
  return tiles.map(t => {
    if (t.tileTypeId) return t.tileTypeId
    const count = sidesCounts.get(t.sides)!
    if (count === 1) return String(t.sides)
    const idx = (sidesSeen.get(t.sides) ?? 0) + 1
    sidesSeen.set(t.sides, idx)
    return `${t.sides}.${idx}`
  })
}

/** Get tile type info for a tiling (used by UI to show controls per tile type). */
export function getTapratsTileTypes(tilingKey: string): { id: string; sides: number }[] {
  const data = TAPRATS_DATA[tilingKey]
  if (!data) return []
  const ids = assignTileTypeIds(data.tiles)
  const seen = new Set<string>()
  const result: { id: string; sides: number }[] = []
  for (let i = 0; i < data.tiles.length; i++) {
    if (!seen.has(ids[i])) {
      seen.add(ids[i])
      result.push({ id: ids[i], sides: data.tiles[i].sides })
    }
  }
  return result
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

const MAX_POLYGONS = 4000

export function generateTapratsTiling(
  tilingKey: string,
  viewport: Viewport,
  edgeLen: number,
): Polygon[] {
  const data = TAPRATS_DATA[tilingKey]
  if (!data) return []

  resetIds()

  // Compute tileTypeId for each tile entry
  const tileTypeIds = assignTileTypeIds(data.tiles)

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
            tileTypeId: tileTypeIds[tileIdx],
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

  // ── 10-fold: Girih Star (decagons + bowties + elongated hexagons) ──
  'decagonal-rosette': {
    t1: { x: 7.23606797749979, y: 0 },
    t2: { x: 0, y: 12.310734148701012 },
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
          { a: 0.8090169943749461, b: -0.5877852522924734, tx: -8.03606797749978,
            c: 0.5877852522924734, d: 0.8090169943749461, ty: -4.3465425280053624 },
          { a: -1.0000000000000002, b: 6.661338147750941e-16, tx: -2.181966011250103,
            c: -6.661338147750941e-16, d: -1.0000000000000002, ty: 1.35979656976556 },
          { a: -0.3090169943749467, b: 0.9510565162951535, tx: -4.418033988749894,
            c: -0.9510565162951535, d: -0.3090169943749467, ty: 2.0863390977709195 },
          { a: 0.8090169943749486, b: 0.5877852522924736, tx: -2.1819660112501067,
            c: -0.5877852522924736, d: 0.8090169943749486, ty: -2.4444294954150516 },
          { a: 0.8090169943749447, b: -0.5877852522924729, tx: -1.7999999999999878,
            c: 0.5877852522924729, d: 0.8090169943749447, ty: -3.619999999999994 },
          { a: 0.9999999999999988, b: -1.1102230246251565e-15, tx: -1.1819660112500932,
            c: 1.1102230246251565e-15, d: 0.9999999999999988, ty: -7.873254041760182 },
          { a: 0.3090169943749475, b: 0.9510565162951532, tx: -5.418033988749892,
            c: -0.9510565162951532, d: 0.3090169943749475, ty: -2.4444294954150543 },
          { a: 1.0000000000000009, b: -6.106226635438361e-16, tx: -2.4180339887498983,
            c: 6.106226635438361e-16, d: 1.0000000000000009, ty: -1.7178869674096933 },
          { a: -0.8090169943749477, b: 0.5877852522924732, tx: -3.1819660112501036,
            c: -0.5877852522924732, d: -0.8090169943749477, ty: 4.437480106940813 },
          { a: 0.8090169943749492, b: 0.587785252292474, tx: -1.8000000000000025,
            c: -0.587785252292474, d: 0.8090169943749492, ty: 0.1842260651806178 },
          { a: -0.8090169943749475, b: -0.5877852522924715, tx: 0.43606797749978954,
            c: 0.5877852522924715, d: -0.8090169943749475, ty: 0.9107685931859777 },
          { a: -0.8090169943749485, b: -0.5877852522924736, tx: -1.7999999999999967,
            c: 0.5877852522924736, d: -0.8090169943749485, ty: 2.5353670743505052 },
          { a: -0.8090169943749478, b: 0.5877852522924735, tx: -1.7999999999999985,
            c: -0.5877852522924735, d: -0.8090169943749478, ty: -5.971141009169893 },
          { a: -0.3090169943749481, b: -0.9510565162951532, tx: -2.181966011250103,
            c: 0.9510565162951532, d: -0.3090169943749481, ty: -0.991344439404332 },
          { a: 0.8090169943749459, b: 0.587785252292471, tx: -0.7999999999999894,
            c: -0.587785252292471, d: 0.8090169943749459, ty: -4.346542528005351 },
          { a: 1.0000000000000013, b: -6.661338147750941e-16, tx: -1.8000000000000005,
            c: 6.661338147750941e-16, d: 1.0000000000000013, ty: -7.424226065180617 },
          { a: 1.0000000000000022, b: -6.661338147750939e-16, tx: -2.4180339887498956,
            c: 6.661338147750939e-16, d: 1.0000000000000022, ty: -7.873254041760205 },
          { a: -0.8090169943749463, b: 0.5877852522924731, tx: 1.8180339887498955,
            c: -0.5877852522924731, d: -0.8090169943749463, ty: 2.8128816257762868 },
          { a: 0.8090169943749481, b: -0.5877852522924744, tx: -2.181966011250106,
            c: 0.5877852522924744, d: 0.8090169943749481, ty: -6.24865556059567 },
          { a: 0.9999999999999989, b: -1.3877787807814457e-15, tx: -1.8,
            c: 1.3877787807814457e-15, d: 0.9999999999999989, ty: -8.322282018339786 },
          { a: -0.8090169943749472, b: -0.5877852522924725, tx: -3.1819660112501036,
            c: 0.5877852522924725, d: -0.8090169943749472, ty: -1.7178869674096926 },
          { a: -0.8090169943749479, b: -0.5877852522924729, tx: -1.8000000000000007,
            c: 0.5877852522924729, d: -0.8090169943749479, ty: -3.62 },
          { a: 0.809016994374948, b: 0.5877852522924717, tx: -8.036067977499789,
            c: -0.5877852522924717, d: 0.809016994374948, ty: 0.9107685931859688 },
          { a: 0.8090169943749465, b: -0.5877852522924742, tx: -2.1819660112501014,
            c: 0.5877852522924742, d: 0.8090169943749465, ty: -0.991344439404331 },
          { a: -0.809016994374947, b: 0.5877852522924731, tx: -3.181966011250103,
            c: -0.5877852522924731, d: -0.809016994374947, ty: -1.7178869674096933 },
          { a: -0.8090169943749476, b: -0.5877852522924731, tx: -3.1819660112501045,
            c: 0.5877852522924731, d: -0.8090169943749476, ty: -7.8732540417602 },
          { a: -0.8090169943749478, b: 0.5877852522924742, tx: -1.8000000000000014,
            c: -0.5877852522924742, d: -0.8090169943749478, ty: 0.18422606518061624 },
          { a: 1.0000000000000002, b: -1.1102230246251565e-16, tx: -5.418033988749894,
            c: 1.1102230246251565e-16, d: 1.0000000000000002, ty: -4.795570504584946 },
          { a: 0.3090169943749473, b: -0.9510565162951544, tx: -3.181966011250106,
            c: 0.9510565162951544, d: 0.3090169943749473, ty: -5.522113032590308 },
          { a: 0.9999999999999991, b: -1.1657341758564144e-15, tx: -8.418033988749889,
            c: 1.1657341758564144e-15, d: 0.9999999999999991, ty: -1.7178869674096964 },
        ],
      },
      {
        sides: 10, regular: true,
        transforms: [
          { a: 1.000000000000001, b: -5.551115123125783e-16, tx: -0.1819660112501036,
            c: 5.551115123125783e-16, d: 1.000000000000001, ty: -6.248655560595669 },
          { a: 0.999999999999999, b: -5.594238148928924e-16, tx: -2.4180339887498943,
            c: 5.594238148928924e-16, d: 0.999999999999999, ty: -7.873254041760199 },
          { a: 0.9999999999999996, b: -2.220446049250313e-16, tx: -5.181966011250102,
            c: 2.220446049250313e-16, d: 0.9999999999999996, ty: -1.7178869674096933 },
          { a: 1.0000000000000002, b: -7.771561172376098e-16, tx: -3.799999999999999,
            c: 7.771561172376098e-16, d: 1.0000000000000002, ty: 2.535367074350506 },
          { a: 1.0000000000000002, b: 5.551115123125788e-17, tx: -3.799999999999999,
            c: -5.551115123125788e-17, d: 1.0000000000000002, ty: -5.971141009169893 },
          { a: 0.9999999999999977, b: -5.551115123125783e-16, tx: -6.036067977499784,
            c: 5.551115123125783e-16, d: 0.9999999999999977, ty: -4.346542528005358 },
          { a: 0.9999999999999992, b: -1.2212453270876722e-15, tx: -1.5639320225002085,
            c: 1.2212453270876722e-15, d: 0.9999999999999992, ty: 0.9107685931859758 },
          { a: 1.0000000000000007, b: -3.3306690738754696e-16, tx: -1.5639320225002105,
            c: 3.3306690738754696e-16, d: 1.0000000000000007, ty: -4.346542528005361 },
          { a: 0.8090169943749462, b: -0.5877852522924735, tx: -0.18196601125010625,
            c: 0.5877852522924735, d: 0.8090169943749462, ty: 2.812881625776283 },
          { a: 0.9999999999999998, b: -3.885780586188048e-16, tx: -3.799999999999998,
            c: 3.885780586188048e-16, d: 0.9999999999999998, ty: 0.18422606518061335 },
          { a: 1.0000000000000004, b: -3.885780586188048e-16, tx: -2.418033988749896,
            c: 3.885780586188048e-16, d: 1.0000000000000004, ty: -1.7178869674096926 },
          { a: 1, b: 0, tx: -3.7999999999999976,
            c: 0, d: 1, ty: -3.62 },
          { a: 0.9999999999999994, b: -4.440892098500626e-16, tx: -6.036067977499787,
            c: 4.440892098500626e-16, d: 0.9999999999999994, ty: 0.910768593185973 },
          { a: 0.9999999999999988, b: -3.8857805861880444e-16, tx: -5.181966011250102,
            c: 3.8857805861880444e-16, d: 0.9999999999999988, ty: -7.8732540417602 },
        ],
      },
      {
        sides: 6, regular: false,
        vertices: [
          { x: 2.618033988749895, y: 0.8506508083520394 },
          { x: 2.2360679774997894, y: 0.3249196962329056 },
          { x: 2.2360679774997894, y: -0.3249196962329066 },
          { x: 2.6180339887498945, y: -0.8506508083520405 },
          { x: 3, y: -0.3249196962329066 },
          { x: 3, y: 0.3249196962329055 },
        ],
        transforms: [
          { a: -0.30901699437494623, b: 0.9510565162951533, tx: -5.799999999999997,
            c: -0.9510565162951533, d: -0.30901699437494623, ty: 0.18422606518061224 },
          { a: 0.9999999999999997, b: -3.885780586188048e-16, tx: -6.418033988749892,
            c: 3.885780586188048e-16, d: 0.9999999999999997, ty: -7.8732540417602 },
          { a: 0.8090169943749469, b: -0.587785252292474, tx: -8.418033988749896,
            c: 0.587785252292474, d: 0.8090169943749469, ty: 2.0863390977709138 },
          { a: 0.3090169943749476, b: 0.9510565162951536, tx: -6.418033988749892,
            c: -0.9510565162951536, d: 0.3090169943749476, ty: 2.086339097770921 },
          { a: -0.30901699437494634, b: 0.9510565162951542, tx: -6.418033988749895,
            c: -0.9510565162951542, d: -0.30901699437494634, ty: 2.0863390977709177 },
          { a: 0.3090169943749486, b: 0.951056516295153, tx: -7.418033988749895,
            c: -0.951056516295153, d: 0.3090169943749486, ty: 1.3597965697655554 },
          { a: -0.8090169943749462, b: 0.5877852522924737, tx: -2.800000000000001,
            c: -0.5877852522924737, d: -0.8090169943749462, ty: 3.2619096023558662 },
          { a: 0.8090169943749481, b: -0.5877852522924737, tx: -4.418033988749896,
            c: 0.5877852522924737, d: 0.8090169943749481, ty: -7.873254041760201 },
          { a: 1.0000000000000016, b: -3.3306690738754726e-16, tx: -2.8000000000000025,
            c: 3.3306690738754726e-16, d: 1.0000000000000016, ty: -4.346542528005361 },
          { a: 0.8090169943749477, b: 0.5877852522924716, tx: -3.7999999999999994,
            c: -0.5877852522924716, d: 0.8090169943749477, ty: 3.988452130361223 },
          { a: 0.8090169943749487, b: -0.5877852522924748, tx: -3.8000000000000034,
            c: 0.5877852522924748, d: 0.8090169943749487, ty: -7.424226065180619 },
          { a: 0.8090169943749459, b: 0.587785252292471, tx: -8.03606797749978,
            c: -0.587785252292471, d: 0.8090169943749459, ty: -4.346542528005359 },
          { a: 0.8090169943749479, b: -0.5877852522924734, tx: -7.418033988749895,
            c: 0.5877852522924734, d: 0.8090169943749479, ty: 1.3597965697655603 },
          { a: -0.3090169943749463, b: 0.9510565162951521, tx: -4.799999999999999,
            c: -0.9510565162951521, d: -0.3090169943749463, ty: -0.5423164628247505 },
          { a: 0.8090169943749467, b: -0.5877852522924734, tx: -8.036067977499787,
            c: 0.5877852522924734, d: 0.8090169943749467, ty: 0.9107685931859724 },
          { a: 0.809016994374946, b: 0.5877852522924709, tx: -8.418033988749883,
            c: -0.5877852522924709, d: 0.809016994374946, ty: -5.522113032590303 },
          { a: 0.30901699437494823, b: 0.9510565162951532, tx: -2.8000000000000025,
            c: -0.9510565162951532, d: 0.30901699437494823, ty: -0.5423164628247479 },
          { a: 0.8090169943749477, b: 0.5877852522924726, tx: -7.036067977499789,
            c: -0.5877852522924726, d: 0.8090169943749477, ty: -3.6200000000000006 },
          { a: -0.809016994374948, b: -0.5877852522924721, tx: -0.5639320225002076,
            c: 0.5877852522924721, d: -0.809016994374948, ty: 0.18422606518061557 },
          { a: 0.8090169943749478, b: 0.5877852522924732, tx: -7.418033988749894,
            c: -0.5877852522924732, d: 0.8090169943749478, ty: -4.795570504584945 },
          { a: 0.8090169943749473, b: -0.587785252292474, tx: -4.800000000000001,
            c: 0.587785252292474, d: 0.8090169943749473, ty: -6.697683537175256 },
          { a: 0.3090169943749481, b: 0.9510565162951512, tx: -8.036067977499783,
            c: -0.9510565162951512, d: 0.3090169943749481, ty: -0.5423164628247539 },
          { a: 0.3090169943749481, b: 0.9510565162951531, tx: -1.800000000000003,
            c: -0.9510565162951531, d: 0.3090169943749481, ty: 0.18422606518061335 },
          { a: 0.8090169943749478, b: 0.5877852522924724, tx: -3.4180339887498965,
            c: -0.5877852522924724, d: 0.8090169943749478, ty: 5.164022634946173 },
          { a: -0.30901699437494723, b: 0.9510565162951546, tx: -1.1819660112501067,
            c: -0.9510565162951546, d: -0.30901699437494723, ty: 2.0863390977709253 },
          { a: 1, b: -1.2212453270876734e-15, tx: -2.799999999999999,
            c: 1.2212453270876734e-15, d: 1, ty: 0.9107685931859747 },
          { a: 0.9999999999999993, b: -6.661338147750939e-16, tx: -6.41803398874989,
            c: 6.661338147750939e-16, d: 0.9999999999999993, ty: -1.7178869674096944 },
          { a: 0.8090169943749488, b: 0.5877852522924738, tx: -4.418033988749896,
            c: -0.5877852522924738, d: 0.8090169943749488, ty: 4.437480106940815 },
          { a: -0.30901699437494723, b: 0.9510565162951546, tx: -0.18196601125010536,
            c: -0.9510565162951546, d: -0.30901699437494723, ty: 1.3597965697655643 },
          { a: 0.8090169943749487, b: -0.5877852522924748, tx: -3.4180339887498974,
            c: 0.5877852522924748, d: 0.8090169943749487, ty: -8.599796569765568 },
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
      // Gap region decomposed into 6 convex lobes (4 quads + 2 triangles)
      {
        sides: 4, regular: false, tileTypeId: '4',
        vertices: [
          { x: 1, y: 0.29362649293836673 },
          { x: 0.6825070656623624, y: 0.7876551419728285 },
          { x: 0.14832296034141051, y: 1.0316088487362083 },
          { x: -0.4329526368879809, y: 0.9480340350256571 },
        ],
        transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
      },
      {
        sides: 3, regular: false, tileTypeId: '3',
        vertices: [
          { x: -0.4329526368879809, y: 0.9480340350256571 },
          { x: -0.26750435166416486, y: 1.5114991487085165 },
          { x: -0.4329526368879808, y: 2.0749642623913758 },
        ],
        transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
      },
      {
        sides: 4, regular: false, tileTypeId: '4',
        vertices: [
          { x: -0.4329526368879808, y: 2.0749642623913758 },
          { x: 0.14832296034141024, y: 1.9913894486808246 },
          { x: 0.6825070656623619, y: 2.235343155444204 },
          { x: 0.9999999999999996, y: 2.7293718044786663 },
        ],
        transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
      },
      {
        sides: 4, regular: false, tileTypeId: '4',
        vertices: [
          { x: 0.9999999999999996, y: 2.7293718044786663 },
          { x: 1.3174929343376374, y: 2.2353431554442045 },
          { x: 1.8516770396585889, y: 1.9913894486808248 },
          { x: 2.432952636887981, y: 2.074964262391376 },
        ],
        transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
      },
      {
        sides: 3, regular: false, tileTypeId: '3',
        vertices: [
          { x: 2.432952636887981, y: 2.074964262391376 },
          { x: 2.267504351664164, y: 1.5114991487085168 },
          { x: 2.432952636887981, y: 0.9480340350256571 },
        ],
        transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
      },
      {
        sides: 4, regular: false, tileTypeId: '4',
        vertices: [
          { x: 2.432952636887981, y: 0.9480340350256571 },
          { x: 1.8516770396585893, y: 1.0316088487362085 },
          { x: 1.3174929343376376, y: 0.7876551419728288 },
          { x: 1, y: 0.29362649293836673 },
        ],
        transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
      },
    ],
  },
}
