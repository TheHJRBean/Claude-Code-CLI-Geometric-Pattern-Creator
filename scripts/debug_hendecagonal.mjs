/**
 * Debug: check hendecagonal rosette tiling for coverage and edge sharing.
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
  t1: { x: 3.3097214678905702, y: -1.5114991487085165 },
  t2: { x: 0.0, y: 3.022998297417033 },
  tiles: [
    {
      name: "11-gon",
      sides: 11, regular: true,
      transforms: [
        { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 },
        { a: 0.9594929736144974, b: 0.28173255684142967, tx: -1.3097214678905702,
          c: -0.28173255684142967, d: 0.9594929736144974, ty: 1.5114991487085165 },
      ],
    },
    {
      name: "quad-A", sides: 4, regular: false,
      vertices: [
        { x: 1, y: 0.29362649293836673 },
        { x: 0.6825070656623624, y: 0.7876551419728285 },
        { x: 0.14832296034141051, y: 1.0316088487362083 },
        { x: -0.4329526368879809, y: 0.9480340350256571 },
      ],
      transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
    },
    {
      name: "tri-A", sides: 3, regular: false,
      vertices: [
        { x: -0.4329526368879809, y: 0.9480340350256571 },
        { x: -0.26750435166416486, y: 1.5114991487085165 },
        { x: -0.4329526368879808, y: 2.0749642623913758 },
      ],
      transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
    },
    {
      name: "quad-B", sides: 4, regular: false,
      vertices: [
        { x: -0.4329526368879808, y: 2.0749642623913758 },
        { x: 0.14832296034141024, y: 1.9913894486808246 },
        { x: 0.6825070656623619, y: 2.235343155444204 },
        { x: 0.9999999999999996, y: 2.7293718044786663 },
      ],
      transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
    },
    {
      name: "quad-C", sides: 4, regular: false,
      vertices: [
        { x: 0.9999999999999996, y: 2.7293718044786663 },
        { x: 1.3174929343376374, y: 2.2353431554442045 },
        { x: 1.8516770396585889, y: 1.9913894486808248 },
        { x: 2.432952636887981, y: 2.074964262391376 },
      ],
      transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
    },
    {
      name: "tri-B", sides: 3, regular: false,
      vertices: [
        { x: 2.432952636887981, y: 2.074964262391376 },
        { x: 2.267504351664164, y: 1.5114991487085168 },
        { x: 2.432952636887981, y: 0.9480340350256571 },
      ],
      transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
    },
    {
      name: "quad-D", sides: 4, regular: false,
      vertices: [
        { x: 2.432952636887981, y: 0.9480340350256571 },
        { x: 1.8516770396585893, y: 1.0316088487362085 },
        { x: 1.3174929343376376, y: 0.7876551419728288 },
        { x: 1, y: 0.29362649293836673 },
      ],
      transforms: [{ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 }],
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

// Count unshared edges for center cell
let centerEdges = 0;
let centerUnshared = 0;
const unsharedList = [];

for (const inst of allInstances) {
  if (inst.cell !== '0,0') continue;
  const n = inst.verts.length;
  for (let e = 0; e < n; e++) {
    centerEdges++;
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
      centerUnshared++;
      unsharedList.push({ name: inst.name, edge: e, v0, v1 });
    }
  }
}

console.log(`\nCenter cell edges: ${centerEdges}`);
console.log(`Center cell unshared: ${centerUnshared}`);
console.log(`Center cell shared: ${centerEdges - centerUnshared}`);

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
console.log(`\nCell area: ${cellArea.toFixed(4)}`);
console.log(`Tile area: ${tileArea.toFixed(4)}`);
console.log(`Coverage: ${(tileArea / cellArea * 100).toFixed(1)}%`);
console.log(`Deficit: ${(cellArea - tileArea).toFixed(4)}`);

if (unsharedList.length > 0) {
  console.log('\nUnshared edges:');
  for (const u of unsharedList) {
    console.log(`  ${u.name} edge ${u.edge}: (${u.v0.x.toFixed(4)},${u.v0.y.toFixed(4)}) -> (${u.v1.x.toFixed(4)},${u.v1.y.toFixed(4)})`);
  }
}

// Print all center-cell tile centers and vertices for visualization
console.log('\n=== Center cell tiles ===');
for (const inst of allInstances) {
  if (inst.cell !== '0,0') continue;
  let cx = 0, cy = 0;
  for (const v of inst.verts) { cx += v.x; cy += v.y; }
  cx /= inst.verts.length; cy /= inst.verts.length;
  console.log(`${inst.name}: center=(${cx.toFixed(3)},${cy.toFixed(3)})`);
}
