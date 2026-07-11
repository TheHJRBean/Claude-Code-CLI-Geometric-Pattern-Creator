import { createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { Canvas } from '../components/Canvas'
import { faithfulRenderFlags } from './faithfulRender'
import { rasterizeSvgToDataUrl, DEFAULT_PNG_BACKGROUND } from '../export/exportSVG'

/**
 * Offscreen thumbnail renderer (ADR-0006, slice 5). Given a saved config, mount
 * the real `Canvas` (the single faithful renderer — see `faithfulRenderFlags`)
 * into a hidden, correctly-sized host, let it lay out + run PIC, then rasterise
 * its live `<svg>` to a PNG data URL. Reusing Canvas guarantees the thumbnail
 * matches the detail view exactly.
 *
 * This is the lazy one-at-a-time backfill path for saves without a stored
 * thumbnail. It is DOM-bound (like `thumbnailStore.ts`) and not unit-tested; it
 * fails soft (returns null) so a bad config degrades to a placeholder. Every
 * null path logs `[thumbnail] …` so a genuinely broken pipeline is diagnosable
 * from the console instead of silently blanking the whole grid.
 *
 * Robustness: the render is bounded by a hard timeout so a single stuck raster
 * (an `<img>` load that never fires `onload`/`onerror` for some SVG) can't wedge
 * the caller's single-flight backfill queue — it resolves null, the queue
 * advances, and that card keeps its placeholder.
 */

/** Give up on one thumbnail after this long so the backfill queue never wedges. */
const RENDER_TIMEOUT_MS = 8000

const nextFrame = () =>
  new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 16)
  })

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([p, delay(ms).then(() => onTimeout)])
}

/**
 * Wait for the offscreen `Canvas` to actually commit an `<svg>` with content.
 * The root renders concurrently (deferred pan/zoom + the PIC memo), so rather
 * than a fixed sleep we poll a few frames until the SVG exists and has children,
 * capped so a truly empty render still returns (as null-ish) instead of looping.
 */
async function waitForSvgContent(
  svgRef: React.RefObject<SVGSVGElement | null>,
): Promise<SVGSVGElement | null> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    await nextFrame()
    const svg = svgRef.current
    if (svg && svg.childNodes.length > 0) {
      // One more frame so late layers (Strands) land before we capture.
      await nextFrame()
      return svgRef.current
    }
  }
  return svgRef.current
}

async function renderOnce(config: PatternConfig, size: number): Promise<string | null> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0px',
    width: `${size}px`,
    height: `${size}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    opacity: '0',
    zIndex: '-1',
  })
  document.body.appendChild(host)

  const svgRef = createRef<SVGSVGElement>()
  const segmentsRef = { current: [] as Segment[] }
  const flags = faithfulRenderFlags(config)
  const root = createRoot(host)

  try {
    root.render(
      createElement(Canvas, {
        config,
        svgRef: svgRef as React.RefObject<SVGSVGElement>,
        segmentsRef,
        cpVisible: {},
        cpActive: {},
        ...flags,
      }),
    )
    const svg = await waitForSvgContent(svgRef)
    if (!svg) {
      console.warn('[thumbnail] no <svg> committed for', config.tiling.type)
      return null
    }
    if (svg.childNodes.length === 0) {
      console.warn('[thumbnail] <svg> rendered empty for', config.tiling.type)
    }
    const url = await rasterizeSvgToDataUrl(svg, {
      width: size,
      height: size,
      background: DEFAULT_PNG_BACKGROUND,
    })
    if (!url) console.warn('[thumbnail] rasterize returned null for', config.tiling.type)
    return url
  } catch (err) {
    console.warn('[thumbnail] render threw for', config.tiling.type, err)
    return null
  } finally {
    // Defer unmount a tick — unmounting inside the same synchronous frame that
    // React is committing warns; a microtask is enough to clear it.
    setTimeout(() => {
      try { root.unmount() } catch { /* ignore */ }
      host.remove()
    }, 0)
  }
}

export async function renderConfigToThumbnail(
  config: PatternConfig,
  size = 384,
): Promise<string | null> {
  if (typeof document === 'undefined') return null
  return withTimeout(renderOnce(config, size), RENDER_TIMEOUT_MS, null)
}
