# Builder Phase sequence: Design → Composition → Framing → Decoration

The Builder workflow is structured as a sequence of four **Phases**: **Design**, **Composition**, **Framing**, **Decoration**. Only Design and Composition are live today; Framing and Decoration are reserved Phase names that slot into this canonical position when they ship.

The sequence is locked now (rather than left open for later) to anchor UI affordances (tab order, "next phase" navigation, phase-switch verbs) and to prevent ambiguity when future work references "the next phase" or "the previous phase". Framing precedes Decoration because Decoration's colour-fill operations need a defined region to operate on — the frame defines that region.

Reserving Framing and Decoration also explains why the Design-phase gap-fill operation is called **Complete** rather than **Fill** (see ADR-0002): the **Fill** vocabulary is held for Decoration's colour-fill of gaps. See `CONTEXT.md` for the Phase definitions and current implementation status.
