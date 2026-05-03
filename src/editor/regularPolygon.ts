import type { Vec2 } from '../utils/math'

/**
 * Vertices of a regular n-gon in CCW order.
 *
 * Conventions:
 *   - `rotation = 0` puts vertex 0 on the +x axis at distance R from `center`,
 *     where R is the circumradius derived from `edgeLength`.
 *   - Subsequent vertices step by 2π / n CCW.
 *
 * Lifted in spirit from `archive/tessellation-lab/`'s
 * `regularPolygonVertices(n, radius, phi)`. This variant takes edge length
 * (the editor's authoritative size, per Decision 14) rather than circumradius.
 */
export function regularPolygonVertices(
  sides: number,
  center: Vec2,
  edgeLength: number,
  rotation: number,
): Vec2[] {
  const n = Math.max(3, Math.floor(sides))
  const R = edgeLength / (2 * Math.sin(Math.PI / n))
  const verts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = rotation + (2 * Math.PI * i) / n
    verts.push({
      x: center.x + R * Math.cos(a),
      y: center.y + R * Math.sin(a),
    })
  }
  return verts
}
