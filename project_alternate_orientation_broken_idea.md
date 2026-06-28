---
name: alternate-orientation-broken-in-some-design-phase-configs
description: "The Design-Phase \"Alternate orientation\" control (π/n Boundary flip) misbehaves on some Cell shapes / Configurations — needs per-config audit and fix"
metadata: 
  node_type: memory
  type: project
  originSessionId: f6e11715-fe8d-4594-8336-4284ba3c489f
---

**Status: PARTIALLY FIXED** (multi-cell case fixed 2026-05-31, commit `c56df88`)

**Multi-cell / composite — FIXED (c56df88):** the composite case was the
"rotates the tiles in place only, whole Patch never reorients" report. Root
cause: `SET_EDITOR_ALTERNATE_BOUNDARY` set per-Cell `alternateBoundary` on
every Cell, spinning each Cell's outline by its *own* π/n while leaving tiles
+ lattice basis untouched. Fix: new Patch-level `EditorPatch.alternateOrientation`
flag → rigid whole-Patch rotation by one Configuration angle
(`compositionAlternateAngle`: π/4 for 4.8.8 square lattice, π/6 for the hex
lattices). Threaded through `compositionToPolygons` / `compositionBoundaryOutlines`
/ `compositionCellBasis` (rotated basis), Canvas `cellTransform(cell, patchRot)`,
and Complete-mode geometry in `patchSelectable.ts` + reducer (picks validated
in the rotated frame). Single-cell still uses per-Cell `alternateBoundary`.
Migration converts legacy per-Cell multi-cell flags. **Not yet user-verified
visually** — confirm the π/4 and π/6 angles read as the desired alternate.

**Single-cell — still RAW:** the original per-Cell audit below is unaddressed.

---

(original report, logged 2026-05-30)

The Design-Phase **Alternate orientation** control — the toggle that rotates a
Cell's Boundary by π/n into its alternate orientation (diamond ↔ square,
etc.) — is **broken in some Configurations**. Reported while mapping the
Framing phase; specifics not yet enumerated.

Known anchors:
- UI control: `src/components/TessellationLabMode.tsx:1159` ("Alternate orientation").
- Data: the alternate-orientation field on the editor Patch/Cell (`src/types/editor.ts:152` — "rotated by π/n, the 'alternate' orientation").
- Geometry: `src/editor/buildEditorPolygons.ts:50` (π/n Boundary flip) and
  `src/editor/symmetry.ts:55` (symmetry derivation in default vs alternate orientation).

**Next session — enumerate before fixing:**
- Which Cell shapes / `ConfigurationId`s show the bug (triangle / square /
  hexagon single-cell, and the five multi-cell Configs 4.8.8 / 3.12.12 /
  4.6.12 / 3.6.3.6 / 3.4.6.4).
- What "broken" looks like in each: no visual change, wrong rotation angle,
  Seed Tile not following the flip, symmetry orbit computed against the wrong
  orientation, or the control hidden when it shouldn't be (note: the
  alternate-orientation control was historically hidden in composition mode).

**Why:** Alternate orientation is a core Design affordance; if it silently
fails on some Configurations the user can't author those layouts correctly,
and downstream Composition/Framing inherit the wrong geometry.

**How to apply:** Reproduce per Configuration in the Builder Design Phase,
diff expected vs actual Boundary rotation, then trace whether the break is in
the flip geometry (`buildEditorPolygons.ts`), the symmetry derivation
(`symmetry.ts`), or the Seed-Tile / orbit propagation that should track the
flip. Relates to multi-cell where the control was previously suppressed.
