# Patch always has Cells

Builder Patches use a uniform recursive shape: every **Patch** holds one or more **Cells**, and Tiles live on a Cell — never directly on the Patch. Single-cell Patches (e.g. a lone square) carry exactly one Cell; multi-cell Patches (e.g. `4.8.8` = octagon + square) carry several. This replaces the legacy `EditorPatch.tiles[]` shape where single-shape patches stored tiles directly and only compositions wrapped them in `BoundaryTile`s.

Chosen because the recursion is real (a Cell already carries an interior patch in multi-cell layouts) and unifying the two paths removes a permanent `composition?` branch from every consumer. The cost is a one-time schema-version bump (v2 → v3) plus a load-time migration that wraps legacy `tiles[]` in a single Cell. See `CONTEXT.md` for the canonical hierarchy.
