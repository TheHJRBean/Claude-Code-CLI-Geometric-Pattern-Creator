import { useRef, useState } from 'react'
import type { PatternConfig, StrandLineStyle } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { PaintTarget, StrandPaintScope, VoidPaintScope } from '../../rendering/DecorationPaintLayer'
import type { PaintVoid } from '../../decoration/resolve'
import { downloadAllVoidShapeCanvases, downloadVoidShapePNG, downloadVoidShapeSVG, importStampImage, voidStampCanvas } from '../../export/stampAssets'
import { ColourPicker, pushRecentColour } from '../ColourPicker'
import { FieldLabel, segmentedButtonStyle } from './labShared'

const decorationButtonStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-muted)',
}

interface DecorationPanelProps {
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  decorationColor: string
  onSetDecorationColor: (c: string) => void
  paintTarget: PaintTarget
  onSetPaintTarget: (t: PaintTarget) => void
  voidScope: VoidPaintScope
  onSetVoidScope: (s: VoidPaintScope) => void
  strandScope: StrandPaintScope
  onSetStrandScope: (s: StrandPaintScope) => void
  /** Stamp target — the Void shape selected on the canvas (null = none yet). */
  stampSelection: PaintVoid | null
  /** Stamp target — latest canvas Void hit-targets ("Export all shapes"). */
  getStampVoids: () => PaintVoid[]
}

/**
 * Decoration-Phase paint controls in the Builder sidebar: paint target,
 * per-target reach (scope ladder), the colour picker, the apply/remove/clear
 * buttons, and — when a Frame is present — the Frame border-stroke styling.
 * Extracted from `EditorDesignControls`.
 */
export function DecorationPanel({
  editor,
  dispatch,
  decorationColor,
  onSetDecorationColor,
  paintTarget,
  onSetPaintTarget,
  voidScope,
  onSetVoidScope,
  strandScope,
  onSetStrandScope,
  stampSelection,
  getStampVoids,
}: DecorationPanelProps) {
  const strandRec = editor.decoration?.strandColours.find(r => r.scope === 'congruent' && r.key === '*')
  const strandRecCount = editor.decoration?.strandColours.length ?? 0
  const voidCount = editor.decoration?.voidFills.length ?? 0
  const stampCount = editor.decoration?.voidStamps?.length ?? 0
  const hasDecoration = strandRecCount > 0 || voidCount > 0 || stampCount > 0
  // The Decoration seg buttons match the phase switch minus the hover
  // transition (they snap on click).
  const segButtonStyle = (active: boolean): React.CSSProperties =>
    segmentedButtonStyle(active, { transition: false })
  return (
    <div style={{
      marginTop: 0,
      marginBottom: 14,
      padding: '8px 10px',
      fontFamily: "'EB Garamond', Georgia, serif",
      fontSize: 12,
      color: 'var(--text-muted)',
      lineHeight: 1.45,
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ marginBottom: 8 }}>
        Pick a colour, a Paint target and a reach, then click on the
        canvas. Clicking something already painted in the same colour
        unpaints it. Strand geometry is frozen here — flip back to
        Composition to reshape.
      </div>
      <FieldLabel label="Paint target" tooltip="What clicking on the canvas paints. Off frees panning; Voids fill the gaps between Strands; Strands colour the lines themselves; Stamp selects a Void shape to export as a canvas or fill with an uploaded image." />
      <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
        {(['off', 'voids', 'strands', 'stamp'] as const).map(t => (
          <button key={t} onClick={() => onSetPaintTarget(t)} style={segButtonStyle(paintTarget === t)}>
            {t === 'off' ? 'Off' : t === 'voids' ? 'Voids' : t === 'strands' ? 'Strands' : 'Stamp'}
          </button>
        ))}
      </div>
      {paintTarget === 'voids' && (
        <>
          <FieldLabel label="Reach" tooltip="How far one click spreads. Matching = every Void with the clicked shape, everywhere. Twins = the clicked Void plus its rotation/mirror twins within its Cell, in every repeat. Repeat = the clicked Void's spot in every Patch repeat. Single = only the Void you click." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            {([['congruent', 'Matching'], ['cell', 'Twins'], ['patch', 'Repeat'], ['instance', 'Single']] as const).map(([s, label]) => (
              <button key={s} onClick={() => onSetVoidScope(s)} style={segButtonStyle(voidScope === s)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {paintTarget === 'strands' && (
        <>
          <FieldLabel label="Reach" tooltip="How far one click spreads. All = every Strand at once. Matching = every Strand with the clicked Strand's shape. Twins = the clicked Strand plus its rotation/mirror twins within its Cell, in every repeat. Single = just the clicked Strand (it still repeats with the Patch — the pattern stays periodic)." />
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            {([['all', 'All'], ['congruent', 'Matching'], ['cell', 'Twins'], ['patch', 'Single']] as const).map(([s, label]) => (
              <button key={s} onClick={() => onSetStrandScope(s)} style={segButtonStyle(strandScope === s)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {paintTarget === 'stamp' && (
        <StampSection editor={editor} dispatch={dispatch} selection={stampSelection} getStampVoids={getStampVoids} />
      )}
      {paintTarget !== 'stamp' && <ColourPicker value={decorationColor} onChange={onSetDecorationColor} />}
      {paintTarget === 'stamp' ? null : paintTarget === 'strands' ? (() => {
        // Toggle: if every strand already carries the current paint colour,
        // the button removes it; otherwise it applies/updates. Removal
        // stores the `'none'` sentinel (strands hidden, Void fills meet
        // seamlessly) rather than reverting to the global strand colour —
        // painted fills should touch, strands overlay only when painted.
        const strandsHidden = strandRec?.colour === 'none'
        const sameColour = !!strandRec && strandRec.colour.toLowerCase() === decorationColor.toLowerCase()
        return (
          <button
            onClick={() => {
              if (!sameColour) pushRecentColour(decorationColor)
              dispatch(sameColour
                ? { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: 'none' } }
                : { type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: decorationColor } })
            }}
            style={{
              ...decorationButtonStyle,
              ...(sameColour ? { border: '1px solid var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent)' } : null),
            }}
          >
            {sameColour ? 'Remove strand colour' : strandRec && !strandsHidden ? 'Update strand colour' : 'Colour all strands'}
            <span style={{
              display: 'inline-block', width: 12, height: 12, marginLeft: 8,
              background: strandRec && !strandsHidden ? strandRec.colour : 'transparent',
              border: '1px solid var(--border-subtle)', verticalAlign: 'middle',
            }} />
          </button>
        )
      })() : (
        <button
          onClick={() => { pushRecentColour(decorationColor); dispatch({ type: 'SET_DECORATION_VOID_FILL', payload: { scope: 'congruent', key: '*', colour: decorationColor } }) }}
          style={decorationButtonStyle}
        >
          Colour all Voids
        </button>
      )}
      {paintTarget !== 'stamp' && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {strandRec?.colour !== 'none' && (
          <button
            onClick={() => dispatch({ type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: 'none' } })}
            style={{ ...decorationButtonStyle, flex: 1 }}
          >
            Remove strand colour
          </button>
        )}
        {strandRec?.colour === 'none' && (
          <button
            onClick={() => dispatch({ type: 'SET_DECORATION_STRAND_COLOR', payload: { scope: 'congruent', key: '*', colour: null } })}
            style={{ ...decorationButtonStyle, flex: 1 }}
          >
            Restore strands
          </button>
        )}
        {hasDecoration && (
          <button
            onClick={() => dispatch({ type: 'CLEAR_DECORATION' })}
            style={{ ...decorationButtonStyle, flex: 1 }}
          >
            Clear all
          </button>
        )}
      </div>}
      {hasDecoration && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          {voidCount > 0 && <span>{voidCount} Void group{voidCount === 1 ? '' : 's'} filled</span>}
          {voidCount > 0 && strandRecCount > 0 && <span> · </span>}
          {strandRecCount > 0 && <span>{strandRecCount} Strand colour{strandRecCount === 1 ? '' : 's'}</span>}
          {stampCount > 0 && (voidCount > 0 || strandRecCount > 0) && <span> · </span>}
          {stampCount > 0 && <span>{stampCount} Stamp{stampCount === 1 ? '' : 's'}</span>}
        </div>
      )}
      {/* Frame border stroke — the Decoration styling slot ADR-0004
          reserved. Replaces the accent guide line with a real border
          that's part of the artwork (and exports). */}
      {editor.frame && (() => {
        const frame = editor.frame
        const stroke = frame.stroke
        const setStroke = (s: typeof stroke) =>
          dispatch({ type: 'SET_FRAME', payload: { ...frame, stroke: s } })
        return (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="pattern-checkbox"
                checked={stroke?.enabled ?? false}
                onChange={e => setStroke(e.target.checked
                  ? { enabled: true, colour: stroke?.colour ?? decorationColor, width: stroke?.width ?? 4 }
                  : stroke ? { ...stroke, enabled: false } : undefined)}
              />
              Frame border stroke
            </label>
            {stroke?.enabled && (
              <div style={{ marginTop: 6 }}>
                <FieldLabel
                  label="Border width"
                  value={stroke.width.toFixed(1)}
                  unit=" px"
                  tooltip="Stroke width of the Frame border, in world units — scales with the pattern like Strand width."
                />
                <input
                  type="range"
                  className="pattern-slider"
                  min={0.5} max={30} step={0.5}
                  value={stroke.width}
                  onChange={e => setStroke({ ...stroke, width: Number(e.target.value) })}
                />
                <FieldLabel
                  label="Border style"
                  tooltip="How the border stroke is drawn — same styles as Strands. Double/Triple are parallel lines (the middle is cut out, so the pattern shows through); Dashed/Dotted scale with the border width."
                />
                <select
                  value={stroke.lineStyle ?? 'solid'}
                  onChange={e => setStroke({ ...stroke, lineStyle: e.target.value as StrandLineStyle })}
                  className="pattern-select"
                >
                  <option value="solid">Solid</option>
                  <option value="double">Double lines</option>
                  <option value="triple">Triple lines</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
                <button
                  onClick={() => setStroke({ ...stroke, colour: decorationColor })}
                  style={{ ...decorationButtonStyle, marginTop: 6 }}
                >
                  Set border to paint colour
                  <span style={{
                    display: 'inline-block', width: 12, height: 12, marginLeft: 8,
                    background: stroke.colour,
                    border: '1px solid var(--border-subtle)', verticalAlign: 'middle',
                  }} />
                </button>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

/**
 * The **Stamp** target's panel section: inspect the selected Void shape,
 * export a blank canvas at its exact canonical proportions (design a stamp
 * externally), and upload an image that fills every congruent Void, clipped
 * to the shape. One stamp record per Void signature (v1 congruent scope).
 */
function StampSection({ editor, dispatch, selection, getStampVoids }: {
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  selection: PaintVoid | null
  getStampVoids: () => PaintVoid[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportAllNote, setExportAllNote] = useState<string | null>(null)
  const [exportingAll, setExportingAll] = useState(false)

  const exportAll = async (format: 'svg' | 'png') => {
    setExportingAll(true)
    setExportAllNote(null)
    try {
      const count = await downloadAllVoidShapeCanvases(getStampVoids(), format)
      setExportAllNote(count === 0
        ? 'No Void shapes on the canvas to export.'
        : `Exported ${count} shape canvas${count === 1 ? '' : 'es'}.`)
    } finally {
      setExportingAll(false)
    }
  }
  const stamps = editor.decoration?.voidStamps ?? []
  const selRec = selection
    ? stamps.find(r => r.scope === 'congruent' && r.key === selection.signature)
    : undefined
  const outline = selection ? (selection.keyPolygon ?? selection.polygon) : null
  const canvasInfo = outline ? voidStampCanvas(outline) : null

  const upload = async (file: File) => {
    if (!selection) return
    setBusy(true)
    setError(null)
    try {
      const img = await importStampImage(file)
      dispatch({
        type: 'SET_DECORATION_VOID_STAMP',
        payload: { scope: 'congruent', key: selection.signature, fit: selRec?.fit ?? 'cover', ...img },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'image import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {!selection && (
        <div style={{ fontSize: 11, fontStyle: 'italic', marginBottom: 8 }}>
          Click a Void on the canvas to inspect its shape. Matching Voids
          highlight together — a stamp fills all of them.
        </div>
      )}
      {selection && canvasInfo && (
        <div style={{ border: '1px solid var(--border-subtle)', padding: '6px 8px', marginBottom: 8 }}>
          <div style={{ fontSize: 11, marginBottom: 6 }}>
            <strong>Shape {selection.signature.slice(0, 8)}</strong>
            {' — '}{canvasInfo.points.length} vertices · canvas {canvasInfo.box.width.toFixed(1)} × {canvasInfo.box.height.toFixed(1)} · area {selection.area.toFixed(1)}
          </div>
          <FieldLabel label="Shape canvas" tooltip="Download a blank, transparent canvas at this Void's exact proportions with the outline as a guide layer. Design a stamp on it externally, then upload it below — it lands back at exactly this size and orientation on every matching Void." />
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              onClick={() => downloadVoidShapeSVG(outline!, `void-${selection.signature.slice(0, 8)}-canvas.svg`)}
              style={{ ...decorationButtonStyle, flex: 1 }}
            >
              Export SVG
            </button>
            <button
              onClick={() => downloadVoidShapePNG(outline!, `void-${selection.signature.slice(0, 8)}-canvas.png`)}
              style={{ ...decorationButtonStyle, flex: 1 }}
            >
              Export PNG
            </button>
          </div>
          <FieldLabel label="Stamp image" tooltip="Upload an image (PNG/JPG/SVG/WebP) to fill every matching Void, cropped to the Void shape. Cover scales the image to fill the shape's box (overflow is clipped); Contain fits it inside. Images made on the exported shape canvas fit exactly." />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={{ ...decorationButtonStyle, width: '100%', opacity: busy ? 0.5 : 1 }}
          >
            {busy ? 'Importing…' : selRec ? 'Replace stamp image…' : 'Upload stamp image…'}
          </button>
          {error && <div style={{ fontSize: 11, color: 'var(--danger, #c0392b)', marginTop: 4 }}>{error}</div>}
          {selRec && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <img
                src={selRec.image}
                alt="stamp"
                style={{ height: 32, width: 32, objectFit: 'cover', border: '1px solid var(--border-subtle)' }}
              />
              <div style={{ display: 'flex', gap: 0, flex: 1 }}>
                {(['cover', 'contain'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => dispatch({ type: 'SET_DECORATION_VOID_STAMP', payload: { ...selRec, fit: f } })}
                    style={segmentedButtonStyle(selRec.fit === f, { transition: false })}
                  >
                    {f === 'cover' ? 'Cover' : 'Contain'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => dispatch({ type: 'REMOVE_DECORATION_VOID_STAMP', payload: { scope: 'congruent', key: selection.signature } })}
                style={decorationButtonStyle}
                title="Remove this stamp"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}
      <FieldLabel label="All shape canvases" tooltip="Download one blank, transparent shape canvas per distinct Void shape on the canvas, named by shape (triangle-1, triangle-2, 6-gon, hexagon…). Design stamps on them externally, then upload each below." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['svg', 'png'] as const).map(f => (
          <button
            key={f}
            onClick={() => void exportAll(f)}
            disabled={exportingAll}
            style={{ ...decorationButtonStyle, flex: 1, opacity: exportingAll ? 0.5 : 1 }}
          >
            {exportingAll ? 'Exporting…' : `Export all ${f.toUpperCase()}`}
          </button>
        ))}
      </div>
      {exportAllNote && <div style={{ fontSize: 11, marginBottom: 8 }}>{exportAllNote}</div>}
      {stamps.length > 0 && (
        <div style={{ fontSize: 11 }}>
          <FieldLabel label="Stamped shapes" tooltip="Every Void shape carrying a stamp. Click ✕ to remove one." />
          {stamps.map(r => (
            <div
              key={`${r.scope}:${r.key}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px',
                border: '1px solid var(--border-subtle)', marginBottom: 3,
                background: selection && r.key === selection.signature ? 'var(--accent-bg, rgba(212,175,55,0.12))' : 'transparent',
              }}
            >
              <img src={r.image} alt="" style={{ height: 22, width: 22, objectFit: 'cover' }} />
              <span style={{ flex: 1, fontFamily: 'monospace' }}>{r.key.slice(0, 8)}</span>
              <span style={{ opacity: 0.7 }}>{r.fit}</span>
              <button
                onClick={() => dispatch({ type: 'REMOVE_DECORATION_VOID_STAMP', payload: { scope: r.scope, key: r.key } })}
                style={{ ...decorationButtonStyle, padding: '2px 6px' }}
                title="Remove this stamp"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
