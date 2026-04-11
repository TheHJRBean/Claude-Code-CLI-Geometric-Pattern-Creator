/**
 * Debug script: check edge-sharing connectivity of the Girih Crab tiling.
 */
const PI = Math.PI;
const EPS = 0.005;

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

const data = {
  t1: { x: -3.618033988749893, y: 2.6286555605956687 },
  t2: { x: -2.23606797749979, y: -3.0776835371752527 },
  tiles: [
    {
      name: "decagon",
      sides: 10, regular: true,
      transforms: [
        { a: -0.30901699437494723, b: -0.9510565162951534, tx: 0.7346122469045185,
          c: 0.9510565162951534, d: -0.30901699437494723, ty: -1.9578783236649708 },
      ],
    },
    {
      name: "bowtie",
      sides: 6, regular: false,
      vertices: [
        { x: 0.9999999999999998, y: 0.3249196962329062 },
        { x: 0.9999999999999998, y: -0.3249196962329064 },
        { x: 1.6180339887498947, y: -0.12410828034667931 },
        { x: 2.2360679774997894, y: -0.3249196962329066 },
        { x: 2.2360679774997894, y: 0.3249196962329056 },
        { x: 1.6180339887498947, y: 0.12410828034667865 },
      ],
      transforms: [
        { a: 0.8090169943749472, b: 0.5877852522924728, tx: -2.5014557305952696, c: -0.5877852522924728, d: 0.8090169943749472, ty: -1.9578783236649713 },
        { a: -0.8090169943749472, b: -0.5877852522924735, tx: 0.7346122469045185, c: 0.5877852522924735, d: -0.8090169943749472, ty: -1.9578783236649713 },
        { a: 0.8090169943749471, b: 0.5877852522924727, tx: -0.8834217418453756, c: -0.5877852522924727, d: 0.8090169943749471, ty: -3.133448828249917 },
        { a: -0.8090169943749476, b: -0.5877852522924736, tx: 3.352646235654413, c: 0.5877852522924736, d: -0.8090169943749476, ty: -3.859991356255279 },
      ],
    },
    {
      name: "rhombus",
      sides: 4, regular: false,
      vertices: [
        { x: 1.116578258154624, y: -3.5350716600223717 },
        { x: 1.1165782581546226, y: -4.184911052488184 },
        { x: 1.734612246904517, y: -4.385722468374411 },
        { x: 1.7346122469045173, y: -3.7358830759085984 },
      ],
      transforms: [
        { a: 0.9999999999999998, b: 4.996003610813204e-16, tx: 2.1094237467877974e-15, c: -4.996003610813204e-16, d: 0.9999999999999998, ty: -1.7013016167040806 },
        { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
        { a: -0.30901699437494734, b: -0.9510565162951523, tx: -1.2823990336107252, c: 0.9510565162951523, d: -0.30901699437494734, ty: -6.540048716026023 },
        { a: -0.8090169943749492, b: 0.5877852522924738, tx: 5.715806020859413, c: -0.5877852522924738, d: -0.8090169943749492, ty: -6.914266980724973 },
        { a: -0.8090169943749462, b: 0.5877852522924725, tx: 4.097772032109505, c: -0.5877852522924725, d: -0.8090169943749462, ty: -7.439998092844097 },
        { a: -0.30901699437494945, b: -0.9510565162951536, tx: -2.5184670111105167, c: 0.9510565162951536, d: -0.30901699437494945, ty: -8.241350332730116 },
      ],
    },
    {
      name: "hexagon",
      sides: 6, regular: false,
      vertices: [
        { x: 0.7346122469045158, y: -4.710642164607318 },
        { x: 1.116578258154624, y: -5.236373276726452 },
        { x: 1.734612246904517, y: -5.437184692612679 },
        { x: 2.116578258154624, y: -4.911453580493545 },
        { x: 1.7346122469045193, y: -4.385722468374411 },
        { x: 1.1165782581546226, y: -4.184911052488184 },
      ],
      transforms: [
        { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
      ],
    },
    {
      name: "elongated-hex",
      sides: 6, regular: false,
      vertices: [
        { x: 2.618033988749895, y: 0.8506508083520394 },
        { x: 2.2360679774997894, y: 0.3249196962329056 },
        { x: 2.2360679774997894, y: -0.3249196962329066 },
        { x: 2.6180339887498945, y: -0.8506508083520405 },
        { x: 3, y: -0.3249196962329066 },
        { x: 3, y: 0.3249196962329055 },
      ],
      transforms: [
        { a: -0.8090169943749475, b: -0.5877852522924729, tx: 1.7346122469045184, c: 0.5877852522924729, d: -0.8090169943749475, ty: -5.0355618608402235 },
        { a: 0.809016994374947, b: -0.5877852522924729, tx: -1.50145573059527, c: 0.5877852522924729, d: 0.809016994374947, ty: -5.0355618608402235 },
        { a: 0.3090169943749471, b: -0.9510565162951534, tx: -0.8834217418453757, c: 0.9510565162951534, d: 0.3090169943749471, ty: -3.1334488282499167 },
        { a: 0.3090169943749465, b: -0.9510565162951518, tx: 0.7346122469045198, c: 0.9510565162951518, d: 0.3090169943749465, ty: -5.7621043888455805 },
        { a: 0.8090169943749472, b: -0.5877852522924737, tx: -3.5014557305952696, c: 0.5877852522924737, d: 0.8090169943749472, ty: -5.035561860840225 },
        { a: -0.309016994374947, b: 0.9510565162951528, tx: 0.11657825815462397, c: -0.9510565162951528, d: -0.309016994374947, ty: -0.05576529107466577 },
        { a: 0.8090169943749486, b: -0.5877852522924737, tx: -2.8834217418453774, c: 0.5877852522924737, d: 0.8090169943749486, ty: -3.133448828249917 },
        { a: -0.30901699437494723, b: 0.9510565162951539, tx: 0.7346122469045193, c: -0.9510565162951539, d: -0.30901699437494723, ty: -1.9578783236649695 },
        { a: 0.8090169943749467, b: -0.5877852522924725, tx: 0.11657825815462464, c: 0.5877852522924725, d: 0.8090169943749467, ty: -3.8599913562552755 },
      ],
    },
  ],
};

// Generate all tile instances for a 3×3 grid
const allInstances = [];
for (let i = -1; i <= 1; i++) {
  for (let j = -1; j <= 1; j++) {
    const ox = i * data.t1.x + j * data.t2.x;
    const oy = i * data.t1.y + j * data.t2.y;
    for (const tile of data.tiles) {
      const canonical = tile.regular ? regularVertices(tile.sides) : tile.vertices;
      for (const tr of tile.transforms) {
        const verts = canonical.map(v => {
          const tv = applyAffine(v, tr);
          return { x: tv.x + ox, y: tv.y + oy };
        });
        allInstances.push({ name: tile.name, cell: `${i},${j}`, verts });
      }
    }
  }
}

console.log(`Total tile instances in 3x3 grid: ${allInstances.length}`);

// Check edge sharing
function edgeKey(a, b) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return `${Math.round(mx * 200)},${Math.round(my * 200)}`;
}

const edgeMap = new Map();
let totalEdges = 0;
let sharedEdges = 0;

for (let ii = 0; ii < allInstances.length; ii++) {
  const inst = allInstances[ii];
  const n = inst.verts.length;
  for (let e = 0; e < n; e++) {
    const v0 = inst.verts[e], v1 = inst.verts[(e + 1) % n];
    const key = edgeKey(v0, v1);
    totalEdges++;
    if (edgeMap.has(key)) {
      sharedEdges++;
    }
    edgeMap.set(key, { ii, e, name: inst.name, cell: inst.cell });
  }
}

// Count unshared edges for center cell only
let centerEdges = 0;
let centerUnshared = 0;
for (let ii = 0; ii < allInstances.length; ii++) {
  const inst = allInstances[ii];
  if (inst.cell !== '0,0') continue;
  const n = inst.verts.length;
  for (let e = 0; e < n; e++) {
    centerEdges++;
    const v0 = inst.verts[e], v1 = inst.verts[(e + 1) % n];
    const key = edgeKey(v0, v1);
    // Count how many instances share this edge
    let count = 0;
    for (const other of allInstances) {
      if (other === inst) continue;
      const m = other.verts.length;
      for (let f = 0; f < m; f++) {
        const u0 = other.verts[f], u1 = other.verts[(f + 1) % m];
        const d00 = Math.hypot(v0.x - u1.x, v0.y - u1.y);
        const d11 = Math.hypot(v1.x - u0.x, v1.y - u0.y);
        if (d00 < EPS && d11 < EPS) { count++; break; }
        const d01 = Math.hypot(v0.x - u0.x, v0.y - u0.y);
        const d10 = Math.hypot(v1.x - u1.x, v1.y - u1.y);
        if (d01 < EPS && d10 < EPS) { count++; break; }
      }
      if (count > 0) break;
    }
    if (count === 0) centerUnshared++;
  }
}

console.log(`\nCenter cell edges: ${centerEdges}`);
console.log(`Center cell unshared: ${centerUnshared}`);
console.log(`Center cell shared: ${centerEdges - centerUnshared}`);
console.log(`Coverage: ${((centerEdges - centerUnshared) / centerEdges * 100).toFixed(1)}%`);

// Area check
const cellArea = Math.abs(data.t1.x * data.t2.y - data.t1.y * data.t2.x);
let tileArea = 0;
for (const inst of allInstances) {
  if (inst.cell !== '0,0') continue;
  const v = inst.verts;
  let a = 0;
  for (let k = 0; k < v.length; k++) {
    const k1 = (k + 1) % v.length;
    a += v[k].x * v[k1].y - v[k1].x * v[k].y;
  }
  tileArea += Math.abs(a) / 2;
}
console.log(`\nCell area: ${cellArea.toFixed(3)}`);
console.log(`Tile area (center cell): ${tileArea.toFixed(3)}`);
console.log(`Coverage ratio: ${(tileArea / cellArea * 100).toFixed(1)}%`);

if (centerUnshared > 0) {
  console.log('\nUnshared edges in center cell:');
  for (let ii = 0; ii < allInstances.length; ii++) {
    const inst = allInstances[ii];
    if (inst.cell !== '0,0') continue;
    const n = inst.verts.length;
    for (let e = 0; e < n; e++) {
      const v0 = inst.verts[e], v1 = inst.verts[(e + 1) % n];
      let found = false;
      for (const other of allInstances) {
        if (other === inst) continue;
        const m = other.verts.length;
        for (let f = 0; f < m; f++) {
          const u0 = other.verts[f], u1 = other.verts[(f + 1) % m];
          const d00 = Math.hypot(v0.x - u1.x, v0.y - u1.y);
          const d11 = Math.hypot(v1.x - u0.x, v1.y - u0.y);
          if (d00 < EPS && d11 < EPS) { found = true; break; }
          const d01 = Math.hypot(v0.x - u0.x, v0.y - u0.y);
          const d10 = Math.hypot(v1.x - u1.x, v1.y - u1.y);
          if (d01 < EPS && d10 < EPS) { found = true; break; }
        }
        if (found) break;
      }
      if (!found) {
        console.log(`  ${inst.name} edge ${e}: (${v0.x.toFixed(3)},${v0.y.toFixed(3)}) -> (${v1.x.toFixed(3)},${v1.y.toFixed(3)})`);
      }
    }
  }
}
