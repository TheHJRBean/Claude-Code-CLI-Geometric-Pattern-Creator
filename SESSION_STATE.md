## Goal
Fix alternating direction curves — the alternating mode produces visually inconsistent curve directions.

## Plan
- [done] Read all relevant code (computeCurves, buildStrands, curvedPathD, PIC pipeline, StrandLayer, types)
- [done] Review 4 prior approaches and their failures documented in memory
- [done] Analyze root cause of alternating parity inconsistency
- [done] Design and implement fix: per-polygon edge-based deterministic parity
- [done] Verify logic with unit tests (octagon, hexagon, triangle, mixed types)
- [done] Type-check passes
- [todo] Visual test in browser across multiple tilings

## Done
- Replaced graph-based 2-coloring in `buildAlternatingParity` with per-polygon edge-grouping
- Removed strand adjacency constraints that caused cross-polygon conflicts
- Verified with synthetic data: same-edge segments get same parity, adjacent edges alternate
- Cleaned up debug overlay code

## Next
- Visually verify in browser at http://localhost:5173/ with multiple tilings (4.8.8, 6.6.6, etc.)
- Commit and push once verified

## Decisions
- **Root cause**: Graph-based 2-coloring had conflicting constraints between polygon cycle edges and strand adjacency edges, creating odd cycles and inconsistent parities
- **Fix approach**: Per-polygon edge-based grouping. Segments grouped by edgeMidpoint within each polygon, edges sorted by angle from center, parity = edgeIndex % 2. No strand constraints.
- **Trade-off**: Cross-polygon parity is independent (may cause S-curves at polygon boundaries). Within-polygon alternation is guaranteed correct for all even-sided polygons.
- **Odd-sided polygons**: One pair of adjacent edges will share parity (inherent to odd cycles, same as old approach)

## Blockers
- None — awaiting visual verification
