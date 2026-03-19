/**
 * Decorative carved sandstone edge — sits between sidebar and canvas.
 * A gently concave column with repeating Art Deco fan/palmette motifs,
 * diamond junctions, and incised groove lines.
 */
export function SandstoneEdge() {
  const h = 200 // pattern repeat height

  return (
    <svg width="26" height="100%" style={{ display: 'block' }}>
      <defs>
        {/* Depth gradient: darker at sidebar, lighter toward curve edge, fades out */}
        <linearGradient id="stone-depth" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--bg-surface)" />
          <stop offset="50%" stopColor="var(--bg-elevated)" />
          <stop offset="100%" stopColor="var(--bg-surface)" stopOpacity="0" />
        </linearGradient>

        {/* Subtle grain texture for sandstone feel */}
        <filter id="sand-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="3"
            stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feBlend in="SourceGraphic" in2="mono" mode="soft-light" />
        </filter>

        <pattern id="carved-unit" patternUnits="userSpaceOnUse" width="26" height={h}>
          {/* ── Stone body: concave right edge ──────────────── */}
          <path
            d={`M0 0 L20 0 Q22 ${h * 0.25}, 12 ${h * 0.5} Q22 ${h * 0.75}, 20 ${h} L0 ${h} Z`}
            fill="url(#stone-depth)"
            filter="url(#sand-grain)"
          />

          {/* ── Carved edge groove ─────────────────────────── */}
          <path
            d={`M20 0 Q22 ${h * 0.25}, 12 ${h * 0.5} Q22 ${h * 0.75}, 20 ${h}`}
            fill="none" stroke="var(--accent)" strokeWidth="0.7" opacity="0.18"
          />

          {/* ── Inner groove (incised line) ────────────────── */}
          <path
            d={`M17 ${h * 0.08} Q18 ${h * 0.25}, 10 ${h * 0.5} Q18 ${h * 0.75}, 17 ${h * 0.92}`}
            fill="none" stroke="var(--accent)" strokeWidth="0.4" opacity="0.12"
          />

          {/* ── Art Deco fan at the curve's apex ───────────── */}
          {Array.from({ length: 7 }, (_, i) => {
            const angle = ((i - 3) * 13) * Math.PI / 180
            const cx = 12, cy = h * 0.5, r = 9
            return (
              <line key={i}
                x1={cx} y1={cy}
                x2={cx + Math.cos(angle) * r}
                y2={cy - Math.sin(angle) * r}
                stroke="var(--accent)" strokeWidth="0.4" strokeLinecap="round"
                opacity={0.22 - Math.abs(i - 3) * 0.035}
              />
            )
          })}

          {/* Arc framing the fan */}
          <path
            d={`M19 ${h * 0.5 - 15} A15 15 0 0 1 19 ${h * 0.5 + 15}`}
            fill="none" stroke="var(--accent)" strokeWidth="0.3" opacity="0.10"
          />

          {/* Fan centre dot */}
          <circle cx="12" cy={h * 0.5} r="1.5" fill="var(--accent)" opacity="0.12" />

          {/* ── Junction diamonds (tile seamlessly) ────────── */}
          <path d="M18 -4 L20 0 L18 4 L16 0 Z" fill="var(--accent)" opacity="0.10" />
          <path d={`M18 ${h - 4} L20 ${h} L18 ${h + 4} L16 ${h} Z`}
            fill="var(--accent)" opacity="0.10" />

          {/* ── Horizontal chisel grooves ──────────────────── */}
          <line x1="5" y1={h * 0.2} x2="18" y2={h * 0.2}
            stroke="var(--accent)" strokeWidth="0.3" opacity="0.08" />
          <line x1="7" y1={h * 0.2 + 2} x2="17" y2={h * 0.2 + 2}
            stroke="var(--accent)" strokeWidth="0.2" opacity="0.06" />

          <line x1="5" y1={h * 0.8} x2="18" y2={h * 0.8}
            stroke="var(--accent)" strokeWidth="0.3" opacity="0.08" />
          <line x1="7" y1={h * 0.8 + 2} x2="17" y2={h * 0.8 + 2}
            stroke="var(--accent)" strokeWidth="0.2" opacity="0.06" />
        </pattern>
      </defs>

      <rect width="26" height="100%" fill="url(#carved-unit)" />
    </svg>
  )
}
