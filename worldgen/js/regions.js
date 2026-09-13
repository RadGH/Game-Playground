// Regions: cut the land into named provinces, then name the big natural features (seas, ranges,
// rivers, lakes, forests, continents).
//
// Borders follow what a traveller would notice — a mountain wall, a wide river, a change of biome —
// because region growth is a cheapest-path spread from seed cells where crossing those things is
// expensive. Small leftovers are merged into the neighbour they share the longest border with.
//
//   import { buildRegions } from './regions.js';
//   buildRegions(world, opts);   // fills world.region (Int16Array), world.regions, seas/ranges/…

import { makeRng, subSeed, clamp } from './noise.js';
import { BIOMES, BIOME_BLURB } from './biomes.js';
import { Namer } from './names.js';

const IDX = (w, x, y) => y * w + x;

export function buildRegions(world, opts) {
  const w = world.width, h = world.height, N = w * h;
  const rng = makeRng(subSeed(world.seed, 'regions'));
  const namer = world._namer || (world._namer = new Namer({ namegen: opts.namegen, raceTable: opts.raceTable, seed: world.seed }));

  const region = new Int16Array(N).fill(-1);
  const landCells = [];
  for (let i = 0; i < N; i++) if (world.water[i] === 0) landCells.push(i);
  world.region = region;
  world.regions = [];
  if (!landCells.length) return world;

  // ---- seeds: scattered land cells with a minimum spacing, biased to habitable ground
  const target = clamp(Math.round(opts.regionCount), 2, 200);
  const spacing = Math.max(3, Math.sqrt(landCells.length / target) * 0.78);
  const seeds = [];
  const shuffled = landCells.slice();
  rng.shuffle(shuffled);
  for (const i of shuffled) {
    if (seeds.length >= target) break;
    const x = i % w, y = (i / w) | 0;
    let ok = true;
    for (const s of seeds) { if ((s.x - x) ** 2 + (s.y - y) ** 2 < spacing * spacing) { ok = false; break; } }
    if (ok) seeds.push({ x, y, i });
  }
  if (!seeds.length) seeds.push({ x: landCells[0] % w, y: (landCells[0] / w) | 0, i: landCells[0] });

  // ---- cheapest-path growth (Dijkstra from every seed at once)
  const dist = new Float32Array(N).fill(Infinity);
  const heapK = [], heapV = [];
  const push = (k, v) => {
    heapK.push(k); heapV.push(v); let i = heapK.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heapK[p] <= heapK[i]) break; [heapK[p], heapK[i]] = [heapK[i], heapK[p]]; [heapV[p], heapV[i]] = [heapV[i], heapV[p]]; i = p; }
  };
  const pop = () => {
    const top = heapV[0], lk = heapK.pop(), lv = heapV.pop();
    if (heapK.length) {
      heapK[0] = lk; heapV[0] = lv; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heapK.length && heapK[l] < heapK[m]) m = l;
        if (r < heapK.length && heapK[r] < heapK[m]) m = r;
        if (m === i) break;
        [heapK[m], heapK[i]] = [heapK[i], heapK[m]]; [heapV[m], heapV[i]] = [heapV[i], heapV[m]]; i = m;
      }
    }
    return top;
  };
  seeds.forEach((s, id) => { dist[s.i] = 0; region[s.i] = id; push(0, s.i); });
  const stepCost = (a, b) => {
    const relief = Math.abs(world.elevation[b] - world.elevation[a]) * 26;
    const biomeChange = world.biome[a] !== world.biome[b] ? 1.6 : 0;
    const wall = BIOMES[world.biome[b]].tags.includes('relief') ? 1.8 : 0;
    const crossing = world.river[b] ? 1.2 + world.river[b] * 0.9 : 0;
    const auraChange = Math.abs(world.aura[a] - world.aura[b]) * 2;
    return 1 + relief + biomeChange + wall + crossing + auraChange;
  };
  while (heapK.length) {
    const i = pop();
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx === 0) === (dy === 0)) continue;          // 4-neighbours keeps borders tidy
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = IDX(w, xx, yy); if (world.water[j] !== 0) continue;
      const nd = dist[i] + stepCost(i, j);
      if (nd < dist[j]) { dist[j] = nd; region[j] = region[i]; push(nd, j); }
    }
  }

  // ---- merge undersized regions into the neighbour they touch most
  const counts = new Int32Array(seeds.length);
  for (let i = 0; i < N; i++) if (region[i] >= 0) counts[region[i]]++;
  const minCells = Math.max(2, Math.round(opts.minRegionCells));
  const remap = new Int32Array(seeds.length); remap.forEach((_, i) => { remap[i] = i; });
  const resolve = id => { while (remap[id] !== id) id = remap[id]; return id; };
  const smalls = [...counts.keys()].filter(id => counts[id] > 0 && counts[id] < minCells).sort((a, b) => counts[a] - counts[b]);
  for (const id of smalls) {
    const rid = resolve(id);
    const shared = new Map();
    for (let i = 0; i < N; i++) {
      if (region[i] < 0 || resolve(region[i]) !== rid) continue;
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = IDX(w, xx, yy); if (world.water[j] !== 0 || region[j] < 0) continue;
        const nb = resolve(region[j]); if (nb === rid) continue;
        shared.set(nb, (shared.get(nb) || 0) + 1);
      }
    }
    if (!shared.size) continue;
    let bestNb = -1, bestN = -1;
    for (const [nb, n] of shared) if (n > bestN) { bestN = n; bestNb = nb; }
    remap[rid] = bestNb;
    counts[bestNb] += counts[rid]; counts[rid] = 0;
  }
  // compact ids
  const finalId = new Map(); let next = 0;
  for (let id = 0; id < seeds.length; id++) { const r = resolve(id); if (counts[r] > 0 && !finalId.has(r)) finalId.set(r, next++); }
  for (let i = 0; i < N; i++) region[i] = region[i] < 0 ? -1 : (finalId.get(resolve(region[i])) ?? -1);

  // ---- gather per-region facts
  const R = [];
  for (let id = 0; id < next; id++) R.push({
    id, cells: 0, sumX: 0, sumY: 0, minX: w, minY: h, maxX: 0, maxY: 0,
    biomeCount: new Map(), temp: 0, moist: 0, elev: 0, aura: 0, magic: 0,
    coastal: false, riverCells: 0, lakeCells: 0, neighbours: new Set(), highest: 0, cellList: [],
  });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y); const id = region[i]; if (id < 0) continue;
    const r = R[id];
    r.cells++; r.sumX += x; r.sumY += y; r.cellList.push(i);
    if (x < r.minX) r.minX = x; if (x > r.maxX) r.maxX = x; if (y < r.minY) r.minY = y; if (y > r.maxY) r.maxY = y;
    r.biomeCount.set(world.biome[i], (r.biomeCount.get(world.biome[i]) || 0) + 1);
    r.temp += world.temperature[i]; r.moist += world.moisture[i]; r.elev += world.elevation[i];
    r.aura += world.aura[i]; r.magic += world.magic[i];
    if (world.elevation[i] > r.highest) r.highest = world.elevation[i];
    if (world.river[i]) r.riverCells++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = IDX(w, xx, yy);
      if (world.water[j] === 1) r.coastal = true;
      else if (world.water[j] === 2) r.lakeCells++;
      else if (region[j] >= 0 && region[j] !== id) r.neighbours.add(region[j]);
    }
  }

  // clearance map, so a label sits in the open middle of a region rather than on its edge
  const clearance = new Int16Array(N);
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) { const i = IDX(w, x, y); run = region[i] >= 0 && (x > 0 && region[i] === region[i - 1]) ? run + 1 : (region[i] >= 0 ? 1 : 0); clearance[i] = run; }
    run = 0;
    for (let x = w - 1; x >= 0; x--) { const i = IDX(w, x, y); run = region[i] >= 0 && (x < w - 1 && region[i] === region[i + 1]) ? run + 1 : (region[i] >= 0 ? 1 : 0); clearance[i] = Math.min(clearance[i], run); }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y < h; y++) { const i = IDX(w, x, y); run = region[i] >= 0 && (y > 0 && region[i] === region[i - w]) ? run + 1 : (region[i] >= 0 ? 1 : 0); clearance[i] = Math.min(clearance[i], run); }
    run = 0;
    for (let y = h - 1; y >= 0; y--) { const i = IDX(w, x, y); run = region[i] >= 0 && (y < h - 1 && region[i] === region[i + w]) ? run + 1 : (region[i] >= 0 ? 1 : 0); clearance[i] = Math.min(clearance[i], run); }
  }

  world.regions = R.map(r => {
    const dominant = [...r.biomeCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const biomeKey = BIOMES[dominant].key;
    const temp = r.temp / r.cells, moist = r.moist / r.cells, elev = r.elev / r.cells, aura = r.aura / r.cells, magic = r.magic / r.cells;
    const seed = subSeed(world.seed, 'region' + r.id);
    const race = namer.raceFor(biomeKey, seed, temp);
    const named = namer.unique(namer.region(race, seed), race, seed);
    let label = { x: Math.round(r.sumX / r.cells), y: Math.round(r.sumY / r.cells) };
    let bestC = -1;
    for (const i of r.cellList) { if (clearance[i] > bestC) { bestC = clearance[i]; label = { x: i % w, y: (i / w) | 0 }; } }
    const mix = [...r.biomeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, n]) => ({ biome: BIOMES[b].key, name: BIOMES[b].name, share: n / r.cells }));
    return {
      id: r.id, name: named.text, adjective: named.adj, people: named.people, race,
      cells: r.cells, center: { x: Math.round(r.sumX / r.cells), y: Math.round(r.sumY / r.cells) }, label,
      bbox: [r.minX, r.minY, r.maxX, r.maxY],
      biome: biomeKey, biomeName: BIOMES[dominant].name, mix,
      temperature: temp, moisture: moist, elevation: elev, aura, magic,
      coastal: r.coastal, riverCells: r.riverCells, lakeCells: r.lakeCells,
      neighbours: [...r.neighbours].sort((a, b) => a - b),
      descriptor: describeRegion({ biomeKey, temp, moist, elev, aura, magic, coastal: r.coastal, riverCells: r.riverCells, cells: r.cells, highest: r.highest }),
      danger: clamp(0.12 + Math.max(0, aura) * 0.55 + (1 - (BIOMES[dominant].habit ?? 0.5)) * 0.25 + Math.max(0, elev - 0.62) * 0.6, 0, 1),
      nodes: [], history: [],
    };
  });

  nameFeatures(world, opts, namer);
  return world;
}

/** A plain-language line about a region, for tooltips and the side list. */
function describeRegion({ biomeKey, temp, moist, elev, aura, coastal, riverCells, cells, highest }) {
  const heat = temp < 0.2 ? 'frozen' : temp < 0.35 ? 'cold' : temp < 0.55 ? 'mild' : temp < 0.75 ? 'warm' : 'baking';
  const wet = moist < 0.25 ? 'parched' : moist < 0.45 ? 'dry' : moist < 0.7 ? 'green' : 'sodden';
  const size = cells < 60 ? 'a pocket of' : cells < 200 ? '' : cells < 600 ? 'a wide stretch of' : 'a vast spread of';
  const bits = [];
  bits.push(`${size} ${heat}, ${wet} ${BIOME_BLURB[biomeKey] || BIOMES.find(b => b.key === biomeKey).name.toLowerCase()}`.trim());
  if (highest > 0.82) bits.push('with peaks that hold snow all year');
  if (coastal) bits.push('open to the sea');
  if (riverCells > cells * 0.06) bits.push('well watered');
  else if (riverCells === 0 && moist < 0.4) bits.push('with no running water');
  if (aura > 0.45) bits.push('and something in the ground here is wrong');
  else if (aura < -0.45) bits.push('and unusually calm');
  return bits.join(', ').replace(/, and /, ' and ');
}

/** Name the oceans and seas, mountain ranges, big forests, lakes, major rivers and continents. */
function nameFeatures(world, opts, namer) {
  const w = world.width, h = world.height, N = w * h;
  const seaId = new Int16Array(N).fill(-1);
  world.seas = componentsOf(world, i => world.water[i] === 1, seaId).map((c, idx) => {
    const race = namer.raceFor('coast', subSeed(world.seed, 'sea' + idx));
    const big = c.cells > N * 0.16;
    const nm = namer.unique(namer.feature(big ? 'ocean' : 'sea', race, subSeed(world.seed, 'sea' + idx)), race, idx);
    return { id: idx, name: nm.text, kind: big ? 'ocean' : 'sea', cells: c.cells, center: c.center };
  });
  world.seaId = seaId;

  world.lakes = componentsOf(world, i => world.water[i] === 2).filter(c => c.cells >= 2).map((c, idx) => {
    const race = namer.raceFor(nearestRegionRace(world, c.center) || 'grassland', subSeed(world.seed, 'lake' + idx));
    const nm = namer.unique(namer.feature('lake', race, subSeed(world.seed, 'lake' + idx)), race, idx);
    return { id: idx, name: nm.text, cells: c.cells, center: c.center };
  });

  world.ranges = componentsOf(world, i => BIOMES[world.biome[i]].tags.includes('relief') && world.elevation[i] > 0.68)
    .filter(c => c.cells >= Math.max(6, N * 0.0015))
    .map((c, idx) => {
      const race = namer.raceFor('mountains', subSeed(world.seed, 'range' + idx), world.temperature[c.center.y * w + c.center.x]);
      const nm = namer.unique(namer.feature('range', race, subSeed(world.seed, 'range' + idx)), race, idx);
      return { id: idx, name: nm.text, cells: c.cells, center: c.center, bbox: c.bbox };
    });

  world.forests = componentsOf(world, i => BIOMES[world.biome[i]].tags.includes('forest'))
    .filter(c => c.cells >= Math.max(12, N * 0.004))
    .map((c, idx) => {
      const race = namer.raceFor(BIOMES[world.biome[c.center.y * w + c.center.x]].key, subSeed(world.seed, 'forest' + idx));
      const nm = namer.unique(namer.feature('forest', race, subSeed(world.seed, 'forest' + idx)), race, idx);
      return { id: idx, name: nm.text, cells: c.cells, center: c.center };
    });

  const majorRivers = Math.max(3, Math.round(world.rivers.length * 0.35));
  world.rivers.forEach((r, idx) => {
    if (idx >= majorRivers && r.length < 12) return;
    const race = nearestRegionRace(world, r.source) || 'human';
    r.name = namer.unique(namer.feature('river', race, subSeed(world.seed, 'river' + idx)), race, idx).text;
    r.navigable = r.width >= 2 && r.mouth.type === 'sea';
  });

  world.continents.forEach((c, idx) => {
    const race = nearestRegionRace(world, c.center) || 'human';
    const kind = c.cells < world.width * 0.6 ? 'isle' : 'continent';
    c.name = namer.unique(namer.feature(kind, race, subSeed(world.seed, 'cont' + idx)), race, idx).text;
    c.kind = kind;
  });
}

function nearestRegionRace(world, pt) {
  const i = pt.y * world.width + pt.x;
  if (world.region && world.region[i] >= 0) return world.regions[world.region[i]]?.race;
  let best = null, bd = Infinity;
  for (const r of world.regions) { const d = (r.center.x - pt.x) ** 2 + (r.center.y - pt.y) ** 2; if (d < bd) { bd = d; best = r; } }
  return best?.race;
}

/** Connected components (4-neighbour) of cells matching a test. */
function componentsOf(world, test, outIds = null) {
  const w = world.width, h = world.height, N = w * h;
  const seen = new Uint8Array(N), out = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !test(s)) continue;
    const stack = [s]; seen[s] = 1;
    let n = 0, sx = 0, sy = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    while (stack.length) {
      const i = stack.pop(); const x = i % w, y = (i / w) | 0;
      n++; sx += x; sy += y;
      if (outIds) outIds[i] = out.length;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      const push = j => { if (j >= 0 && j < N && !seen[j] && test(j)) { seen[j] = 1; stack.push(j); } };
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    out.push({ cells: n, center: { x: Math.round(sx / n), y: Math.round(sy / n) }, bbox: [minX, minY, maxX, maxY] });
  }
  out.sort((a, b) => b.cells - a.cells);
  return out;
}
