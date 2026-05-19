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

  // ── 10-fold: Girih Crab (decagon + bowtie + rhombus + hexagons) ──
  // Based on work by Peter J. Lu (Harvard) and Paul J. Steinhardt (Princeton).
  'decagonal-rosette': {
    t1: { x: -3.618033988749893, y: 2.6286555605956687 },
    t2: { x: -2.23606797749979, y: -3.0776835371752527 },
    tiles: [
      {
        sides: 10, regular: true,
        transforms: [
          { a: -0.30901699437494723, b: -0.9510565162951534, tx: 0.7346122469045185,
            c: 0.9510565162951534, d: -0.30901699437494723, ty: -1.9578783236649708 },
        ],
      },
      {
        sides: 6, regular: false,
        tileTypeId: '6.1',
        vertices: [
          { x: 0.9999999999999998, y: 0.3249196962329062 },
          { x: 0.9999999999999998, y: -0.3249196962329064 },
          { x: 1.6180339887498947, y: -0.12410828034667931 },
          { x: 2.2360679774997894, y: -0.3249196962329066 },
          { x: 2.2360679774997894, y: 0.3249196962329056 },
          { x: 1.6180339887498947, y: 0.12410828034667865 },
        ],
        transforms: [
          { a: 0.8090169943749472, b: 0.5877852522924728, tx: -2.5014557305952696,
            c: -0.5877852522924728, d: 0.8090169943749472, ty: -1.9578783236649713 },
          { a: -0.8090169943749472, b: -0.5877852522924735, tx: 0.7346122469045185,
            c: 0.5877852522924735, d: -0.8090169943749472, ty: -1.9578783236649713 },
          { a: 0.8090169943749471, b: 0.5877852522924727, tx: -0.8834217418453756,
            c: -0.5877852522924727, d: 0.8090169943749471, ty: -3.133448828249917 },
          { a: -0.8090169943749476, b: -0.5877852522924736, tx: 3.352646235654413,
            c: 0.5877852522924736, d: -0.8090169943749476, ty: -3.859991356255279 },
        ],
      },
      {
        sides: 4, regular: false,
        vertices: [
          { x: 1.116578258154624, y: -3.5350716600223717 },
          { x: 1.1165782581546226, y: -4.184911052488184 },
          { x: 1.734612246904517, y: -4.385722468374411 },
          { x: 1.7346122469045173, y: -3.7358830759085984 },
        ],
        transforms: [
          { a: 0.9999999999999998, b: 4.996003610813204e-16, tx: 2.1094237467877974e-15,
            c: -4.996003610813204e-16, d: 0.9999999999999998, ty: -1.7013016167040806 },
          { a: 1, b: 0, tx: 0,
            c: 0, d: 1, ty: 0 },
          { a: -0.30901699437494734, b: -0.9510565162951523, tx: -1.2823990336107252,
            c: 0.9510565162951523, d: -0.30901699437494734, ty: -6.540048716026023 },
          { a: -0.8090169943749492, b: 0.5877852522924738, tx: 5.715806020859413,
            c: -0.5877852522924738, d: -0.8090169943749492, ty: -6.914266980724973 },
          { a: -0.8090169943749462, b: 0.5877852522924725, tx: 4.097772032109505,
            c: -0.5877852522924725, d: -0.8090169943749462, ty: -7.439998092844097 },
          { a: -0.30901699437494945, b: -0.9510565162951536, tx: -2.5184670111105167,
            c: 0.9510565162951536, d: -0.30901699437494945, ty: -8.241350332730116 },
        ],
      },
      {
        sides: 6, regular: false,
        vertices: [
          { x: 0.7346122469045158, y: -4.710642164607318 },
          { x: 1.116578258154624, y: -5.236373276726452 },
          { x: 1.734612246904517, y: -5.437184692612679 },
          { x: 2.116578258154624, y: -4.911453580493545 },
          { x: 1.7346122469045193, y: -4.385722468374411 },
          { x: 1.1165782581546226, y: -4.184911052488184 },
        ],
        tileTypeId: '6.2',
        transforms: [
          { a: 1, b: 0, tx: 0,
            c: 0, d: 1, ty: 0 },
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
        tileTypeId: '6.3',
        transforms: [
          { a: -0.8090169943749475, b: -0.5877852522924729, tx: 1.7346122469045184,
            c: 0.5877852522924729, d: -0.8090169943749475, ty: -5.0355618608402235 },
          { a: 0.809016994374947, b: -0.5877852522924729, tx: -1.50145573059527,
            c: 0.5877852522924729, d: 0.809016994374947, ty: -5.0355618608402235 },
          { a: 0.3090169943749471, b: -0.9510565162951534, tx: -0.8834217418453757,
            c: 0.9510565162951534, d: 0.3090169943749471, ty: -3.1334488282499167 },
          { a: 0.3090169943749465, b: -0.9510565162951518, tx: 0.7346122469045198,
            c: 0.9510565162951518, d: 0.3090169943749465, ty: -5.7621043888455805 },
          { a: 0.8090169943749472, b: -0.5877852522924737, tx: -3.5014557305952696,
            c: 0.5877852522924737, d: 0.8090169943749472, ty: -5.035561860840225 },
          { a: -0.309016994374947, b: 0.9510565162951528, tx: 0.11657825815462397,
            c: -0.9510565162951528, d: -0.309016994374947, ty: -0.05576529107466577 },
          { a: 0.8090169943749486, b: -0.5877852522924737, tx: -2.8834217418453774,
            c: 0.5877852522924737, d: 0.8090169943749486, ty: -3.133448828249917 },
          { a: -0.30901699437494723, b: 0.9510565162951539, tx: 0.7346122469045193,
            c: -0.9510565162951539, d: -0.30901699437494723, ty: -1.9578783236649695 },
          { a: 0.8090169943749467, b: -0.5877852522924725, tx: 0.11657825815462464,
            c: 0.5877852522924725, d: 0.8090169943749467, ty: -3.8599913562552755 },
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
      // Gap region: 16-gon filling the space between the two hendecagons
      {
        sides: 16, regular: false, tileTypeId: '16',
        vertices: [
          { x: 0.6825070656623624, y: 0.7876551419728285 },
          { x: 0.9999999999999996, y: 0.29362649293836696 },
          { x: 1.3174929343376376, y: 0.7876551419728288 },
          { x: 1.8516770396585893, y: 1.0316088487362085 },
          { x: 2.4329526368879804, y: 0.9480340350256574 },
          { x: 2.267504351664164, y: 1.5114991487085168 },
          { x: 2.43295263688798, y: 2.0749642623913758 },
          { x: 1.8516770396585889, y: 1.9913894486808248 },
          { x: 1.3174929343376374, y: 2.2353431554442045 },
          { x: 1, y: 2.7293718044786663 },
          { x: 0.6825070656623619, y: 2.235343155444204 },
          { x: 0.14832296034141024, y: 1.9913894486808246 },
          { x: -0.4329526368879808, y: 2.0749642623913758 },
          { x: -0.26750435166416486, y: 1.5114991487085165 },
          { x: -0.43295263688798075, y: 0.9480340350256573 },
          { x: 0.14832296034141051, y: 1.0316088487362083 },
        ],
        transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
      },
    ],
  },

  // ── Tetrakis square (Laves dual of 4.8.8) ──────────────
  // 45°-45°-90° right triangles, p4m. Each "rotated 45° square"
  // is divided into 4 right triangles by its diagonals: the two
  // legs go from the square-vertex (at the centre of the rotated
  // square) to its two octagon-vertex neighbours; the hypotenuse
  // connects the two octagon-vertices. 4 triangles per fundamental
  // cell, generated by rotating the canonical triangle 0°/90°/
  // 180°/270° around the square-vertex (1, 0). Lattice translates
  // the square-vertex: t1 = (1, 1), t2 = (1, -1). Legs = 1
  // (canonical edge), hypotenuse = √2.
  'tetrakis-square': {
    t1: { x: 1, y: 1 },
    t2: { x: 1, y: -1 },
    tiles: [
      {
        sides: 3, regular: false,
        // CCW: octagon-vertex (1, 1), square-vertex (1, 0), octagon-vertex (2, 0).
        // First edge (1,1)→(1,0) is a leg of length 1 → canonical edge = 1.
        vertices: [
          { x: 1, y: 1 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        transforms: [
          // 0° — T_NE (between octagon (1, 1) and octagon (2, 0))
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
          // 90° CCW around (1, 0) — T_NW
          { a: 0, b: -1, tx: 1, c: 1, d: 0, ty: -1 },
          // 180° around (1, 0) — T_SW
          { a: -1, b: 0, tx: 2, c: 0, d: -1, ty: 0 },
          // 270° CCW around (1, 0) — T_SE
          { a: 0, b: 1, tx: 1, c: -1, d: 0, ty: 1 },
        ],
      },
    ],
  },

  // ── Cairo pentagonal (Laves dual of 3².4.3.4) ──────────
  // Convex pentagon, angles 120°/120°/90°/120°/90°, four long
  // edges of length 1 and one short edge of length (√3 − 1).
  // Four pentagons meet at each 4-vertex sharing their 90° corners
  // (a "4-cluster"). p4g symmetry; pure-translation lattice is the
  // black-cluster sub-lattice tilted 45°: t1 = (√3, √3),
  // t2 = (√3, −√3). 4 pentagons per fundamental cell.
  // Canonical pentagon vertices listed CCW starting at the long-edge
  // endpoint nearest a 90° corner so first edge = long edge = 1.
  'cairo-pentagonal': {
    t1: { x: 1.7320508075688772, y: 1.7320508075688772 },
    t2: { x: 1.7320508075688772, y: -1.7320508075688772 },
    tiles: [
      {
        sides: 5, regular: false,
        // CCW from V1' (a 120° vertex on the short edge):
        // V1', V2' (90° corner at origin), V3' (apex 120°),
        // V4' (other 90° corner), V0' (other 120° vertex on short edge).
        vertices: [
          { x: -0.5, y: -0.8660254037844386 },
          { x: 0, y: 0 },
          { x: -0.8660254037844386, y: 0.5 },
          { x: -1.7320508075688772, y: 0 },
          { x: -1.2320508075688772, y: -0.8660254037844386 },
        ],
        transforms: [
          // P0 — identity (extends −x from V2=origin)
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
          // P1 — 90° CCW around V2 (extends −y)
          { a: 0, b: -1, tx: 0, c: 1, d: 0, ty: 0 },
          // P2 — 180° (extends +x)
          { a: -1, b: 0, tx: 0, c: 0, d: -1, ty: 0 },
          // P3 — 270° CCW (extends +y)
          { a: 0, b: 1, tx: 0, c: -1, d: 0, ty: 0 },
        ],
      },
    ],
  },

  // ── Kisrhombille (Laves dual of 4.6.12) ────────────────
  // 30°-60°-90° right triangles, p6m. 12 triangles meet at each
  // 12-vertex (dodecagon-dual centre), 6 at each 6-vertex
  // (hex-dual centre), 4 at each 4-vertex (square-dual centre).
  // The 12 triangles around a 12-vertex alternate chirality: 6
  // "even" triangles + 6 "odd" mirror-image triangles. Both
  // chiralities encoded as 2 separate tiles, each with 6 rotation
  // transforms around the 12-vertex at origin.
  // Edges: short (sq-hex) = (1+√3)/2 ≈ 1.366 (canonical);
  //        medium (sq-dodec) = (3+√3)/2 ≈ 2.366;
  //        long (hex-dodec, hypotenuse) = 1+√3 ≈ 2.732.
  // Lattice: hexagonal with edge = 3+√3 (dodecagon-to-dodecagon
  // axis-aligned distance through a square).
  'kisrhombille': {
    t1: { x: 4.732050807568877, y: 0 },                          // (3+√3, 0)
    t2: { x: 2.3660254037844388, y: 4.098076211353316 },         // ((3+√3)/2, (3+3√3)/2)
    tiles: [
      // Even chirality — canonical T_0 (sq at angle 0°, hex at 30°)
      {
        sides: 3, regular: false, tileTypeId: '3',
        // CCW from A (90° sq centre): A, B (60° hex centre), C (30° dodec centre = origin)
        vertices: [
          { x: 2.3660254037844388, y: 0 },                       // A = ((3+√3)/2, 0)
          { x: 2.3660254037844388, y: 1.3660254037844386 },      // B = ((3+√3)/2, (1+√3)/2)
          { x: 0, y: 0 },                                         // C
        ],
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },                                                      // 0°
          { a: 0.5, b: -0.8660254037844386, tx: 0, c: 0.8660254037844386, d: 0.5, ty: 0 },               // 60°
          { a: -0.5, b: -0.8660254037844386, tx: 0, c: 0.8660254037844386, d: -0.5, ty: 0 },             // 120°
          { a: -1, b: 0, tx: 0, c: 0, d: -1, ty: 0 },                                                    // 180°
          { a: -0.5, b: 0.8660254037844386, tx: 0, c: -0.8660254037844386, d: -0.5, ty: 0 },             // 240°
          { a: 0.5, b: 0.8660254037844386, tx: 0, c: -0.8660254037844386, d: 0.5, ty: 0 },               // 300°
        ],
      },
      // Odd chirality — mirror of T_0 across radial at 30° (T_1: hex at 30°, sq at 60°)
      {
        sides: 3, regular: false, tileTypeId: '3',
        // CCW from B' (60° hex centre at 30°): B', A' (90° sq centre at 60°), C' (origin)
        vertices: [
          { x: 2.3660254037844388, y: 1.3660254037844386 },      // B' = hex at 30°
          { x: 1.1830127018922194, y: 2.049038105676658 },       // A' = sq at 60° = ((3+√3)/4, (3√3+3)/4)
          { x: 0, y: 0 },                                         // C'
        ],
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },                                                      // 0°
          { a: 0.5, b: -0.8660254037844386, tx: 0, c: 0.8660254037844386, d: 0.5, ty: 0 },               // 60°
          { a: -0.5, b: -0.8660254037844386, tx: 0, c: 0.8660254037844386, d: -0.5, ty: 0 },             // 120°
          { a: -1, b: 0, tx: 0, c: 0, d: -1, ty: 0 },                                                    // 180°
          { a: -0.5, b: 0.8660254037844386, tx: 0, c: -0.8660254037844386, d: -0.5, ty: 0 },             // 240°
          { a: 0.5, b: 0.8660254037844386, tx: 0, c: -0.8660254037844386, d: 0.5, ty: 0 },               // 300°
        ],
      },
    ],
  },

  // ── Deltoidal trihexagonal (Laves dual of 3.4.6.4) ─────
  // 60°-90°-120°-90° kite (same base shape the Hat aperiodic
  // monotile is built from — 8 kites per Hat). p6m symmetry.
  // 6 kites meet at each hex-centre (60° vertex), 4 at each
  // square-dual centre (90° vertex), 3 at each triangle-dual
  // centre (120° vertex). 6 kites per fundamental cell, rotated
  // 0°/60°/.../300° around the hex-centre at origin.
  // Long edges (adjacent to 60° vertex) = 1 (canonical),
  // short edges (adjacent to 120° vertex) = 1/√3 ≈ 0.577.
  'deltoidal-trihexagonal': {
    t1: { x: 2, y: 0 },
    t2: { x: 1, y: 1.7320508075688772 },
    tiles: [
      {
        sides: 4, regular: false,
        // CCW: A (60° at origin), B (90°), C (120° apex), D (90°)
        vertices: [
          { x: 0, y: 0 },                              // A
          { x: 0.5, y: 0.8660254037844386 },           // B (1/2, √3/2)
          { x: 0, y: 1.1547005383792515 },             // C (0, 2√3/3)
          { x: -0.5, y: 0.8660254037844386 },          // D (-1/2, √3/2)
        ],
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },                                                     // 0°
          { a: 0.5, b: -0.8660254037844386, tx: 0, c: 0.8660254037844386, d: 0.5, ty: 0 },              // 60°
          { a: -0.5, b: -0.8660254037844386, tx: 0, c: 0.8660254037844386, d: -0.5, ty: 0 },            // 120°
          { a: -1, b: 0, tx: 0, c: 0, d: -1, ty: 0 },                                                   // 180°
          { a: -0.5, b: 0.8660254037844386, tx: 0, c: -0.8660254037844386, d: -0.5, ty: 0 },            // 240°
          { a: 0.5, b: 0.8660254037844386, tx: 0, c: -0.8660254037844386, d: 0.5, ty: 0 },              // 300°
        ],
      },
    ],
  },

  // ── Floret pentagonal (Laves dual of 3⁴.6) ─────────────
  // Irregular pentagon: one 60° vertex + four 120° vertices;
  // three short edges (length 1) + two long edges (length 2).
  // 6 pentagons meet at each 60° vertex forming a "flower";
  // flowers tile a hexagonal lattice with spacing √21.
  // 6 pentagons per fundamental cell, rotated 0°/60°/.../300°
  // around the central 60° vertex at origin (= V0).
  // Vertices listed CCW starting at the long-edge end-vertex
  // (a 120° corner) so first edge V1→V2 is short = canonical = 1.
  'floret-pentagonal': {
    t1: { x: 3, y: 3.4641016151377544 },               // (3, 2√3)
    t2: { x: -1.5, y: 4.330127018922193 },             // (-3/2, 5√3/2)
    tiles: [
      {
        sides: 5, regular: false,
        vertices: [
          { x: 1, y: 1.7320508075688772 },             // V1 (120°)
          { x: 0.5, y: 2.598076211353316 },            // V2 (120°)
          { x: -0.5, y: 2.598076211353316 },           // V3 (120°)
          { x: -1, y: 1.7320508075688772 },            // V4 (120°)
          { x: 0, y: 0 },                              // V0 (60°)
        ],
        transforms: [
          // 6 rotations around V0 = origin
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },                                                     // 0°
          { a: 0.5, b: -0.8660254037844386, tx: 0, c: 0.8660254037844386, d: 0.5, ty: 0 },              // 60°
          { a: -0.5, b: -0.8660254037844386, tx: 0, c: 0.8660254037844386, d: -0.5, ty: 0 },            // 120°
          { a: -1, b: 0, tx: 0, c: 0, d: -1, ty: 0 },                                                   // 180°
          { a: -0.5, b: 0.8660254037844386, tx: 0, c: -0.8660254037844386, d: -0.5, ty: 0 },            // 240°
          { a: 0.5, b: 0.8660254037844386, tx: 0, c: -0.8660254037844386, d: 0.5, ty: 0 },              // 300°
        ],
      },
    ],
  },

  // ── Rhombille (Laves dual of 3.6.3.6) ──────────────────
  // 60°/120° rhombi, p6m. Hexagonal lattice with edge √3
  // (= rhombus long diagonal). 3 rhombi per fundamental cell,
  // all sharing one 60° vertex at the cell origin; 6 rhombi
  // total meet at each "star vertex" of the lattice.
  // Canonical rhombus edge = 1.
  'rhombille': {
    t1: { x: 1.7320508075688772, y: 0 },         // (√3, 0)
    t2: { x: 0.8660254037844386, y: 1.5 },       // (√3/2, 3/2)
    tiles: [
      {
        sides: 4, regular: false,
        // Rhombus with 60° vertex at origin, long diagonal along +x,
        // listed CCW: 60° (origin) → 120° (below) → 60° (far) → 120° (above)
        vertices: [
          { x: 0, y: 0 },
          { x: 0.8660254037844386, y: -0.5 },
          { x: 1.7320508075688772, y: 0 },
          { x: 0.8660254037844386, y: 0.5 },
        ],
        transforms: [
          // 0° — rhombus along +x
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
          // 60° CCW
          { a: 0.5, b: -0.8660254037844386, tx: 0,
            c: 0.8660254037844386, d: 0.5, ty: 0 },
          // 120° CCW
          { a: -0.5, b: -0.8660254037844386, tx: 0,
            c: 0.8660254037844386, d: -0.5, ty: 0 },
        ],
      },
    ],
  },

  // ── 16-fold: hexadecagonal rosette ─────────────────────
  // One regular 16-gon at the origin of each square lattice cell,
  // sharing four edges with its N/S/E/W neighbours. The remaining
  // gap at (1, 1) is a non-convex 12-gon with 4-fold rotational
  // symmetry (4 convex 45° corners where two 16-gons meet, 8
  // reflex 202.5° vertices interior to single 16-gon edges).
  // Inradius = 1; 16-gon edge length = 2·tan(π/16) ≈ 0.3978.
  'hexadecagonal-rosette': {
    t1: { x: 2, y: 0 },
    t2: { x: 0, y: 2 },
    tiles: [
      {
        sides: 16, regular: true,
        transforms: [
          { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
        ],
      },
      {
        // Concave 12-gon gap centred at (1, 1), CCW
        sides: 12, regular: false, tileTypeId: '12',
        vertices: [
          { x: 1, y: 0.19891236737965802 },
          { x: 1.1522409349774265, y: 0.5664205909918782 },
          { x: 1.4335794090081218, y: 0.8477590650225735 },
          { x: 1.801087632620342, y: 1 },
          { x: 1.4335794090081218, y: 1.1522409349774265 },
          { x: 1.1522409349774265, y: 1.4335794090081218 },
          { x: 1, y: 1.801087632620342 },
          { x: 0.8477590650225735, y: 1.4335794090081218 },
          { x: 0.5664205909918782, y: 1.1522409349774265 },
          { x: 0.19891236737965802, y: 1 },
          { x: 0.5664205909918782, y: 0.8477590650225735 },
          { x: 0.8477590650225735, y: 0.5664205909918782 },
        ],
        transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
      },
    ],
  },
}
