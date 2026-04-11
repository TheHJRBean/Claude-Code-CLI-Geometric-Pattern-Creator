/**
 * Compute the neighbor polygon type for a given edge of a polygon in an
 * Archimedean tiling, using the vertex configuration and the polygon's
 * config position at vertex 0.
 *
 * The vertex config lists polygon types going CW around each vertex.
 * As we walk CW around our polygon, the config direction alternates
 * at each vertex (+1 at even vertices, -1 at odd vertices). This
 * handles chiral tilings like 4.6.12 where the CW and CCW readings
 * of the vertex config are distinct.
 *
 * At vertex v with direction d:
 *   - Neighbor across edge v (exiting) = vertexConfig[(p + d + L) % L]
 *   - Walk to v+1: direction flips to -d, and we find p_{v+1} such that
 *     vertexConfig[p_{v+1}] === sides AND
 *     vertexConfig[(p_{v+1} + d + L) % L] matches the neighbor type
 *     (the entering neighbor at v+1 is the exiting neighbor from v).
 */
export function computeNeighborSides(
  configPos0: number,
  edgeIndex: number,
  sides: number,
  vertexConfig: number[],
  d0: 1 | -1 = 1,
): { sides: number; configPos: number; direction: 1 | -1 } {
  const L = vertexConfig.length
  let p = configPos0
  let d = d0 // initial direction at vertex 0

  for (let v = 0; v < edgeIndex; v++) {
    const neighborType = vertexConfig[((p + d) % L + L) % L]
    // Walk to vertex v+1: direction flips
    const prevD = d
    d = -d as 1 | -1
    // Find p_{v+1}: vertexConfig[p'] === sides AND
    // vertexConfig[(p' + prevD + L) % L] === neighborType
    // Among all valid candidates, pick the one farthest from the current
    // position in the new direction d. This disambiguates configs with many
    // repeated elements (e.g. four 3s in [3,3,3,3,6]) where multiple
    // candidates satisfy the algebraic constraints.
    let bestP = -1
    let bestDist = -1
    for (let candidate = 0; candidate < L; candidate++) {
      if (
        vertexConfig[candidate] === sides &&
        vertexConfig[((candidate + prevD) % L + L) % L] === neighborType
      ) {
        const dist = ((candidate - p) * d % L + L) % L
        if (dist > bestDist) {
          bestDist = dist
          bestP = candidate
        }
      }
    }
    p = bestP !== -1 ? bestP : vertexConfig.indexOf(sides)
  }

  const neighborConfigPos = ((p + d) % L + L) % L
  return { sides: vertexConfig[neighborConfigPos], configPos: neighborConfigPos, direction: d }
}
