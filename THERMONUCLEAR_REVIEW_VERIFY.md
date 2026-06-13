# Thermo-Nuclear Review — Owed Browser-Verifies

Manual checks owed from behaviour-touching chunks of the thermo-nuclear review.
Every chunk is **behaviour-preserving**, so these are confirmations of "still works",
not bug hunts. Run `npm run dev` and open the app. Tick each off and record the result
against the matching chunk's "user-verified" line in `THERMONUCLEAR_REVIEW_FINDINGS.md`.

> **On resume:** the review memory (`project_thermonuclear_review.md`) instructs the
> agent to surface this list before starting new chunk work. Clear what you can first.

---

## Chunk 11 — ColourPicker + RotationDial (newest, low-risk — logic now pinned by tests)

**Paint colour / ColourPicker** (Decoration phase → paint-colour control):
- [ ] Type a hex into the text field — `#c9943a` commits live; `#fff` / `red` / garbage shows a red border and does **not** apply.
- [ ] Native colour box + eye-dropper (Chromium only) update the colour; alpha results normalise to `#rrggbb`.
- [ ] **+ New** → name a theme → it seeds with the current colour and becomes active.
- [ ] With a user theme active: **+ Add colour** (no dups), **– Remove** mode (click swatches to delete), **Delete theme**.
- [ ] Paint a few Voids/strands → the **Recent** row shows them newest-first, deduped, capped at 10, surviving reload.

**RotationDial** (Builder Design phase, Seed Tile rotation):
- [ ] **Drag** the needle a full circle — smooth, no jump across the 12-o'clock seam.
- [ ] **Scroll**: 1° default, **Shift** = 0.5° fine, **Ctrl/Cmd** = 15° coarse.
- [ ] **Double-click** resets to 0°.

## Chunk 10 — Decoration strands

- [ ] Decoration phase, **Strands** target → clicking a strand paints it; clicks **off** any strand fall through to pan (hit-test).
- [ ] Strand style select → **double / triple / dashed / dotted** all render, and Void fills show through the gaps (not painted over).

## Chunk 3 — Sidebar

- [ ] Gallery Sidebar → collapse/expand **every** section (Tiling, Frame, Figures, Curves, Figure Routing, Strand Thickness, Display, My Patterns, Export) and toggle each control.
- [ ] Drag the **Frame size slider to its max and min** — must not freeze or snap back.

---

_If anything fails: Chunk 11 → the `colourPicker.logic.ts` / `rotationDial.logic.ts`
extractions (`27a4832`); Chunk 10 → `rendering/svgGeometry.ts` / `strandStyle.ts`
(`1ed8ee5`); Chunk 3 → the Sidebar `<Section>` wrapper / `editor/frame.ts` (`3dac419`)._
