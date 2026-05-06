import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight in-app text-input modal. Replaces `window.prompt` for the
 * library Save / Rename flows so the prompt looks consistent with the rest
 * of the UI and doesn't trigger the OS-level prompt strip in some browsers.
 *
 * Closing rules:
 *   - Submit (Enter / button) → `onConfirm(trimmedValue)` if non-empty.
 *   - Esc / backdrop click / Cancel → `onCancel()`.
 */
interface Props {
  open: boolean
  title: string
  initialValue: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function TextPromptModal({
  open,
  title,
  initialValue,
  confirmLabel = 'Save',
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset internal state when the modal reopens with a new initial value.
  useEffect(() => {
    if (open) {
      setValue(initialValue)
      // Focus + select on the next frame so the modal is mounted first.
      const handle = requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
      return () => cancelAnimationFrame(handle)
    }
  }, [open, initialValue])

  // Esc closes — handled at window level so the input doesn't have to be focused.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={e => {
        // Backdrop click cancels — but only if the press started on the
        // backdrop (so dragging text inside the input doesn't dismiss).
        if (e.target === e.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          minWidth: 320,
          maxWidth: 460,
          width: '100%',
          background: 'var(--bg)',
          border: '1px solid var(--border-accent)',
          padding: '20px 22px',
          boxShadow: '0 14px 38px rgba(0, 0, 0, 0.45)',
        }}
      >
        <h2
          style={{
            margin: 0,
            marginBottom: 14,
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          {title}
        </h2>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: 14,
            color: 'var(--text)',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={modalButtonStyle(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            style={modalButtonStyle(true, !value.trim())}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function modalButtonStyle(primary: boolean, disabled = false): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontFamily: "'Cinzel', Georgia, serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-subtle)'}`,
    background: primary ? 'var(--accent-bg)' : 'transparent',
    color: primary ? 'var(--accent)' : 'var(--text-muted)',
    opacity: disabled ? 0.4 : 1,
    transition: 'all 0.15s',
  }
}
