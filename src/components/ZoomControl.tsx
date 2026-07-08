interface Props {
  zoom: number
  /** Zoom by a multiplicative factor, anchored on the canvas centre. */
  onZoom: (factor: number) => void
  /** Reset zoom to 1× (100%), keeping the canvas centre fixed. */
  onReset: () => void
}

/** Multiplicative step per button press — matches the wheel handler's 1.1×. */
const STEP = 1.2

/**
 * Manual zoom stepper for trackpad users who find pinch/scroll zoom fiddly.
 * A vertical pill with +/− buttons and a clickable percentage readout
 * (click resets to 100%). Anchored bottom-right, stacked above the
 * RotationDial. Zooming is centre-anchored so the view doesn't drift.
 */
export function ZoomControl({ zoom, onZoom, onReset }: Props) {
  const pct = Math.round(zoom * 100)

  return (
    <div className="zoom-control" title="Zoom · click the readout to reset to 100%">
      <button
        type="button"
        className="zoom-control__btn"
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onZoom(STEP)}
        aria-label="Zoom in"
        title="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        className="zoom-control__readout"
        onPointerDown={e => e.stopPropagation()}
        onClick={onReset}
        aria-label="Reset zoom to 100%"
      >
        {pct}%
      </button>
      <button
        type="button"
        className="zoom-control__btn"
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onZoom(1 / STEP)}
        aria-label="Zoom out"
        title="Zoom out"
      >
        −
      </button>
    </div>
  )
}
