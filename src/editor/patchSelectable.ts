import type { Vec2 } from '../utils/math'
import { pointsEqual, rotate } from '../utils/math'
import type { EditorPatch, EditorCell, EditorTile } from '../types/editor'
import { computeAllCycles, computeBoundaryCycle } from './boundary'
import { EDITOR_EPS, tileVertices } from './exposedEdges'
import { applyStamp, editorNeighbourStamps, type LatticeStamp } from './lattice'
import { compositionNeighbourStamps, patchRotation } from './compositionLattice'
import { ensureCCW } from './complete'
import { validateNGapPolygon } from './completeN'
import { overlapsExistingDetail, type OverlapDetail } from './tileOverlap'
import { frameOutlinePolygon, computeFrameSections, frameNodePoints } from './frame'
import { collectGuideAnchors, type GuideAnchor } from './guides'
import { activeCell } from './active'

/**
 * Patch-frame helpers for Complete mode.
 *
 * In multi-cell Configurations the canvas exposes vertex picks from every
 * Cell *plus* composition-stamped neighbour copies. The per-Cell selectable
 * inside `placePolygonsOnOrbit` didn't include those — so picks across Cells
 * or onto neighbour stamps silently no-opped. These helpers aggregate every
 * clickable position into Patch-local coords so the reducer can validate
 * picks against the same set the user sees on screen.
 *
 * Single-cell Patches collapse naturally: one Cell, per-Cell one-ring stamps
 * (same set the canvas uses in single-cell), no cross-Cell story.
 */

/** Rotate a `Vec2` about the origin by `theta`. */
function rotateAboutOrigin(p: Vec2, theta: number): Vec2 {
  return theta === 0 ? p : rotate(p, theta)
}

/**
 * Cell-local → Patch-world. Rotate about origin by the Cell rotation, translate
 * by the Cell centre, then apply any rigid Patch-level alternate rotation
 * (`patchRot`) about the Patch origin. `patchRot` defaults to 0 — single-cell
 * and non-alternate composites are unchanged.
 */
export function applyCellTransform(
  p: Vec2,
  cell: { center: Vec2; rotation: number },
  patchRot = 0,
): Vec2 {
  const r = cell.rotation === 0 ? p : rotate(p, cell.rotation)
  const base = { x: r.x + cell.center.x, y: r.y + cell.center.y }
  return rotateAboutOrigin(base, patchRot)
}

/**
 * Inverse of a rotation-about-origin-then-translation transform. Reused for
 * both Cell transforms and lattice stamps (both have the same shape).
 */
export function inverseRotateTranslate(p: Vec2, t: { translation: Vec2; rotation: number }): Vec2 {
  const d = { x: p.x - t.translation.x, y: p.y - t.translation.y }
  return t.rotation === 0 ? d : rotate(d, -t.rotation)
}

/** Patch-world → Cell-local. Inverse of `applyCellTransform` (un-rotates the
 *  Patch-level rotation first, then the Cell transform). */
export function inverseCellTransform(
  p: Vec2,
  cell: { center: Vec2; rotation: number },
  patchRot = 0,
): Vec2 {
  const pre = rotateAboutOrigin(p, -patchRot)
  return inverseRotateTranslate(pre, { translation: cell.center, rotation: cell.rotation })
}

/** Axis-aligned bounding box (world coords) enclosing `points`. */
function boundingBox(points: Vec2[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Neighbour-stamp set local to the given `points` (Complete-mode picks).
 *
 * The canvas exposes the *full visible lattice* of neighbour copies, which is
 * viewport-dependent — but the reducer has no viewport. Instead of a fixed
 * ring we generate just the lattice stamps in a box around the picks. The
 * lattice generators only add a one-cell margin, while a sprawling Patch's
 * vertices can sit many lattice cells away from their copy's stamp origin —
 * so the box is inflated by the Patch's own selectable-vertex radius to
 * guarantee every stamp whose copy can reach a pick is generated. This
 * accepts any neighbour copy the user can click, however far they've panned,
 * while staying viewport-free.
 */
export function neighbourStampsNear(patch: EditorPatch, points: Vec2[]): LatticeStamp[] {
  if (points.length === 0) return []
  const box = boundingBox(points)
  // Patch extent: max distance of any selectable vertex from the Patch origin.
  // A stamped copy's vertex is stamp.translation + (rotated) patch-local
  // vertex, so the matching stamp's translation lies within this radius of
  // the pick.
  const patchRot = patchRotation(patch)
  let r = 0
  for (const cell of patch.cells) {
    for (const v of cellLocalSelectableVertices(cell)) {
      const w = applyCellTransform(v, cell, patchRot)
      const d = Math.hypot(w.x, w.y)
      if (d > r) r = d
    }
  }
  const inflated = {
    x: box.x - r,
    y: box.y - r,
    width: box.width + 2 * r,
    height: box.height + 2 * r,
  }
  return patch.cells.length > 1
    ? compositionNeighbourStamps(patch, inflated)
    : editorNeighbourStamps(patch.cells[0], inflated)
}

/**
 * Every vertex of a single Cell the user can click, in Cell-local coords:
 * the outer tile cycle, interior pocket cycles, and the Cell-Boundary corners.
 * Shared by the live-Patch and neighbour-stamp membership tests so the two
 * always agree, and mirrors the canvas pick-target build in `Canvas.tsx`.
 */
export function cellLocalSelectableVertices(cell: EditorCell): Vec2[] {
  const cycles = computeAllCycles(cell)
  const verts = [
    ...cycles.outer.map(v => v.p),
    ...cycles.pockets.flat().map(v => v.p),
    ...computeBoundaryCycle(cell).map(v => v.p),
  ]
  // No-Seed Cells have no interior anchor — the only pickable targets are the
  // Boundary corners around the rim. Expose the Cell centre (Cell-local origin,
  // where `editorBoundaryVertices` centres every Boundary) as a completion node
  // so the user can build wedge Tiles radially from the middle out to the
  // Boundary corners (2026-07-08). Kept in sync with the Canvas `centre`
  // overlay so the reducer accepts the same points the user can click.
  if (cell.noSeed) verts.push({ x: 0, y: 0 })
  return verts
}

/**
 * The distinct **Frame node** points (edge nodes + corners) the user can click
 * in Complete mode, in Patch-world coords. Only Shape Frames expose nodes —
 * n-ring Frames are clip-only. Returns [] when no Shape Frame is present. The
 * Frame has its own origin/rotation independent of the Cells, so these are
 * already world-space and need no Cell transform.
 */
export function frameSelectablePoints(patch: EditorPatch): Vec2[] {
  const frame = patch.frame
  if (!frame || frame.type !== 'shape') return []
  const outline = frameOutlinePolygon(frame)
  if (!outline) return []
  return frameNodePoints(computeFrameSections(outline, patch.edgeLength))
}

/**
 * True if `p` is a vertex the user can legitimately click in Complete mode:
 * any Cell's outer / pocket / Boundary-corner vertex, or — when
 * `includeNeighbours` — any neighbour-stamp copy of one, or a Frame node. The
 * neighbour test is pick-local (see `neighbourStampsNear`) so it matches the
 * canvas's full-lattice exposure without enumerating a viewport. Frame nodes
 * count only under `includeNeighbours`, i.e. they are "floating": the
 * non-floating rule still forces ≥1 real Patch vertex per completion, so a
 * polygon can't be built purely from Frame nodes.
 */
export function isPatchSelectableVertex(patch: EditorPatch, p: Vec2, includeNeighbours: boolean): boolean {
  const patchRot = patchRotation(patch)
  for (const cell of patch.cells) {
    for (const v of cellLocalSelectableVertices(cell)) {
      if (pointsEqual(p, applyCellTransform(v, cell, patchRot), EDITOR_EPS)) return true
    }
  }
  if (!includeNeighbours) return false
  for (const fp of frameSelectablePoints(patch)) {
    if (pointsEqual(p, fp, EDITOR_EPS)) return true
  }
  for (const stamp of neighbourStampsNear(patch, [p])) {
    for (const cell of patch.cells) {
      for (const v of cellLocalSelectableVertices(cell)) {
        if (pointsEqual(p, applyStamp(applyCellTransform(v, cell, patchRot), stamp), EDITOR_EPS)) return true
      }
    }
  }
  return false
}

/**
 * Forward-transform a Tile from source-Cell-local through an optional stamp
 * into Patch-local, then inverse the target Cell's transform to land in
 * target-Cell-local. Returns the rewritten Tile ready to drop into
 * `target.tiles[]`. When `source === target` and `stamp === null`, the
 * transforms cancel and the returned Tile is geometrically identical.
 */
export function retargetTile(
  tile: EditorTile,
  source: EditorCell,
  stamp: LatticeStamp | null,
  target: EditorCell,
  patchRot = 0,
): EditorTile {
  const stampRot = stamp?.rotation ?? 0
  const netRot = source.rotation + stampRot - target.rotation
  const through = (p: Vec2): Vec2 => {
    const afterCell = applyCellTransform(p, source, patchRot)
    const afterStamp = stamp ? applyStamp(afterCell, stamp) : afterCell
    return inverseCellTransform(afterStamp, target, patchRot)
  }
  if (tile.kind === 'regular') {
    return { ...tile, center: through(tile.center), rotation: tile.rotation + netRot }
  }
  return { ...tile, vertices: tile.vertices.map(through) }
}

/** True if `p` matches any vertex in `set` within `EDITOR_EPS`. */
export function isSelectable(p: Vec2, set: Vec2[]): boolean {
  return set.some(q => pointsEqual(p, q, EDITOR_EPS))
}

/**
 * Existing-tile vertex arrays from every Cell in the Patch, expressed in
 * `host`'s local frame. Sibling Cells get their tiles forward-transformed
 * through their own cellTransform then inverse-transformed through `host`'s,
 * so overlap / adjacency checks can compare the candidate tile (in `host`-
 * local) against the entire Patch's tiles uniformly.
 */
export function existingTilesInHostFrame(patch: EditorPatch, host: EditorCell): Vec2[][] {
  const out: Vec2[][] = []
  for (const cell of patch.cells) {
    for (const tile of cell.tiles) {
      const local = tileVertices(tile)
      if (cell.id === host.id) {
        out.push(local)
        continue
      }
      const patchLocal = local.map(v => applyCellTransform(v, cell))
      out.push(patchLocal.map(v => inverseCellTransform(v, host)))
    }
  }
  return out
}

/**
 * Result of `validateMultiPick`. Mirrors the reducer's gating in
 * `multiPickCompleteAcrossPatch`, so the preview can show red / green in
 * real time without the user having to press Enter to discover the
 * rejection.
 */
export type MultiPickValidity =
  | { kind: 'valid' }
  | { kind: 'too-few' }
  | { kind: 'pick-not-selectable' }
  | { kind: 'no-real-cell-pick' }
  | { kind: 'duplicate-vertex' }
  | { kind: 'self-intersecting' }
  | { kind: 'inside-tile' }
  | { kind: 'overlaps-existing'; detail: OverlapDetail }

/** Human-readable label for the preview overlay. */
export function multiPickValidityLabel(v: MultiPickValidity): string | null {
  switch (v.kind) {
    case 'valid': return null
    case 'too-few': return 'Pick at least 3 vertices.'
    case 'pick-not-selectable': return 'A pick is off the selectable set.'
    case 'no-real-cell-pick': return 'At least one pick must be on the live Patch (not only neighbour stamps).'
    case 'duplicate-vertex': return 'Duplicate pick — each vertex must be distinct.'
    case 'self-intersecting': return 'Polygon self-intersects — re-order picks.'
    case 'inside-tile': return 'Polygon centroid lies inside an existing Tile.'
    case 'overlaps-existing': {
      switch (v.detail.rule) {
        case 'polygon-vertex-inside-tile': return 'A pick lies inside an existing Tile.'
        case 'tile-vertex-inside-polygon': return 'Polygon encloses an existing Tile vertex.'
        case 'edge-crossing': return 'Polygon edge crosses an existing Tile edge.'
      }
    }
  }
}

/**
 * Validate a multi-pick (Ctrl-click + Enter) attempt against the same
 * gates the reducer applies. Used by the canvas preview to colour the
 * polygon red/green live.
 */
export function validateMultiPick(patch: EditorPatch, picks: Vec2[]): MultiPickValidity {
  if (picks.length < 3) return { kind: 'too-few' }
  const patchRot = patchRotation(patch)
  // Guide Anchors (slice 3) join the pickable + grounding sets (spec Decision 4
  // relaxes grounding so free-standing Anchor-only Completes preview green).
  const guideAnchors = collectGuideAnchors(patch, patchRot)
  const guideAt = (p: Vec2): GuideAnchor | undefined =>
    guideAnchors.find(a => pointsEqual(p, a.p, EDITOR_EPS))
  if (!picks.every(p => isPatchSelectableVertex(patch, p, true) || guideAt(p))) return { kind: 'pick-not-selectable' }
  if (!picks.some(p => isPatchSelectableVertex(patch, p, false) || guideAt(p))) return { kind: 'no-real-cell-pick' }

  // World-space Guide completion (mirrors the reducer): a non-stamping Guide
  // Anchor that isn't also a real Cell vertex ⇒ validate the polygon in world
  // space against every existing world Tile, not Cell-local.
  const worldSpaceGuide = picks.some(p => {
    const a = guideAt(p)
    return a && !a.stamp && !isPatchSelectableVertex(patch, p, false)
  })
  if (worldSpaceGuide && !(patch.frame && picks.some(p => isSelectable(p, frameSelectablePoints(patch))))) {
    const worldTiles = worldTileVertexArrays(patch, patchRot)
    const probe = worldProbeCell(patch, patchRot, worldTiles)
    const ngap = validateNGapPolygon(picks, probe)
    if (ngap.kind === 'too-few') return { kind: 'too-few' }
    if (ngap.kind === 'duplicate-vertex') return { kind: 'duplicate-vertex' }
    if (ngap.kind === 'self-intersecting') return { kind: 'self-intersecting' }
    if (ngap.kind === 'inside-tile') return { kind: 'inside-tile' }
    const detail = overlapsExistingDetail(ensureCCW([...picks]), worldTiles)
    if (detail) return { kind: 'overlaps-existing', detail }
    return { kind: 'valid' }
  }

  const active = patch.cells.find(c => c.id === patch.activeCellId) ?? patch.cells[0]
  const localPicks = picks.map(p => inverseCellTransform(p, active, patchRot))
  const ngap = validateNGapPolygon(localPicks, active)
  if (ngap.kind === 'too-few') return { kind: 'too-few' }
  if (ngap.kind === 'duplicate-vertex') return { kind: 'duplicate-vertex' }
  if (ngap.kind === 'self-intersecting') return { kind: 'self-intersecting' }
  if (ngap.kind === 'inside-tile') return { kind: 'inside-tile' }

  const candidate = ensureCCW([...localPicks])
  const userTiles = existingTilesInHostFrame(patch, active)
  const detail = overlapsExistingDetail(candidate, userTiles)
  if (detail) return { kind: 'overlaps-existing', detail }

  return { kind: 'valid' }
}

/** World-space vertex arrays of every existing Tile across all Cells, plus
 *  prior world-space completions (frame + guide). Shared by the world-space
 *  Guide-completion preview + overlap check and the reducer's world-space
 *  placement / completion paths. */
export function worldTileVertexArrays(patch: EditorPatch, patchRot: number): Vec2[][] {
  const out: Vec2[][] = []
  for (const cell of patch.cells) {
    for (const t of cell.tiles) out.push(tileVertices(t).map(v => applyCellTransform(v, cell, patchRot)))
  }
  for (const ft of patch.frame?.completedTiles ?? []) out.push(tileVertices(ft))
  for (const gt of patch.guideTiles ?? []) out.push(tileVertices(gt))
  return out
}

/**
 * Identity-transform probe Cell holding EVERY world Tile (all Cells' Tiles
 * lifted to world space + frame + guide completions) as irregular Tiles.
 * World-space validation (`completeNGap` / `validateNGapPolygon` /
 * `isVertexPlacementViable`) runs against it directly in Patch-world coords —
 * none of those read the Cell transform, and `symmetryMode: 'none'` keeps
 * orbit-aware callers from fanning out.
 */
export function worldProbeCell(
  patch: EditorPatch,
  patchRot: number,
  worldTiles: Vec2[][] = worldTileVertexArrays(patch, patchRot),
): EditorCell {
  return {
    ...activeCell(patch),
    center: { x: 0, y: 0 },
    rotation: 0,
    symmetryMode: 'none',
    tiles: worldTiles.map((vs, i): EditorTile => ({ id: `world-${i}`, kind: 'irregular', vertices: vs, source: 'completed' })),
  }
}
