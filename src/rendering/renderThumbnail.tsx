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
 * matches the detail view exactly; the cost is that we must wait for its
 * ResizeObserver + deferred pan/zoom to settle before capturing.
 *
 * This is the lazy one-at-a-time backfill path for saves without a stored
 * thumbnail. It is DOM-bound (like `thumbnailStore.ts`) and not unit-tested;
 * it fails soft (returns null) so a bad config degrades to a placeholder.
 */

const nextFrame = () =>
  new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 16)
  })

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** Let React commit, the ResizeObserver fire the real container size, and the
 *  deferred pan/zoom + PIC memo settle before we read the SVG. */
async function settle(): Promise<void> {
  await nextFrame()
  await nextFrame()
  await delay(48)
  await nextFrame()
}

export async function renderConfigToThumbnail(
  config: PatternConfig,
  size = 384,
): Promise<string | null> {
  if (typeof document === 'undefined') return null

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
    await settle()
    const svg = svgRef.current
    if (!svg) return null
    return await rasterizeSvgToDataUrl(svg, {
      width: size,
      height: size,
      background: DEFAULT_PNG_BACKGROUND,
    })
  } catch {
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
