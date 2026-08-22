import { describe, expect, it } from 'vitest'
import type { Action } from './actions'
import type { FrameConfig } from '../types/editor'
import { linkStrokeAction, pickStrokeDesign, STROKE_DESIGN_KEYS } from './strokeLink'

const frame = (stroke?: FrameConfig['stroke']): FrameConfig => ({
  shape: 'square', size: 400, aspect: 1, rotation: 0, stroke,
} as FrameConfig)

const bordered = frame({ enabled: true, colour: '#111111', width: 40, lineStyle: 'lines', lineCount: 3 })
const ctx = { frame: bordered, frameAction: 'SET_FRAME' as const }

describe('linkStrokeAction', () => {
  it('passes everything through untouched while the link is off', () => {
    const a: Action = { type: 'SET_STRAND_STYLE', payload: { lineCount: 6 } } as Action
    expect(linkStrokeAction(a, false, ctx)).toEqual([a])
  })

  it('a Strand design edit also writes the border, source action first', () => {
    const a: Action = { type: 'SET_STRAND_STYLE', payload: { lineStyle: 'lines', lineCount: 6 } } as Action
    const out = linkStrokeAction(a, true, ctx)
    expect(out[0]).toBe(a)
    expect(out).toHaveLength(2)
    const mirrored = out[1] as { type: string; payload: FrameConfig }
    expect(mirrored.type).toBe('SET_FRAME')
    expect(mirrored.payload.stroke).toMatchObject({ lineCount: 6, lineStyle: 'lines' })
    // Width and base colour are the two things the link must NOT copy.
    expect(mirrored.payload.stroke!.width).toBe(40)
    expect(mirrored.payload.stroke!.colour).toBe('#111111')
  })

  it('a Strand edit carrying no design field is left alone', () => {
    // Width, weave and the base colour all dispatch SET_STRAND_STYLE, and a
    // width drag fires one per frame — a link that fanned those out would
    // resize the border to the thickness of a Strand.
    for (const payload of [{ width: 9 }, { color: '#abcdef' }, { weave: true }, { weaveGap: 3 }]) {
      const a: Action = { type: 'SET_STRAND_STYLE', payload } as Action
      expect(linkStrokeAction(a, true, ctx)).toEqual([a])
    }
  })

  it('a Strand edit with no border to land on passes through', () => {
    const a: Action = { type: 'SET_STRAND_STYLE', payload: { lineCount: 4 } } as Action
    expect(linkStrokeAction(a, true, { frame: null, frameAction: 'SET_FRAME' })).toEqual([a])
    expect(linkStrokeAction(a, true, { frame: frame(undefined), frameAction: 'SET_FRAME' })).toEqual([a])
  })

  it('a border design edit also writes the Strands', () => {
    const next = frame({ ...bordered.stroke!, lineCount: 5, gapFillMode: 'individual', gapFills: ['#a', null, '#b', null] })
    const a: Action = { type: 'SET_FRAME', payload: next } as Action
    const out = linkStrokeAction(a, true, ctx)
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({
      type: 'SET_STRAND_STYLE',
      payload: pickStrokeDesign(next.stroke),
    })
  })

  it('moving or resizing the Frame does not drag the Strand style along', () => {
    // A Frame action carries the WHOLE FrameConfig and fires on every drag
    // frame. Without the design diff, dragging the Frame would rewrite the
    // Strand style dozens of times a second with the value it already had —
    // and every one of those is an undo step.
    const moved = { ...bordered, size: 620, rotation: 0.4 }
    const a: Action = { type: 'SET_FRAME', payload: moved } as Action
    expect(linkStrokeAction(a, true, ctx)).toEqual([a])
  })

  it('clearing the Frame passes through', () => {
    const a: Action = { type: 'SET_FRAME', payload: null } as Action
    expect(linkStrokeAction(a, true, ctx)).toEqual([a])
  })

  it('uses the substrate\'s own Frame action', () => {
    // A Patch authors `editor.frame`, a legacy substrate the top-level
    // `config.frame`. The wrong action writes a Frame nothing reads, which
    // looks exactly like the link being broken.
    const a: Action = { type: 'SET_STRAND_STYLE', payload: { lineCount: 6 } } as Action
    const out = linkStrokeAction(a, true, { frame: bordered, frameAction: 'SET_GALLERY_FRAME' })
    expect((out[1] as { type: string }).type).toBe('SET_GALLERY_FRAME')
  })

  it('round-trips every design key in both directions', () => {
    // The link is only as good as its key list: a field added to the stroke
    // vocabulary and not to STROKE_DESIGN_KEYS silently stops being linked.
    const full = {
      lineStyle: 'lines' as const, lineCount: 4, styleRatio: 2,
      innerFill: '#eeeeee', gapFills: ['#111111', null, '#333333'], gapFillMode: 'individual' as const,
      lineFills: ['#aaaaaa', '#bbbbbb', '#cccccc', null], lineFillMode: 'matching' as const,
    }
    expect(Object.keys(full).sort()).toEqual([...STROKE_DESIGN_KEYS].sort())

    const fromStrand = linkStrokeAction(
      { type: 'SET_STRAND_STYLE', payload: full } as Action, true, ctx,
    )[1] as { payload: FrameConfig }
    for (const k of STROKE_DESIGN_KEYS) {
      expect(fromStrand.payload.stroke![k]).toEqual(full[k])
    }

    const fromBorder = linkStrokeAction(
      { type: 'SET_FRAME', payload: frame({ ...bordered.stroke!, ...full }) } as Action, true, ctx,
    )[1] as { payload: Record<string, unknown> }
    for (const k of STROKE_DESIGN_KEYS) {
      expect(fromBorder.payload[k]).toEqual(full[k])
    }
  })
})
