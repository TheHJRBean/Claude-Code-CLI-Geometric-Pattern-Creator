import { describe, it, expect } from 'vitest'
import { historyCoalesceKey } from './history'

// Regression (thermonuclear round 2, 2026-07-08): the coalesce identity was
// action type alone, so editing the same control on two different Cells
// within the 500 ms window merged into one undo step — undo silently skipped
// the first Cell's edit.
describe('historyCoalesceKey', () => {
  it('same type + same cellId coalesce (slider drag)', () => {
    const a = historyCoalesceKey({ type: 'SET_CELL_SEED_SIDES', payload: { sides: 5, cellId: 'octagon' } })
    const b = historyCoalesceKey({ type: 'SET_CELL_SEED_SIDES', payload: { sides: 6, cellId: 'octagon' } })
    expect(a).toBe(b)
  })

  it('same type + different cellId do NOT coalesce', () => {
    const a = historyCoalesceKey({ type: 'SET_CELL_SEED_SIDES', payload: { sides: 5, cellId: 'octagon' } })
    const b = historyCoalesceKey({ type: 'SET_CELL_SEED_SIDES', payload: { sides: 5, cellId: 'square' } })
    expect(a).not.toBe(b)
  })

  it('hostCellId distinguishes placement targets', () => {
    const a = historyCoalesceKey({ type: 'EDITOR_PLACE_TILE_ON_VERTEX', payload: { hostCellId: 'octagon' } })
    const b = historyCoalesceKey({ type: 'EDITOR_PLACE_TILE_ON_VERTEX', payload: { hostCellId: 'square' } })
    expect(a).not.toBe(b)
  })

  it('actions without a Cell target coalesce on type', () => {
    const a = historyCoalesceKey({ type: 'SET_CELL_BOUNDARY_SIZE', payload: 180 })
    const b = historyCoalesceKey({ type: 'SET_CELL_BOUNDARY_SIZE', payload: 200 })
    expect(a).toBe(b)
  })

  it('different types never coalesce, Cell target or not', () => {
    const a = historyCoalesceKey({ type: 'SET_CELL_NO_SEED', payload: { value: true, cellId: 'square' } })
    const b = historyCoalesceKey({ type: 'SET_CELL_SEED_SIDES', payload: { sides: 4, cellId: 'square' } })
    expect(a).not.toBe(b)
  })
})
