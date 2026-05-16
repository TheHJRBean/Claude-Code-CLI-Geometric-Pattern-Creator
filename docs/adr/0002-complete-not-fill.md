# "Complete" (not "Fill") for the gap-filling operation

The Design-phase operation that fills gaps around placed **Tiles** with regular polygons (or irregular fallbacks) is called **Complete**. The auto-on-phase-switch variant is **auto-complete**. The natural alternative — "Fill" / "auto-fill" — was rejected.

The reason is forward-looking: the planned **Decoration** Phase will introduce a separate operation for filling gaps with *colour*. That operation gets the name **Fill**. If we used "Fill" for the Tile-gap operation today, the Decoration phase would either collide or need a less natural verb. The Tile-gap operation is named **Complete** to keep Fill free.

UI tooltips on the Complete button clarify that it refers to filling gaps with **Tiles**, not colour — because in isolation "Complete" can read as ambiguous. See `CONTEXT.md` for the vocabulary entry and the Builder operations section.
