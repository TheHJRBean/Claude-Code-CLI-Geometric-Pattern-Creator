import type { Vec2 } from '../utils/math'
import type { EditorTile } from '../types/editor'

/**
 * Q11 resolution (Option B) — canonical-signature tile-type identity for the
 * editor's irregular tiles, finally lifted at 17.6a.
 *
 *   - Regular n-gon → `"<n>"` (matches the archimedean convention so a
 *     square in the editor and a square in the 4-uniform tiling share
 *     `figures["4"]`).
 *   - Irregular tile → `"<n>i:<8-char hex>"` derived from the tile's
 *     interior-angle and edge-length-ratio sequences, quantised to 4 d.p.,
 *     reduced to the lex-min cyclic / reflective rotation, and FNV-1a
 *     hashed.
 *
 * The signature is invariant under rotation, translation, scaling and
 * reflection — so two completed gaps with the same shape collapse to the
 * same `tileTypeId` and share strand-figure tuning.
 */

const QUANTIZE = 10000 // 4 decimal places

/** FNV-1a 32-bit hash → 8 lowercase hex chars. Deterministic, no deps. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Interior angles of a CCW polygon in radians. */
function interiorAngles(vertices: Vec2[]): number[] {
  const n = vertices.length
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n]
    const curr = vertices[i]
    const next = vertices[(i + 1) % n]
    const v1x = prev.x - curr.x, v1y = prev.y - curr.y
    const v2x = next.x - curr.x, v2y = next.y - curr.y
    const cosA = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))
    out.push(Math.acos(Math.max(-1, Math.min(1, cosA))))
  }
  return out
}

/** Edge lengths around a CCW polygon, normalised so the longest edge = 1. */
function normalizedEdgeLengths(vertices: Vec2[]): number[] {
  const n = vertices.length
  const lens: number[] = []
  for (let i = 0; i < n; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % n]
    lens.push(Math.hypot(b.x - a.x, b.y - a.y))
  }
  const maxLen = Math.max(...lens) || 1
  return lens.map(l => l / maxLen)
}

function quantizeArray(xs: number[]): number[] {
  return xs.map(x => Math.round(x * QUANTIZE))
}

function rotateArray<T>(xs: T[], k: number): T[] {
  const n = xs.length
  return Array.from({ length: n }, (_, i) => xs[(i + k) % n])
}

function lexCompare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

/**
 * Canonical signature for an irregular polygon. Finds the lex-min cyclic
 * rotation across both orientations (forward + reversed) of the interleaved
 * `[angle, edgeLen, angle, edgeLen, …]` quantised sequence.
 */
function canonicalSignature(vertices: Vec2[]): string {
  const angles = quantizeArray(interiorAngles(vertices))
  const edges = quantizeArray(normalizedEdgeLengths(vertices))

  const n = vertices.length
  const interleaved: number[] = []
  for (let i = 0; i < n; i++) {
    interleaved.push(angles[i])
    interleaved.push(edges[i])
  }

  // Reflection: reverse vertex order → reverse the angle/edge sequences,
  // but reverseing CCW also flips the edge-vs-vertex pairing offset by one,
  // so we rebuild from the reversed vertex order to be safe.
  const reversed = vertices.slice().reverse()
  const angles2 = quantizeArray(interiorAngles(reversed))
  const edges2 = quantizeArray(normalizedEdgeLengths(reversed))
  const interleaved2: number[] = []
  for (let i = 0; i < n; i++) {
    interleaved2.push(angles2[i])
    interleaved2.push(edges2[i])
  }

  let best = interleaved
  for (const candidate of [interleaved, interleaved2]) {
    for (let k = 0; k < n; k++) {
      // Each rotation step shifts by 2 elements (one angle + one edge pair).
      const rot = rotateArray(candidate, k * 2)
      if (lexCompare(rot, best) < 0) best = rot
    }
  }
  return best.join(',')
}

/**
 * Map an editor tile onto the `tileTypeId` consumed by `runPIC` for figure-
 * config lookup. Regular tiles share keys with the archimedean catalogue
 * (e.g. "4" for a square); irregular tiles get a canonical signature hash.
 */
export function tileTypeIdFor(tile: EditorTile): string {
  if (tile.kind === 'regular') return String(tile.sides)
  const sig = canonicalSignature(tile.vertices)
  return `${tile.vertices.length}i:${fnv1a(sig)}`
}

/**
 * Display label for a tile type, used by the strand panel. Regular tiles get
 * named labels up to dodecagon; irregular tiles get "Irregular A/B/C…" in
 * first-seen order, scoped to the current patch's distinct irregular set.
 */
const REGULAR_LABEL: Record<number, string> = {
  3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
  7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
}

export function tileTypeLabel(id: string, irregularRank: Map<string, number>): string {
  if (!id.includes('i:')) {
    const n = Number(id)
    if (Number.isFinite(n)) return REGULAR_LABEL[n] ?? `${n}-gon`
    return id
  }
  const rank = irregularRank.get(id)
  const letter = rank != null ? String.fromCharCode(65 + rank) : '?'
  return `Irregular ${letter}`
}
