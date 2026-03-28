# Tiling Bug Investigation — Progress Notes

**Date:** 2026-03-27
**Branch:** `feat/art-deco-egypt-theme-revamp`
**Status:** Root cause narrowed but not yet fixed

---

## Summary

The user reports **visible gaps between polygons** in certain tilings. Two tilings are confirmed broken:

| Tiling | Inner Gaps | Registry Rejections | Overlap Rejections |
|--------|-----------|--------------------|--------------------|
| **3.3.3.4.4** (elongated triangular) | **15** | 579 | 139 |
| **3.3.4.3.4** (snub square) | **2** | 739 | 128 |
| All other Archimedean tilings | 0 | varies | varies |

The gaps are **not caused by** MAX_POLYGONS or vtxKey precision — changing these had zero effect (same polygon count, same gaps).

---

## What Was Ruled Out

### 1. Seed Orientation Formula — NOT A BUG

The previous session incorrectly identified the new formula as broken. The confusion was between SVG y-down coords and standard math y-up coords.

**Current formula:** `seedPhi = seedSides % 4 === 0 ? Math.PI / seedSides : 0`

In SVG (y-down), "top" = most negative y. A vertex at angle 270 degrees (3pi/2) sits at the top. This happens when `3n/4` is an integer, i.e., `n % 4 === 0`. The formula correctly rotates only those polygons.

| n | phi=0 orientation | Needs rotation? | Formula applies? |
|---|-------------------|-----------------|------------------|
| 3 | flat-top | No | No (3%4!=0) |
| 4 | pointy-top | Yes | Yes (4%4=0) |
| 6 | **flat-top** | **No** | No (6%4!=0) |
| 8 | pointy-top | Yes | Yes (8%4=0) |
| 12 | pointy-top | Yes | Yes (12%4=0) |

Verified empirically: hexagon with phi=0 has vertices at 240 and 300 degrees forming a horizontal top edge (flat-top). The OLD formula `seedSides === 6 ? PI/6 : 0` actually made hexagons POINTY-top (vertex at 270 degrees). The new formula is an improvement.

### 2. computeNeighborSides Algorithm — NOT A BUG

The previous session flagged a "critical flaw" where configPos `p` gets stuck when a polygon type appears only once in the vertex config. This was a false alarm.

**Why it's correct:** Even when `p` is stuck, the direction `d` still alternates at each vertex, producing correct neighbor types. Traced and verified for:

- **4.8.8:** square(cp0) -> [8,8,8,8], octagon(cp1) -> [8,4,8,4,8,4,8,4], octagon(cp2) -> [4,8,4,8,4,8,4,8]
- **3.4.6.4:** triangle(cp0) -> [4,4,4], square(cp1) -> [6,3,6,3], hexagon(cp2) -> [4,4,4,4,4,4]
- **4.6.12 (chiral):** 12-gon(cp2) -> [4,6,4,6,...], square(cp0) -> [6,12,6,12], hexagon(cp1) -> [12,4,12,4,12,4]
- **3.3.4.3.4 (snub square, chiral):** triangle(cp0) -> [3,4,4], triangle(cp1) -> [4,4,3], triangle(cp3) -> [4,3,4] — all 2 squares + 1 triangle, which is correct per Euler counting
- **3.3.3.3.6 (snub hex):** hexagon(cp4) -> [3,3,3,3,3,3], triangle(cp0) -> [3,3,3], triangle(cp3) -> [6,3,3]

All 111 existing tests pass. configPos propagation to BFS neighbors was also verified correct.

### 3. MAX_POLYGONS Limit — NOT THE CAUSE

Increasing from 2000 to 5000 produced identical results (same polygon count, same gaps). The BFS exhausts the queue before hitting the limit for these viewport/edgeLen settings.

### 4. vtxKey Precision — NOT THE CAUSE

Changing vtxKey precision from 1 to 3 produced identical results. At edgeLen=50, precision=1 (0.1 unit resolution) is sufficient to distinguish vertices that are at least 50 units apart.

---

## What IS Causing the Gaps

The gaps occur because the **vertex registry and/or spatial hash reject valid neighbor placements**. Key evidence:

- 3.3.3.4.4 has **579 registry rejections** and **139 overlap rejections**
- The BFS exhausts its queue with only 347 polygons placed (well below MAX_POLYGONS=2000)
- Gaps persist regardless of vtxKey precision or MAX_POLYGONS settings

### Gap Characteristics (3.3.3.4.4)

All 15 inner gap edges share a pattern:
- They are **vertical edges** at x approximately +/- 68.30
- Parent polygons are **triangles** (sides=3)
- The gap is at **edge 0** of these triangles
- The missing neighbor across the gap edge was never placed

Example gap edges:
```
Gap #1: edge A=(-68.30, 0.00) B=(-68.30, -50.00), parent=p8 (triangle at center -53.87,-25.00)
Gap #2: edge A=(68.30, -0.00) B=(68.30, 50.00), parent=p13 (triangle at center 53.87,25.00)
Gap #3: edge A=(68.30, 50.00) B=(68.30, 100.00), parent=p14 (triangle at center 53.87,75.00)
```

### Sample Registry Rejections

```
parent=p8(s=3) edge=0 neighbor_type=4 at (-46.7,-37.5) countA=0/2 countB=2/2 vtxKeyB=-250,-250
parent=p12(s=3) edge=0 neighbor_type=3 at (68.3,25.0) countA=3/3 countB=3/3 vtxKeyA=683,0 vtxKeyB=683,500
parent=p13(s=3) edge=0 neighbor_type=3 at (68.3,75.0) countA=3/3 countB=1/3 vtxKeyA=683,500 vtxKeyB=683,1000
```

The registry says these vertices already have max polygons of the needed type. But are those counts correct? This is the key question still to answer.

---

## Next Steps to Investigate

### Hypothesis A: Eager Registration Over-Counts

When a neighbor is queued (before it's fully expanded), ALL its vertices are registered in the VertexRegistry (line 183 of archimedean.ts). This "uses up" vertex slots at vertices that the neighbor shares with OTHER future polygons. If the BFS explores in an order where one branch registers vertices eagerly, another branch may find those vertices "full" and skip valid placements.

**To test:** Track which polygon registered at each vertex and verify whether the count is truly correct for the final tiling geometry. Or try a "lazy registration" approach where vertices are only registered when a polygon is dequeued (placed), not when queued.

### Hypothesis B: Spatial Hash False Positives

139 overlap rejections at 0.8 threshold — some might be false positives where non-adjacent polygons are incorrectly flagged as overlapping. The 0.8 multiplier means polygons must have centers > 80% of (inradius1 + inradius2) apart.

**To test:** Remove the spatial hash check entirely and see if gaps disappear (overlaps would appear instead, confirming or denying this).

### Hypothesis C: computeNeighborSides Returns Wrong configPos for Propagation

Even though neighbor TYPES are correct, the propagated configPos might not match the neighbor's actual geometric context. When the neighbor is later expanded, its edges would get wrong neighbor types. This would cause cascading errors.

**To test:** For the gap edges specifically, trace the full configPos propagation chain from seed to the parent triangle, verify each step.

### Hypothesis D: The Two Affected Tilings Have Unique Geometry

Both 3.3.3.4.4 and 3.3.4.3.4 are 4-fold tilings with seedSides=4. Both have triangles in their vertex config. Other triangle-containing tilings (3.6.3.6, 3.4.6.4, triangular) work fine. The difference might be related to:
- Multiple consecutive triangles in the config (3,3,3 in 3.3.3.4.4; 3,3 in 3.3.4.3.4)
- How the BFS handles triangle placement near squares

---

## Recommended Fix Approach

Once root cause is confirmed, likely fixes:

1. **If Hypothesis A (eager registration):** Change to lazy registration — only register vertices when a polygon is dequeued and placed, not when queued. This prevents premature vertex saturation.

2. **If Hypothesis B (spatial hash):** Remove or weaken the overlap check, or switch to exact edge-sharing detection instead of center-distance heuristics.

3. **If Hypothesis C (configPos):** Fix the configPos computation or propagation logic.

4. **General improvement:** Add edge-sharing validation tests that check every Archimedean tiling for interior gaps.

---

## Code Structure Reference

### Key Files
- `src/tilings/archimedean.ts` — BFS tiling generator (220 lines)
  - `VertexRegistry` (lines 44-65) — tracks polygon counts at each vertex
  - `SpatialHash` (lines 71-115) — overlap detection with 0.8 threshold
  - `generateTiling()` (lines 124-191) — main BFS loop
  - `buildEdgeMap()` (lines 197-219) — edge deduplication for PIC pipeline
- `src/tilings/neighborSides.ts` — configPos-based neighbor inference (57 lines)
- `src/tilings/shared.ts` — `createPolygon`, `neighborPolygon`, key functions (53 lines)
- `src/tilings/index.ts` — 14 tiling definitions (241 lines)

### Key Lines in archimedean.ts
- Line 38: `vtxKey` precision = 1 (not the issue)
- Line 109: spatial hash 0.8 threshold
- Line 138: seedPhi formula (correct)
- Line 153: seedConfigPos = vertexConfig.indexOf(seedSides)
- Lines 174-175: registry validation check
- Line 181: spatial.overlaps check
- Line 183: **eager registration** — `registry.addPolygon(neighbor)` BEFORE queueing

### Tiling Definitions for Broken Tilings
```
3.3.3.4.4: vertexConfig=[3,3,3,4,4], seedSides=4, foldSymmetry=4
3.3.4.3.4: vertexConfig=[3,3,4,3,4], seedSides=4, foldSymmetry=4 (chiral)
```

---

## Test Coverage Gaps

Three tilings lack neighborSides unit tests (should be added regardless of bug fix):
- 3.3.3.4.4 (elongated triangular)
- 3.3.4.3.4 (snub square, chiral)
- 3.3.3.3.6 (snub hexagonal, chiral)

No tests check for tiling completeness (all interior edges shared by exactly 2 polygons).

---

## Diagnostic Scripts Used

### Gap detection (run with `npx tsx -e`)
```typescript
import { TILINGS } from './src/tilings/index'
import { generateTiling, buildEdgeMap } from './src/tilings/archimedean'

const viewport = { x: -200, y: -200, width: 400, height: 400 }
const edgeLen = 50
const inner = { x: -100, y: -100, width: 200, height: 200 }

for (const [name, def] of Object.entries(TILINGS)) {
  if (def.category !== 'archimedean') continue
  const polygons = generateTiling(def, viewport, edgeLen)
  const edgeMap = buildEdgeMap(polygons, edgeLen)
  let innerGaps = 0
  for (const [, edge] of edgeMap) {
    const mid = { x: (edge.a.x + edge.b.x)/2, y: (edge.a.y + edge.b.y)/2 }
    if (mid.x > -100 && mid.x < 100 && mid.y > -100 && mid.y < 100 && edge.polygonIds.length === 1)
      innerGaps++
  }
  console.log(name + ': ' + polygons.length + ' polys, ' + innerGaps + ' inner gaps')
}
```

### BFS instrumentation
See the conversation for the full instrumented BFS that logs registry rejections, which was used to identify the 579/739 rejection counts and specific rejection details.

---

## Lacing/Weaving Note

The user confirmed that lacing/weaving "has never worked" and should be ignored for now. The over-under strand logic in `src/rendering/StrandLayer.tsx` is a known non-functional feature.
