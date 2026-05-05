# Archived: Step 17.4 — orbit-symmetric propagation

**Archived:** 2026-05-05 (same session it was built in).
**Original commit:** `e30fdb9 feat(editor): Step 17.4 — orbit-symmetric placement + delete`.
**Reverted by:** the commit that introduced this directory.

## Why archived

The user tried 17.4 in the browser and didn't like how propagation
felt, but wasn't yet sure what behaviour they *did* want. Rather
than iterate blindly we parked the feature wholesale and kept the
17.3 single-edge placement as the live behaviour. The code below is
preserved verbatim so a future session can lift it back, tweak it,
or use it as scaffolding for whatever shape orbit propagation
eventually takes.

## What's in here

- `symmetry.ts` — `boundarySymmetries(shape)` returning the dihedral
  group D3/D4/D6 about the boundary centre as 2x2 linear maps.
  Imports `BOUNDARY_SIDES` from `src/editor/buildEditorPolygons.ts`.
- `orbit.ts` — `orbitEdges`, `placeTilesOnOrbit` (all-or-nothing
  placement against a cumulative working state), `orbitTileIds`
  (orbit-aware delete). Imports from `../exposedEdges`,
  `./symmetry`, `../placement`.

## Restoring

1. Move both files back into `src/editor/`.
2. In `src/state/reducer.ts`:
   - Replace `import { isPlacementViable, placeRegularNGonOnEdge }
     from '../editor/placement'` with `import { placeTilesOnOrbit,
     orbitTileIds } from '../editor/orbit'`.
   - Swap `EDITOR_PLACE_TILE_ON_EDGE` and `EDITOR_DELETE_TILE` back
     to the orbit-aware versions (see the original commit
     `e30fdb9`).
3. Re-fix the relative imports inside the moved files (they expect
   to live at `src/editor/*`).

## Open design questions before re-enabling

Captured in `MEMORY.md` under the "Editor — symmetry-axis toggle"
idea: the user wants a *subgroup* picker (full / rotation-only /
vertical-only / horizontal-only / none) rather than always
propagating under the full dihedral group. Re-enabling 17.4 should
probably go hand-in-hand with that picker so the user can dial in
the symmetry they actually want.
