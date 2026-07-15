# Guides (Construction Lines & Shapes) — v1 Spec

**Status: SPECCED 2026-07-15** (grill session, all decisions user-confirmed).
Vocabulary decision recorded in ADR-0008. Tickets on GitHub Issues (see the
`guides` label). This file is the product spec; implementation details are
decided per-ticket.

## Summary

A new Design-phase capability: the user draws **Guides** — Guide lines,
Guide circles, and divided Guide circles — as compass-and-straightedge-style
scaffolding on the Builder canvas. Guides expose **Anchors**; Anchors join
the pickable point set of the existing Place and Complete flows. This makes
tiles reachable that no Seed-Tile-derived flow can produce (arbitrary
irregulars, Girih-style modules, rosette layouts), while keeping PIC as the
single rendering engine: Guides produce **Tiles**, never pattern lines.

v1 is explicitly a learning vehicle — the user will use it to discover what
the product should become.

## Vocabulary (ADR-0008)

- **Construct** — the Design-phase mode where Guides are drawn/edited.
  Sits beside Place and Complete, mutually exclusive.
- **Guide** — a drawn construction element. Variants: **Guide line**,
  **Guide circle**, **divided Guide circle**. "Construction line" survives
  as the informal/literature synonym only.
- **Anchor** — *umbrella term* for ANY single point pickable for tile
  placement or Complete, app-wide: exposed vertices, Frame nodes,
  boundary-section points, neighbour vertices, and Guide anchors.
  Guide anchor kinds: intersection, tick, manual.

Never collide with: **Ray** (visible line piece), **Strand** (chain),
**Contact Ray** (pre-trim internal).

## Decisions

1. **Scope** — Anchor factory + tile creation via Anchors. Full traditional
   pattern-line authoring (bypassing PIC) is explicitly OUT — that territory
   belongs to the nested-layers idea if ever.
2. **Repeat (stamping)** — each Guide has a **stamp toggle**, default OFF.
   - OFF = one-off, world-space; never repeats under the Lattice.
   - ON = effectively Patch-relative; repeats in every Lattice stamp
     (which is what makes neighbour Anchors meaningful).
   - Stamp state is shown by **fixed system colour** (one colour for
     stamping Guides, one for non-stamping; distinct from all pattern and
     overlay colours). No user-pickable Guide colours in v1 — colour IS the
     stamp indicator.
3. **Tile creation** — via the existing **Complete multi-point flow**;
   Guide Anchors join the pickable set (Frame-node precedent). No new
   tracing/region-click gesture.
4. **Free-standing Tiles** — a multi-point Complete built from Guide
   Anchors alone (touching no existing Tile) is allowed. Enables the
   traditional scaffold-first workflow. Overlap handled by the
   flexible-placement gate (⚠ badge + confirm popover + `force`).
5. **Anchor sources on a Guide** (all three ship):
   - **Intersections** — always on, automatic: Guide×Guide, Guide×Tile-edge,
     Guide×Cell-Boundary crossings.
   - **Spaced ticks** — on by default; spacing defaults to the Patch tile
     edge length; adjustable per-Guide (popup). Circles tick along the arc.
   - **Manual** — click anywhere on a Guide to drop an Anchor.
6. **Divided Guide circle** — a circle variant with an **n-division**
   setting (popup): divides the circle into 2n equal parts, Anchors at the
   division points. This is the traditional rosette scaffold (see
   RESEARCH §2.1) and the answer to "circle as construction basis".
   A true circular Cell Boundary is a separate follow-up idea, NOT v1.
7. **Drawing model**:
   - Guide line = two-click segment (start, end).
   - Per-Guide **extend** toggle: none / one direction / both (infinite).
   - Snap-while-drawing to: Tile vertices, Tile edge midpoints,
     Cell-Boundary corners, existing Anchors/intersections.
   - **Angle snap** with configurable step: 15° default; presets 36°, 72°,
     n-fold custom (set in the Construct toolbar, not per-Guide). Angle
     references both the horizontal and any edge the line starts on
     (perpendicular / continuation come free). Modifier key = freehand.
   - **Typed angle input** in the per-Guide popup (draw-time and
     after-the-fact correction).
   - Circle sizing: presets (√2 ×, tile-edge-relative ×, …) plus fully
     free sizing; in the per-Guide popup.
8. **Symmetry** — drawing obeys the existing Cell Symmetry picker (full /
   rotation / vertical / horizontal / none). Orbit copies are **linked as
   one group**: edit one (spacing, stamp, extend…) → all follow; delete
   one → all go. Canvas-space Guides (outside any Cell) always draw as
   singles. Divided circles are self-symmetric via n-division and ignore
   the picker.
9. **Lifecycle** — keep it intuitive and simple:
   - Editable in Construct mode: select, drag endpoints, popup, delete;
     fully undoable via the existing Design undo stack.
   - Persisted: Guides save with the pattern and reload.
   - Composition phase: hidden by default; a show/hide toggle joins the
     existing overlay controls (including a neighbours variant). Same in
     Decoration later.
   - Export: Guides are overlays → always stripped by the existing
     overlay-strip rule. Never exported in v1.
10. **Per-Guide popup** (placement-picker style, hover/click on the Guide):
    stamp toggle, extend, tick spacing, typed angle (lines), n-division +
    size presets (circles), delete.
11. **UI shape** — Construct is a third Design-phase mode. Its toolbar
    (Guide line / Guide circle / divided circle, angle-step preset, snap
    toggle) appears only while in Construct mode — zero new permanent
    chrome; Place and Complete are visually untouched.
12. **Girih reveal** — presets shipping with their construction Guides
    visible (teaching the method) is a **follow-up ticket**, not v1.
    Blocked on tier-3 Patch conversion; first reveal content falls out of
    the user authoring a Girih layout with v1.

## Out of scope (v1)

- Full compass-and-straightedge pattern-line authoring (PIC bypass).
- Circular Cell Boundary (follow-up idea memory).
- Girih preset reveal (follow-up ticket + idea memory).
- User-pickable Guide colours (colour = stamp state in v1).
- "Construction study" export.
- Region-click tile tracing (dissolved into Complete-on-Anchors).

## Likely touch points (orientation only — per-ticket decisions rule)

`types/editor.ts` (Guides block on `EditorPatch`), `editor/migrations.ts`,
Canvas overlay layers (draw + snap; cf. `feedback_editor_svg_overlay_events`
— onPointerDown + render order), `editor/complete.ts`/`completeN.ts`
(Anchor pick targets), `editor/orbit.ts` (symmetry-linked Guide groups),
undo allowlist in `editor/history.ts`, overlay show/hide wiring, CONTEXT.md.
