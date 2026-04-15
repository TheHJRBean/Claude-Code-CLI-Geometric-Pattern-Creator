## Goal
Fix alternating direction curves — the alternating mode produces visually inconsistent curve directions within tiles.

## Plan
- [done] Read all relevant code and review prior approaches
- [done] Replace graph 2-coloring with per-polygon edge parity (5978494)
- [done] Identify CW tangent as wrong reference for alternation normal
- [done] Switch to radial outward reference for alternating mode
- [done] Verify with numerical analysis: uniform ±0.707 outwardness for all arms
- [done] Clean up debug code, type-check
- [todo] Visual verification in browser, commit

## Done
- Two-part fix:
  1. **Parity**: Per-polygon edge grouping replaces graph 2-coloring
  2. **Normal reference**: Outward radial replaces CW tangent for alternating mode

## Next
- Test visually in browser at http://localhost:5173/

## Decisions
- **CW tangent for same-direction**: Correct — all arms curve CW/CCW uniformly
- **CW tangent for alternating**: WRONG — flipping a CW-aligned normal by 180° has non-uniform visual effects because arms at different positions have normals at different absolute angles
- **Radial outward for alternating**: Correct — flipping an outward-aligned normal uniformly toggles between "bulge outward" and "bulge inward" (verified: dot product = ±0.707 for all octagon arms)

## Blockers
- None
