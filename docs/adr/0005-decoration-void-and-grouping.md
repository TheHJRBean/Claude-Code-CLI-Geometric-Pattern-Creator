# Decoration: Voids are global arrangement faces, coloured by an identity-keyed Grouping scope

The **Decoration** Phase colours two targets — **Strands** (Strand colour) and **Voids** (Fill) — where a **Void** is a bounded face of the *global* strand arrangement (it may span several **Tiles**; the region where four tiles meet is **one** Void, not four), and every colour attaches to an **identity key** chosen by a per-target **Grouping scope** (Congruent → Patch → Cell-symmetry → Instance) rather than to a world-space position. We chose global faces over cheap per-tile clipping because that is what the eye reads as "the gap between strands" and what makes "colour all similar Voids" meaningful; we chose identity-keyed grouping because it keeps the data tiny and periodic and stays stable as the field pans — which in turn lets Decoration run over a plain **viewport** bound, so a **Frame** is *preferred* (clean export) but **not required**.

## Considered Options

- **Per-tile clipped Voids** (rejected) — cheap and reuses the per-polygon pipeline, but fragments each cross-tile region into one congruent wedge per tile, so the single background region the user wants to Fill reads as several Voids.
- **World-space instance paint as the base model** (rejected as the *base*) — total freedom but non-periodic, large on big fields, and incoherent under a viewport bound (Voids change on pan). Retained only as the finest **Instance** rung of the Grouping-scope ladder.
- **Frame-required** (rejected) — would have made the arrangement finite by construction (and matched ADR-0003 as originally written), but blocks decorating an unframed pattern; the identity-keyed model removes the need, so we relaxed it (see ADR-0003 amendment).

## Consequences

- A global face-extraction (planar arrangement / half-edge over all Rays, including Bézier-curve Rays) is net-new geometry — the current pipeline only emits per-polygon `Segment[]`. This is the main implementation risk and is deferred to a later grilling pass.
- Stage 1 ships only the **Congruent** rung for both targets (`scope: 'congruent'`); Patch / Cell / Instance land later behind toggles on the same `{ scope, key, colour }` record.
- Decoration is **Builder-only** (`editor.decoration`); the Gallery keeps its single global `StrandStyle`.
