import { useCallback, useRef, useState } from 'react'

interface Props {
  rotation: number
  onChange: (degrees: number) => void
}

const SIZE = 88           // outer diameter in px
const R = SIZE / 2         // outer radius
const INNER_R = R - 14     // inner circle radius
const TICK_OUTER = R - 4   // tick start (from center)
const CX = R
const CY = R

/** Normalise degrees into [0, 360) */
function normDeg(d: number): number {
  return ((d % 360) + 360) % 360
}

/** Convert page coordinates to angle relative to dial center */
function pointerAngle(cx: number, cy: number, px: number, py: number): number {
  return normDeg(Math.atan2(py - cy, px - cx) * (180 / Math.PI) + 90)
}

export function RotationDial({ rotation, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startAngle = useRef(0)
  const startRotation = useRef(0)
  const [hovered, setHovered] = useState(false)

  const getCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { cx: 0, cy: 0 }
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const { cx, cy } = getCenter()
    startAngle.current = pointerAngle(cx, cy, e.clientX, e.clientY)
    startRotation.current = rotation
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [rotation, getCenter])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    e.preventDefault()
    const { cx, cy } = getCenter()
    const currentAngle = pointerAngle(cx, cy, e.clientX, e.clientY)
    let delta = currentAngle - startAngle.current
    // Handle wrap-around
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    onChange(normDeg(startRotation.current + delta))
  }, [getCenter, onChange])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const step = e.shiftKey ? 0.5 : (e.ctrlKey || e.metaKey) ? 15 : 1
    const direction = e.deltaY > 0 ? 1 : -1
    onChange(normDeg(rotation + direction * step))
  }, [rotation, onChange])

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(0)
  }, [onChange])

  // Build tick marks
  const ticks: JSX.Element[] = []
  for (let deg = 0; deg < 360; deg += 5) {
    const isMajor = deg % 30 === 0
    const isMid = deg % 15 === 0 && !isMajor
    const len = isMajor ? 8 : isMid ? 5 : 3
    const tickInner = TICK_OUTER - len
    const rad = (deg - 90) * (Math.PI / 180)
    const x1 = CX + tickInner * Math.cos(rad)
    const y1 = CY + tickInner * Math.sin(rad)
    const x2 = CX + TICK_OUTER * Math.cos(rad)
    const y2 = CY + TICK_OUTER * Math.sin(rad)
    ticks.push(
      <line
        key={deg}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isMajor ? 'var(--accent)' : 'var(--dial-tick)'}
        strokeWidth={isMajor ? 1.2 : 0.6}
        strokeLinecap="round"
      />
    )
  }

  // Cardinal labels (N/E/S/W style → 0/90/180/270)
  const labels = [
    { deg: 0, text: '0' },
    { deg: 90, text: '90' },
    { deg: 180, text: '180' },
    { deg: 270, text: '270' },
  ]

  // Needle
  const needleRad = (rotation - 90) * (Math.PI / 180)
  const needleLen = INNER_R - 6
  const nx = CX + needleLen * Math.cos(needleRad)
  const ny = CY + needleLen * Math.sin(needleRad)
  // Small triangle tip
  const tipSize = 3
  const perpRad = needleRad + Math.PI / 2
  const tipX = CX + (needleLen + 4) * Math.cos(needleRad)
  const tipY = CY + (needleLen + 4) * Math.sin(needleRad)
  const tl = `${tipX},${tipY}`
  const tr = `${nx + tipSize * Math.cos(perpRad)},${ny + tipSize * Math.sin(perpRad)}`
  const bl = `${nx - tipSize * Math.cos(perpRad)},${ny - tipSize * Math.sin(perpRad)}`

  const displayDeg = Math.round(rotation * 10) / 10

  return (
    <div
      ref={containerRef}
      className={`rotation-dial${hovered ? ' rotation-dial--hover' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Drag to rotate · Scroll to fine-tune · Double-click to reset"
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Outer ring */}
        <circle
          cx={CX} cy={CY} r={R - 2}
          fill="none"
          stroke="var(--dial-ring)"
          strokeWidth={1.5}
        />
        {/* Inner circle (dark face) */}
        <circle
          cx={CX} cy={CY} r={INNER_R}
          fill="var(--dial-face)"
          stroke="var(--dial-ring)"
          strokeWidth={0.5}
        />
        {/* Tick marks */}
        {ticks}
        {/* Cardinal labels */}
        {labels.map(({ deg, text }) => {
          const labelR = INNER_R - 12
          const rad = (deg - 90) * (Math.PI / 180)
          return (
            <text
              key={deg}
              x={CX + labelR * Math.cos(rad)}
              y={CY + labelR * Math.sin(rad)}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--dial-label)"
              fontSize={8}
              fontFamily="'EB Garamond', Georgia, serif"
            >
              {text}
            </text>
          )
        })}
        {/* Center dot (gnomon shadow) */}
        <circle cx={CX} cy={CY} r={3} fill="var(--accent)" opacity={0.8} />
        <circle cx={CX} cy={CY} r={1.5} fill="var(--dial-face)" />
        {/* Needle line */}
        <line
          x1={CX} y1={CY} x2={nx} y2={ny}
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        {/* Needle tip */}
        <polygon
          points={`${tl} ${tr} ${bl}`}
          fill="var(--accent)"
        />
        {/* Degree readout at center bottom */}
        <text
          x={CX}
          y={CY + 14}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--accent)"
          fontSize={9}
          fontFamily="'EB Garamond', Georgia, serif"
          fontWeight={600}
        >
          {displayDeg}°
        </text>
      </svg>
    </div>
  )
}
