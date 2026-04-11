/**
 * Compute the actual gap region between the two hendecagons in the hendecagonal rosette.
 *
 * Strategy: place both hendecagons + their periodic neighbors, then find the
 * unshared edges of the hendecagons. These trace the boundary of the gap region.
 */
const PI = Math.PI;
const EPS = 0.001;

function regularVertices(n) {
  const R = 1 / Math.cos(PI / n);
  const verts = [];
  for (let k = 0; k < n; k++) {
    const angle = PI / n + (2 * PI * k) / n;
    verts.push({ x: R * Math.cos(angle), y: R * Math.sin(angle) });
  }
  return verts;
}

function applyAffine(v, t) {
  return { x: t.a * v.x + t.b * v.y + t.tx, y: t.c * v.x + t.d * v.y + t.ty };
}

const t1 = { x: 3.3097214678905702, y: -1.5114991487085165 };
const t2 = { x: 0.0, y: 3.022998297417033 };

const transforms = [
  { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
  { a: 0.9594929736144974, b: 0.28173255684142967, tx: -1.3097214678905702,
    c: -0.28173255684142967, d: 0.9594929736144974, ty: 1.5114991487085165 },
];

const canonical = regularVertices(11);

// Generate hendecagon instances for center cell + neighbors
const instances = [];
for (let i = -1; i <= 1; i++) {
  for (let j = -1; j <= 1; j++) {
    const ox = i * t1.x + j * t2.x;
    const oy = i * t1.y + j * t2.y;
    for (const tr of transforms) {
      const verts = canonical.map(v => {
        const tv = applyAffine(v, tr);
        return { x: tv.x + ox, y: tv.y + oy };
      });
      let cx = 0, cy = 0;
      for (const v of verts) { cx += v.x; cy += v.y; }
      instances.push({ cell: `${i},${j}`, verts, center: { x: cx/11, y: cy/11 } });
    }
  }
}

console.log(`Total hendecagon instances: ${instances.length}`);

// For each center-cell hendecagon, find unshared edges
function edgeMatch(a0, a1, b0, b1) {
  const d1 = Math.hypot(a0.x-b1.x, a0.y-b1.y) + Math.hypot(a1.x-b0.x, a1.y-b0.y);
  const d2 = Math.hypot(a0.x-b0.x, a0.y-b0.y) + Math.hypot(a1.x-b1.x, a1.y-b1.y);
  return Math.min(d1, d2) < EPS;
}

// Collect all unshared edges from center-cell hendecagons
const gapEdges = [];

for (let ii = 0; ii < instances.length; ii++) {
  const inst = instances[ii];
  if (inst.cell !== '0,0') continue;

  const n = inst.verts.length;
  for (let e = 0; e < n; e++) {
    const v0 = inst.verts[e];
    const v1 = inst.verts[(e + 1) % n];

    let shared = false;
    for (let jj = 0; jj < instances.length; jj++) {
      if (jj === ii) continue;
      const other = instances[jj];
      const m = other.verts.length;
      for (let f = 0; f < m; f++) {
        const u0 = other.verts[f];
        const u1 = other.verts[(f + 1) % m];
        if (edgeMatch(v0, v1, u0, u1)) { shared = true; break; }
      }
      if (shared) break;
    }

    if (!shared) {
      // This edge faces the gap — reverse it so it traces the gap boundary
      gapEdges.push({ from: v1, to: v0, srcInst: ii, srcEdge: e });
    }
  }
}

console.log(`\nUnshared (gap-facing) edges from center-cell hendecagons: ${gapEdges.length}`);

// Try to chain the gap edges into closed polygons
function vEq(a, b) { return Math.hypot(a.x-b.x, a.y-b.y) < EPS; }

const used = new Set();
const polygons = [];

for (let start = 0; start < gapEdges.length; start++) {
  if (used.has(start)) continue;

  const chain = [gapEdges[start]];
  used.add(start);

  let safety = 0;
  while (safety++ < 50) {
    const last = chain[chain.length - 1];
    if (chain.length > 2 && vEq(last.to, chain[0].from)) break; // closed

    let found = false;
    for (let k = 0; k < gapEdges.length; k++) {
      if (used.has(k)) continue;
      if (vEq(last.to, gapEdges[k].from)) {
        chain.push(gapEdges[k]);
        used.add(k);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`Chain broken at (${last.to.x.toFixed(4)}, ${last.to.y.toFixed(4)})`);
      break;
    }
  }

  polygons.push(chain);
}

console.log(`\nGap polygons found: ${polygons.length}`);

for (let p = 0; p < polygons.length; p++) {
  const chain = polygons[p];
  const verts = chain.map(e => e.from);
  console.log(`\nPolygon ${p}: ${verts.length} vertices`);

  // Area
  let area = 0;
  for (let k = 0; k < verts.length; k++) {
    const k1 = (k + 1) % verts.length;
    area += verts[k].x * verts[k1].y - verts[k1].x * verts[k].y;
  }
  area = Math.abs(area) / 2;
  console.log(`  Area: ${area.toFixed(4)}`);

  // Center
  let cx = 0, cy = 0;
  for (const v of verts) { cx += v.x; cy += v.y; }
  console.log(`  Center: (${(cx/verts.length).toFixed(4)}, ${(cy/verts.length).toFixed(4)})`);

  // Print vertices as JS array
  console.log('  Vertices (for tiling data):');
  for (const v of verts) {
    console.log(`    { x: ${v.x}, y: ${v.y} },`);
  }

  // Check convexity
  let allPositive = true, allNegative = true;
  for (let k = 0; k < verts.length; k++) {
    const a = verts[k];
    const b = verts[(k + 1) % verts.length];
    const c = verts[(k + 2) % verts.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross > EPS) allNegative = false;
    if (cross < -EPS) allPositive = false;
  }
  console.log(`  Convex: ${allPositive || allNegative}`);
}
