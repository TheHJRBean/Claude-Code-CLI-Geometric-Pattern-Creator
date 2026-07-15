/** The three top-level workspaces (ADR-0007 adds Generator alongside Gallery/Lab). */
export type AppMode = 'main' | 'lab' | 'generator'

/**
 * Design-Phase tool modes (spec Decision 11 adds **Construct** beside Place
 * and Complete — mutually exclusive). Pure UI state, never persisted.
 */
export type EditorMode = 'place' | 'complete' | 'construct'
