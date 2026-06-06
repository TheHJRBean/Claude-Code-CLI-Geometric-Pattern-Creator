# Builder Phase sequence: Design → Composition → Framing → Decoration

The Builder workflow is structured as a sequence of four **Phases**: **Design**, **Composition**, **Framing**, **Decoration**. Only Design and Composition are live today; Framing and Decoration are reserved Phase names that slot into this canonical position when they ship.

The sequence is locked now (rather than left open for later) to anchor UI affordances (tab order, "next phase" navigation, phase-switch verbs) and to prevent ambiguity when future work references "the next phase" or "the previous phase". Framing precedes Decoration because Decoration's colour-fill operations need a defined region to operate on — the frame defines that region.

Reserving Framing and Decoration also explains why the Design-phase gap-fill operation is called **Complete** rather than **Fill** (see ADR-0002): the **Fill** vocabulary is held for Decoration's colour-fill of gaps. See `CONTEXT.md` for the Phase definitions and current implementation status.

## Amendment (2026-06-01): Framing demoted from a Phase to a persistent overlay

Framing is **no longer a Phase**. The live (and canonical) sequence is now **Design → Composition → Decoration** (Decoration still reserved). The **Frame** becomes a **persistent overlay/setting** that is present across both live phases rather than a stage you switch into:

- It is live in **Design** (where **Complete** runs — the frame is a completion boundary, so it must exist where Complete exists) and in **Composition** (where Strands reach the frame edge), and is read by **Decoration**.
- Rationale: the frame *is* a completion boundary and Complete is a Design-phase operation, so the frame cannot be confined to a phase that comes after Composition. Relocating the UI alone would not fix the lattice-offset jank — that was a geometry problem, resolved separately (see below).
- **Complete-to-frame is no longer a bespoke operation.** The frame simply exposes its edge **Frame nodes** (and corners) as clickable targets in the existing **Complete** mode. A Complete that touches a frame node stores its Tile **frame-scoped** (world space, on `frame.completedTiles`), so it sits at the frame edge without repeating under the **Lattice**. The dedicated ring-stamper (`placeRegularNGonOnFrameSection` / `frameCornerStubTiles` / `EDITOR_COMPLETE_TO_FRAME`) is removed.

The ADR-0002 rationale (Complete vs Fill, Fill reserved for Decoration) is unaffected.

## Amendment (2026-06-06): Decoration no longer hard-requires a Frame

The original rationale above stated Framing precedes Decoration because "Decoration's colour-fill operations need a defined region to operate on — the frame defines that region." That is now relaxed: Decoration's **Voids** are coloured by an **identity-keyed Grouping scope** (not by world position), so a colour stays stable regardless of which finite region is currently shown. The **Frame** is therefore the *preferred* bound — it gives a clean exportable artifact — but Decoration may also run over the current **viewport** when no Frame is set. The phase *ordering* is unchanged (Decoration is still last); only the hard dependency is dropped. See ADR-0005 for the Void and grouping model.
