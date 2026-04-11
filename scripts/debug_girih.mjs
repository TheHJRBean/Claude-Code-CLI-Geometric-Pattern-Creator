/**
 * Debug script: check edge-sharing connectivity of the decagonal-rosette tiling.
 *
 * For each tile in the fundamental domain we compute its actual vertices
 * (canonical polygon -> affine transform), replicate over a small lattice grid,
 * and then check which edges are shared between distinct tile instances.
 */

const PI = Math.PI;
const EPS = 0.001;

// ── Tiling data (copied from tapratsTiling.ts, 'decagonal-rosette') ──

const tilingData = {
  t1: { x: 3.472135954999581, y: -1.128165359777815 },
  t2: { x: 0.9270509831248424, y: 3.8279286375841797 },
  tiles: [
    {
      name: "hex-bowtie (6-irreg, tile 0)",
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
        { a: 0.3090169943749473, b: -0.9510565162951544, tx: 0.6180339887498948,
          c: 0.9510565162951544, d: 0.3090169943749473, ty: -1.9021130325903082 },
      ],
    },
    {
      name: "decagon (10-reg, tile 1)",
      sides: 10, regular: true,
      transforms: [
        { a: 1, b: 0, tx: 0,
          c: 0, d: 1, ty: 0 },
      ],
    },
    {
      name: "pentagon (5-reg, tile 2)",
      sides: 5, regular: true,
      transforms: [
        { a: 0.44721359549995787, b: -8.326672684688674e-17, tx: -0.44721359549995776,
          c: 8.326672684688674e-17, d: 0.44721359549995787, ty: 1.3763819204711734 },
      ],
    },
    {
      name: "quad (4-irreg, tile 3)",
      sides: 4, regular: false,
      vertices: [
        { x: 0, y: 1.7013016167040798 },
        { x: 5.551115123125783e-17, y: 1.051462224238267 },
        { x: 0.6180339887498947, y: 0.8506508083520399 },
        { x: 0.6180339887498949, y: 1.5004902008178527 },
      ],
      transforms: [
        { a: 1, b: 0, tx: 0,
          c: 0, d: 1, ty: 0 },
      ],
    },
    {
      name: "hex-kite (6-irreg, tile 4)",
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
        { a: 0.8090169943749481, b: -0.5877852522924734, tx: -1.0000000000000018,
          c: 0.5877852522924734, d: 0.8090169943749481, ty: -0.7265425280053611 },
      ],
    },
  ],
};

// ── Helpers ──

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
  return {
    x: t.a * v.x + t.b * v.y + t.tx,
    y: t.c * v.x + t.d * v.y + t.ty,
  };
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ── Step 1: compute fundamental-domain tile instances ──

function computeTileInstances() {
  const instances = [];
  for (let ti = 0; ti < tilingData.tiles.length; ti++) {
    const tile = tilingData.tiles[ti];
    const canonical = tile.regular
      ? regularVertices(tile.sides)
      : tile.vertices;

    for (let xi = 0; xi < tile.transforms.length; xi++) {
      const xform = tile.transforms[xi];
      const verts = canonical.map((v) => applyAffine(v, xform));
      instances.push({ tileIdx: ti, xformIdx: xi, name: tile.name, verts });
    }
  }
  return instances;
}

// ── Step 2: replicate over lattice grid ──

function replicateGrid(instances, range) {
  const { t1, t2 } = tilingData;
  const all = [];
  for (let i = -range; i <= range; i++) {
    for (let j = -range; j <= range; j++) {
      const dx = t1.x * i + t2.x * j;
      const dy = t1.y * i + t2.y * j;
      for (const inst of instances) {
        const verts = inst.verts.map((v) => ({ x: v.x + dx, y: v.y + dy }));
        all.push({
          tileIdx: inst.tileIdx,
          name: inst.name,
          i, j,
          verts,
        });
      }
    }
  }
  return all;
}

// ── Step 3: find shared edges ──

function analyzeEdges(allTiles) {
  const bucketSize = 0.01;

  // Collect all edges
  const allEdges = [];
  for (let tid = 0; tid < allTiles.length; tid++) {
    const tile = allTiles[tid];
    const n = tile.verts.length;
    for (let k = 0; k < n; k++) {
      const a = tile.verts[k];
      const b = tile.verts[(k + 1) % n];
      allEdges.push({ tileId: tid, edgeIdx: k, a, b });
    }
  }
  const totalEdges = allEdges.length;

  // Spatial bucket by edge midpoint
  function bucketKey(v) {
    return `${Math.round(v.x / bucketSize)},${Math.round(v.y / bucketSize)}`;
  }

  const bucket = new Map();
  for (let i = 0; i < allEdges.length; i++) {
    const e = allEdges[i];
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    const k = bucketKey(mid);
    if (!bucket.has(k)) bucket.set(k, []);
    bucket.get(k).push(i);
  }

  const matched = new Set();
  const matchPairs = [];

  for (let i = 0; i < allEdges.length; i++) {
    if (matched.has(i)) continue;
    const e1 = allEdges[i];
    const mid1 = { x: (e1.a.x + e1.b.x) / 2, y: (e1.a.y + e1.b.y) / 2 };

    const candidates = new Set();
    for (const dk of [-1, 0, 1]) {
      for (const dl of [-1, 0, 1]) {
        const bk = `${Math.round(mid1.x / bucketSize) + dk},${Math.round(mid1.y / bucketSize) + dl}`;
        if (bucket.has(bk)) {
          for (const idx of bucket.get(bk)) candidates.add(idx);
        }
      }
    }

    for (const j of candidates) {
      if (j <= i) continue;
      if (matched.has(j)) continue;
      const e2 = allEdges[j];
      if (e2.tileId === e1.tileId) continue;

      const fwd = dist(e1.a, e2.a) < EPS && dist(e1.b, e2.b) < EPS;
      const rev = dist(e1.a, e2.b) < EPS && dist(e1.b, e2.a) < EPS;
      if (fwd || rev) {
        matched.add(i);
        matched.add(j);
        matchPairs.push([i, j]);
        break;
      }
    }
  }

  return { allEdges, totalEdges, matched, matchPairs };
}

// ── Main ──

function main() {
  console.log("=== Decagonal Rosette Tiling Debug ===\n");

  // Fundamental domain instances
  const fundInstances = computeTileInstances();
  console.log("Fundamental domain tiles:");
  for (const inst of fundInstances) {
    console.log(`  Tile ${inst.tileIdx} (${inst.name}): ${inst.verts.length} vertices`);
    for (let k = 0; k < inst.verts.length; k++) {
      const v = inst.verts[k];
      console.log(`    v${k}: (${v.x.toFixed(6)}, ${v.y.toFixed(6)})`);
    }
    for (let k = 0; k < inst.verts.length; k++) {
      const a = inst.verts[k];
      const b = inst.verts[(k + 1) % inst.verts.length];
      console.log(`    edge ${k}->${(k + 1) % inst.verts.length}: length=${dist(a, b).toFixed(6)}`);
    }
    console.log();
  }

  // Replicate over grid
  const RANGE = 1;
  const allTiles = replicateGrid(fundInstances, RANGE);
  console.log(`Grid range: -${RANGE} to ${RANGE} => ${(2 * RANGE + 1) ** 2} cells x ${fundInstances.length} tiles = ${allTiles.length} tile instances\n`);

  // Analyze edges
  const { allEdges, totalEdges, matched, matchPairs } = analyzeEdges(allTiles);
  const sharedEdgeCount = matchPairs.length;
  const unmatchedCount = totalEdges - matched.size;

  console.log(`Total edges across all tile instances: ${totalEdges}`);
  console.log(`Shared edge pairs found: ${sharedEdgeCount}`);
  console.log(`Matched edge count (x2): ${matched.size}`);
  console.log(`Unmatched edges: ${unmatchedCount}\n`);

  // Per-tile-type statistics
  const tileTypeStats = new Map();
  for (let i = 0; i < allEdges.length; i++) {
    const e = allEdges[i];
    const tile = allTiles[e.tileId];
    const key = tile.tileIdx;
    if (!tileTypeStats.has(key)) {
      tileTypeStats.set(key, { name: tile.name, total: 0, unmatched: 0, unmatchedEdges: [] });
    }
    const stat = tileTypeStats.get(key);
    stat.total++;
    if (!matched.has(i)) {
      stat.unmatched++;
      stat.unmatchedEdges.push({
        i: tile.i, j: tile.j,
        edgeIdx: e.edgeIdx,
        a: e.a, b: e.b,
        len: dist(e.a, e.b),
      });
    }
  }

  console.log("Per-tile-type edge statistics:");
  for (const [tileIdx, stat] of tileTypeStats) {
    const pct = ((stat.total - stat.unmatched) / stat.total * 100).toFixed(1);
    console.log(`  Tile ${tileIdx} (${stat.name}): ${stat.total} edges, ${stat.unmatched} unmatched (${pct}% shared)`);
  }
  console.log();

  // Unmatched edges from CENTER CELL
  console.log("Unmatched edges from CENTER CELL (i=0, j=0):");
  for (const [tileIdx, stat] of tileTypeStats) {
    const centerUnmatched = stat.unmatchedEdges.filter(e => e.i === 0 && e.j === 0);
    if (centerUnmatched.length > 0) {
      console.log(`  Tile ${tileIdx} (${stat.name}):`);
      for (const e of centerUnmatched) {
        console.log(`    edge ${e.edgeIdx}: (${e.a.x.toFixed(6)}, ${e.a.y.toFixed(6)}) -> (${e.b.x.toFixed(6)}, ${e.b.y.toFixed(6)})  len=${e.len.toFixed(6)}`);
      }
    }
  }
  console.log();

  // Distinct edge lengths
  const edgeLengths = new Map();
  for (const e of allEdges) {
    const len = dist(e.a, e.b).toFixed(4);
    edgeLengths.set(len, (edgeLengths.get(len) || 0) + 1);
  }
  console.log("Distinct edge lengths (rounded to 4 decimals):");
  for (const [len, count] of [...edgeLengths.entries()].sort()) {
    console.log(`  ${len}: ${count} edges`);
  }
  console.log();

  // === Key diagnostic: for center cell unmatched edges, find nearest edge from ANY other tile ===
  console.log("=== DIAGNOSTIC: Nearest neighbor for each unmatched center-cell edge ===");
  const centerTiles = allTiles.filter(t => t.i === 0 && t.j === 0);

  // Collect all center-cell unmatched edges with their global index
  const centerUnmatchedEdges = [];
  for (let i = 0; i < allEdges.length; i++) {
    if (matched.has(i)) continue;
    const tile = allTiles[allEdges[i].tileId];
    if (tile.i !== 0 || tile.j !== 0) continue;
    centerUnmatchedEdges.push({ idx: i, ...allEdges[i], tile });
  }

  for (const ue of centerUnmatchedEdges) {
    const mid = { x: (ue.a.x + ue.b.x) / 2, y: (ue.a.y + ue.b.y) / 2 };
    let bestDist = Infinity;
    let bestEdge = null;
    let bestTile = null;

    for (let j = 0; j < allEdges.length; j++) {
      if (j === ue.idx) continue;
      const e2 = allEdges[j];
      const t2 = allTiles[e2.tileId];
      if (t2.i === ue.tile.i && t2.j === ue.tile.j && t2.tileIdx === ue.tile.tileIdx) continue;

      const mid2 = { x: (e2.a.x + e2.b.x) / 2, y: (e2.a.y + e2.b.y) / 2 };
      const d = dist(mid, mid2);
      if (d < bestDist) {
        bestDist = d;
        bestEdge = e2;
        bestTile = t2;
      }
    }

    if (bestEdge && bestDist < 1.0) {
      const epDists = {
        aa: dist(ue.a, bestEdge.a).toFixed(6),
        ab: dist(ue.a, bestEdge.b).toFixed(6),
        ba: dist(ue.b, bestEdge.a).toFixed(6),
        bb: dist(ue.b, bestEdge.b).toFixed(6),
      };
      console.log(`  Tile${ue.tile.tileIdx}[${ue.tile.name}] edge${ue.edgeIdx}:`);
      console.log(`    this:    (${ue.a.x.toFixed(6)}, ${ue.a.y.toFixed(6)}) -> (${ue.b.x.toFixed(6)}, ${ue.b.y.toFixed(6)})`);
      console.log(`    nearest: Tile${bestTile.tileIdx}[${bestTile.name}] (${bestTile.i},${bestTile.j}) edge${bestEdge.edgeIdx}`);
      console.log(`             (${bestEdge.a.x.toFixed(6)}, ${bestEdge.a.y.toFixed(6)}) -> (${bestEdge.b.x.toFixed(6)}, ${bestEdge.b.y.toFixed(6)})`);
      console.log(`    midpoint dist: ${bestDist.toFixed(6)}`);
      console.log(`    endpoint dists: a-a=${epDists.aa}, a-b=${epDists.ab}, b-a=${epDists.ba}, b-b=${epDists.bb}`);
      console.log();
    }
  }

  // === Fundamental domain vertex sharing ===
  console.log("=== Fundamental domain vertex sharing analysis ===");
  const vertBucket = new Map();
  for (const tile of centerTiles) {
    for (let k = 0; k < tile.verts.length; k++) {
      const v = tile.verts[k];
      const bk = `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)}`;
      if (!vertBucket.has(bk)) vertBucket.set(bk, []);
      vertBucket.get(bk).push({ tileIdx: tile.tileIdx, name: tile.name, vertIdx: k });
    }
  }
  let sharedVerts = 0;
  let isolatedVerts = 0;
  for (const [bk, entries] of vertBucket) {
    if (entries.length > 1) sharedVerts++;
    else isolatedVerts++;
  }
  console.log(`Vertices shared between >=2 tiles in fund. domain: ${sharedVerts}`);
  console.log(`Vertices belonging to only 1 tile: ${isolatedVerts}`);

  console.log("\nShared vertices:");
  for (const [bk, entries] of vertBucket) {
    if (entries.length > 1) {
      const [x, y] = bk.split(',').map(Number);
      const tiles = entries.map(e => `tile${e.tileIdx}[${e.name}].v${e.vertIdx}`).join(', ');
      console.log(`  (${(x/1000).toFixed(3)}, ${(y/1000).toFixed(3)}): ${tiles}`);
    }
  }

  console.log("\nIsolated vertices (not shared with any other tile in fund. domain):");
  for (const [bk, entries] of vertBucket) {
    if (entries.length === 1) {
      const [x, y] = bk.split(',').map(Number);
      const e = entries[0];
      console.log(`  (${(x/1000).toFixed(3)}, ${(y/1000).toFixed(3)}): tile${e.tileIdx}[${e.name}].v${e.vertIdx}`);
    }
  }

  // === Expected vs actual coverage ===
  console.log("\n=== Coverage analysis ===");
  // In a perfect edge-to-edge tiling of a 3x3 grid, interior edges should all be shared.
  // Only boundary edges (those on the outer perimeter of the 3x3 grid) should be unmatched.
  // For the center cell, ALL edges should be shared (it's surrounded on all sides).
  const centerEdgeCount = centerTiles.reduce((s, t) => s + t.verts.length, 0);
  const centerUnmatchedCount = centerUnmatchedEdges.length;
  console.log(`Center cell total edges: ${centerEdgeCount}`);
  console.log(`Center cell unmatched edges: ${centerUnmatchedCount}`);
  console.log(`Center cell matched edges: ${centerEdgeCount - centerUnmatchedCount}`);
  if (centerUnmatchedCount > 0) {
    console.log(`\n*** PROBLEM: Center cell has ${centerUnmatchedCount} unmatched edges! ***`);
    console.log(`In a correct edge-to-edge tiling, the center cell of a 3x3 grid should have ALL edges matched.`);
  } else {
    console.log(`\nCenter cell fully connected - tiling appears correct.`);
  }

  // === Count total tiles that SHOULD fill the fundamental domain ===
  console.log("\n=== Fundamental domain area check ===");
  // The parallelogram spanned by t1,t2 has area |t1 x t2|
  const { t1, t2 } = tilingData;
  const cellArea = Math.abs(t1.x * t2.y - t1.y * t2.x);
  console.log(`Cell area (|t1 x t2|): ${cellArea.toFixed(6)}`);

  // Compute area of each tile in the fundamental domain using shoelace formula
  let totalTileArea = 0;
  for (const inst of fundInstances) {
    let area = 0;
    const n = inst.verts.length;
    for (let k = 0; k < n; k++) {
      const a = inst.verts[k];
      const b = inst.verts[(k + 1) % n];
      area += a.x * b.y - b.x * a.y;
    }
    area = Math.abs(area) / 2;
    totalTileArea += area;
    console.log(`  Tile ${inst.tileIdx} (${inst.name}): area=${area.toFixed(6)}`);
  }
  console.log(`Total tile area: ${totalTileArea.toFixed(6)}`);
  console.log(`Area ratio (tiles/cell): ${(totalTileArea / cellArea).toFixed(6)}`);
  if (Math.abs(totalTileArea / cellArea - 1) > 0.01) {
    console.log(`*** PROBLEM: Tile area does not match cell area! Ratio should be 1.0 ***`);
    console.log(`   Missing area: ${(cellArea - totalTileArea).toFixed(6)} (${((1 - totalTileArea/cellArea) * 100).toFixed(1)}% of cell)`);
  }
}

main();
