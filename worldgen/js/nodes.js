// Nodes: the places on the map — settlements, landmarks, dungeons and lairs, ports, mountain passes.
//
// Settlements are scored the way people actually choose ground: fresh water, flat land, a kind
// climate, a coast to trade from. The best cells win, then a minimum spacing stops them clumping,
// and the tiers (capital → city → town → village → hamlet) are handed out from the top down.
//
//   import { placeNodes } from './nodes.js';
//   placeNodes(world, opts);      // fills world.nodes and region.nodes
//
// Node shape: { id, type, kind, name, x, y, index, region, tier, size, tags[], score, meta }

import { makeRng, subSeed, clamp } from './noise.js';
import { BIOMES } from './biomes.js';
import { Namer } from './names.js';

const IDX = (w, x, y) => y * w + x;

const SETTLEMENT_TIERS = [
  { tier: 'capital', spacing: 26, share: 0, size: 5 },
  { tier: 'city', spacing: 15, share: 0.1, size: 4 },
  { tier: 'town', spacing: 9, share: 0.22, size: 3 },
  { tier: 'village', spacing: 5.5, share: 0.34, size: 2 },
  { tier: 'hamlet', spacing: 3.5, share: 1, size: 1 },
];

/** Landmark kinds and what ground they want. `fit` returns 0..1; 0 means "not here". */
const LANDMARKS = [
  { kind: 'ruin', tags: ['ruin', 'explore'], fit: c => 0.4 + c.aura * 0.3 + (c.habit > 0.4 ? 0.3 : 0) },
  { kind: 'shrine', tags: ['shrine', 'rest'], fit: c => 0.35 + Math.max(0, -c.aura) * 0.6 + c.magic * 0.3 },
  { kind: 'cave', tags: ['cave', 'explore'], fit: c => (c.relief ? 0.9 : c.slope > 0.35 ? 0.5 : 0.1) },
  { kind: 'tower', tags: ['tower', 'lore'], fit: c => 0.3 + c.magic * 0.7 + (c.elev > 0.65 ? 0.25 : 0) },
  { kind: 'monolith', tags: ['monolith', 'lore'], fit: c => 0.3 + c.magic * 0.5 + (c.open ? 0.3 : 0) },
  { kind: 'volcano', tags: ['volcano', 'hazard'], fit: c => (c.volcanic ? 1.6 : c.biome === 'volcanic' ? 1.2 : 0) },
  { kind: 'waterfall', tags: ['water', 'scenic'], fit: c => (c.river && c.drop > 0.035 ? 1.4 : 0) },
  { kind: 'ancientwood', tags: ['forest', 'scenic'], fit: c => (c.forest ? 0.9 + c.moist * 0.4 : 0) },
  { kind: 'battlefield', tags: ['battle', 'lore'], fit: c => (c.open ? 0.6 + c.aura * 0.5 : 0.15) },
  // the two below only appear on an uninhabited world (c.wild), so World Forge's own maps are untouched
  { kind: 'crater', tags: ['crater', 'explore'], fit: c => (c.wild ? (c.dry && c.elev < 0.5 ? 1.0 : c.open ? 0.55 : c.relief ? 0.2 : 0.4) : 0) },
  { kind: 'vent', tags: ['vent', 'hazard'], fit: c => (c.wild && (c.volcanic || c.biome === 'volcanic' || c.biome === 'ashPlain' || c.magic > 0.62) ? 1.1 : 0) },
];

/** What an uninhabited world keeps: natural features and old remains, nothing anyone lives in or tends. */
const WILD_KINDS = new Set(['ruin', 'cave', 'monolith', 'volcano', 'crater', 'vent']);

/** Harsh ground that hides dungeons and lairs. */
const LAIR_BIOMES = new Set(['badlands', 'marsh', 'mountains', 'snowyPeaks', 'volcanic', 'blighted', 'ashPlain', 'veiledHills', 'desert', 'ice', 'rainforest', 'glimmerwaste']);

export function placeNodes(world, opts) {
  const w = world.width, h = world.height, N = w * h;
  // an uninhabited world gets no settlements or ports at all — the passes that place them are skipped,
  // not run and hidden — and only the WILD_KINDS of landmark; dungeons stay, lairs do not
  const inhabited = opts.inhabited !== false;
  const dry = opts.liquid === 'none';
  const rng = makeRng(subSeed(world.seed, 'nodes'));
  const namer = world._namer || (world._namer = new Namer({ namegen: opts.namegen, raceTable: opts.raceTable, seed: world.seed }));
  const areaScale = Math.sqrt(N / (256 * 128));
  const nodes = [];
  const placed = [];        // everything placed so far, for spacing checks

  // ---- per-cell facts the scorers need
  const nearWater = new Float32Array(N);      // 1 next to fresh water, falling off with distance
  const nearOcean = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    if (world.water[i] !== 0) continue;
    let fresh = 0, sea = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = IDX(w, xx, yy); const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (world.river[j] || world.water[j] === 2) fresh = Math.max(fresh, 1 - d * 0.32);
      if (world.water[j] === 1 && d <= 1) sea = 1;
    }
    nearWater[i] = fresh; nearOcean[i] = sea;
  }

  const habitability = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (world.water[i] !== 0) { habitability[i] = 0; continue; }
    const b = BIOMES[world.biome[i]];
    const temp = world.temperature[i], moist = world.moisture[i], elev = world.elevation[i];
    let s = (b.habit ?? 0.3) * 1.15;
    s += (1 - world.slope[i]) * 0.55;
    s += (1 - Math.min(1, Math.abs(temp - 0.56) * 2.6)) * 0.6;
    s += (1 - Math.min(1, Math.abs(moist - 0.55) * 2.2)) * 0.35;
    s += nearWater[i] * 0.95;
    s += nearOcean[i] ? 0.55 : 0;
    s -= Math.max(0, elev - 0.68) * 1.8;
    s -= Math.max(0, world.aura[i]) * 0.55;
    habitability[i] = Math.max(0, s);
  }
  world.habitability = habitability;

  const landCount = world.stats?.landCells || habitability.reduce((n, v, i) => n + (world.water[i] === 0 ? 1 : 0), 0);
  const density = clamp(opts.settlementDensity, 0, 1);
  const totalSettlements = clamp(Math.round((landCount / 230) * (0.35 + density * 1.7)), 3, 400);

  // ---- candidate cells, best ground first, with a little noise so it is not a strict ranking
  const cand = [];
  for (let i = 0; i < N; i++) if (habitability[i] > 0.45) cand.push(i);
  cand.sort((a, b) => habitability[b] - habitability[a]);
  if (!inhabited) cand.length = 0;          // no capitals, towns, villages or hamlets

  const far = (x, y, minDist, list = placed) => {
    const m2 = minDist * minDist;
    for (const p of list) if ((p.x - x) ** 2 + (p.y - y) ** 2 < m2) return false;
    return true;
  };
  const regionAt = i => (world.region ? world.region[i] : -1);

  // capitals: one per continent big enough to hold one, best ground on it
  const continentOf = new Int16Array(N).fill(-1);
  world.continents.forEach((c, ci) => { /* filled below */ void c; void ci; });
  {
    const seen = new Uint8Array(N);
    world.continents.forEach((c, ci) => {
      const stack = [c.sample]; seen[c.sample] = 1;
      while (stack.length) {
        const i = stack.pop(); continentOf[i] = ci;
        const x = i % w, y = (i / w) | 0;
        const push = j => { if (j >= 0 && j < N && !seen[j] && world.water[j] === 0) { seen[j] = 1; stack.push(j); } };
        if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
      }
    });
  }
  world.continentOf = continentOf;

  const capitals = Math.max(1, Math.min(world.continents.filter(c => c.cells > landCount * 0.08).length, Math.round(2 + density * 3)));
  const usedContinent = new Set();
  let placedCount = 0;
  const addSettlement = (i, tier, size) => {
    const x = i % w, y = (i / w) | 0;
    const rid = regionAt(i);
    const region = world.regions[rid];
    const race = region?.race || namer.raceFor(BIOMES[world.biome[i]].key, subSeed(world.seed, 'n' + i));
    const name = namer.unique(namer.settlement(race, subSeed(world.seed, 'set' + i), tier), race, i);
    const port = !!nearOcean[i];
    const node = {
      id: nodes.length, type: 'settlement', kind: tier, tier, name: name.text, x, y, index: i,
      region: rid, race, size, score: habitability[i],
      tags: [tier, 'settlement', port ? 'port' : 'inland', BIOMES[world.biome[i]].key, ...(world.river[i] ? ['river'] : []), ...(nearWater[i] > 0.3 ? ['fresh water'] : [])],
      population: Math.round(([0, 60, 320, 1400, 6500, 24000][size] || 100) * (0.6 + rng() * 0.9)),
      biome: BIOMES[world.biome[i]].key,
    };
    nodes.push(node); placed.push(node); placedCount++;
    return node;
  };

  for (const i of cand) {
    if (usedContinent.size >= capitals) break;
    const ci = continentOf[i];
    if (ci < 0 || usedContinent.has(ci)) continue;
    if (world.continents[ci].cells < Math.max(40, landCount * 0.03)) continue;
    if (!far(i % w, (i / w) | 0, SETTLEMENT_TIERS[0].spacing * areaScale)) continue;
    usedContinent.add(ci);
    addSettlement(i, 'capital', 5);
  }

  const remaining = Math.max(0, totalSettlements - placedCount);
  const wanted = { city: Math.round(remaining * 0.12), town: Math.round(remaining * 0.24), village: Math.round(remaining * 0.32) };
  wanted.hamlet = Math.max(0, remaining - wanted.city - wanted.town - wanted.village);
  for (const t of SETTLEMENT_TIERS.slice(1)) {
    let n = wanted[t.tier] || 0;
    if (n <= 0) continue;
    for (const i of cand) {
      if (n <= 0) break;
      const x = i % w, y = (i / w) | 0;
      if (!far(x, y, t.spacing * areaScale)) continue;
      if (habitability[i] < 0.5) continue;
      addSettlement(i, t.tier, t.size);
      n--;
    }
  }

  // ---- standalone ports: a harbour where a stretch of coast has no town of its own
  const portDensity = inhabited ? Math.round(totalSettlements * 0.12 * (0.3 + density)) : 0;
  {
    const coastCand = [];
    for (let i = 0; i < N; i++) if (world.water[i] === 0 && nearOcean[i] && habitability[i] > 0.35) coastCand.push(i);
    coastCand.sort((a, b) => habitability[b] - habitability[a]);
    let n = portDensity;
    for (const i of coastCand) {
      if (n <= 0) break;
      const x = i % w, y = (i / w) | 0;
      if (!far(x, y, 8 * areaScale)) continue;
      const rid = regionAt(i); const race = world.regions[rid]?.race || 'human';
      const nm = namer.unique(namer.landmark('port', race, subSeed(world.seed, 'port' + i)), race, i);
      const node = { id: nodes.length, type: 'port', kind: 'port', name: nm.text, x, y, index: i, region: rid, race, size: 2, tags: ['port', 'harbour', 'coast'], biome: BIOMES[world.biome[i]].key };
      nodes.push(node); placed.push(node); n--;
    }
  }

  // ---- landmarks
  const landmarkCount = clamp(Math.round((landCount / 320) * (0.3 + clamp(opts.landmarkDensity, 0, 1) * 1.9)), 3, 500);
  {
    const scored = [];
    for (let i = 0; i < N; i++) {
      if (world.water[i] !== 0) continue;
      const x = i % w, y = (i / w) | 0;
      const b = BIOMES[world.biome[i]];
      let drop = 0;
      if (world.river[i]) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          drop = Math.max(drop, world.elevation[i] - world.elevation[IDX(w, xx, yy)]);
        }
      }
      const c = {
        aura: world.aura[i], magic: world.magic[i], elev: world.elevation[i], slope: world.slope[i], moist: world.moisture[i],
        biome: b.key, relief: b.tags.includes('relief'), forest: b.tags.includes('forest'), open: b.tags.includes('open'),
        habit: b.habit ?? 0.3, river: world.river[i] > 0, drop, volcanic: world.volcanic[i] === 1,
        wild: !inhabited, dry,
      };
      for (const L of LANDMARKS) {
        if (!inhabited && !WILD_KINDS.has(L.kind)) continue;
        const f = L.fit(c);
        if (f > 0.35) scored.push({ i, kind: L.kind, tags: L.tags, score: f * (0.75 + rng() * 0.5) });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    let n = landmarkCount;
    for (const s of scored) {
      if (n <= 0) break;
      const x = s.i % w, y = (s.i / w) | 0;
      if (!far(x, y, 4.2 * areaScale)) continue;
      const rid = regionAt(s.i); const race = world.regions[rid]?.race || 'human';
      const nm = namer.unique(namer.landmark(s.kind, race, subSeed(world.seed, 'lm' + s.i)), race, s.i);
      const node = { id: nodes.length, type: 'landmark', kind: s.kind, name: nm.text, x, y, index: s.i, region: rid, race, size: 1, tags: [...s.tags, BIOMES[world.biome[s.i]].key], biome: BIOMES[world.biome[s.i]].key };
      nodes.push(node); placed.push(node); n--;
    }
  }

  // ---- dungeons and lairs in harsh country
  const dungeonCount = clamp(Math.round((landCount / 420) * (0.25 + clamp(opts.dungeonDensity, 0, 1) * 1.9)), 2, 400);
  {
    const scored = [];
    for (let i = 0; i < N; i++) {
      if (world.water[i] !== 0) continue;
      const b = BIOMES[world.biome[i]];
      if (!LAIR_BIOMES.has(b.key)) continue;
      const remoteness = 1 - clamp(habitability[i] / 2, 0, 1);
      const s = remoteness * 1.1 + Math.max(0, world.aura[i]) * 0.8 + world.magic[i] * 0.4 + (b.tags.includes('harsh') ? 0.3 : 0);
      scored.push({ i, score: s * (0.7 + rng() * 0.6) });
    }
    scored.sort((a, b) => b.score - a.score);
    let n = dungeonCount;
    for (const s of scored) {
      if (n <= 0) break;
      const x = s.i % w, y = (s.i / w) | 0;
      if (!far(x, y, 5.5 * areaScale)) continue;
      const rid = regionAt(s.i); const race = world.regions[rid]?.race || 'orc';
      const isLair = inhabited && rng() < 0.45;       // a lair is something living; a dead world has vaults
      const kind = isLair ? 'lair' : 'dungeon';
      const nm = namer.unique(namer.landmark(kind, race, subSeed(world.seed, 'dg' + s.i)), race, s.i);
      const node = {
        id: nodes.length, type: 'dungeon', kind, name: nm.text, x, y, index: s.i, region: rid, race, size: 1,
        danger: clamp(0.25 + Math.max(0, world.aura[s.i]) * 0.5 + world.elevation[s.i] * 0.3, 0, 1),
        tags: [kind, 'danger', BIOMES[world.biome[s.i]].key], biome: BIOMES[world.biome[s.i]].key,
      };
      nodes.push(node); placed.push(node); n--;
    }
  }

  // ---- mountain passes: the low saddles that a road can actually use
  {
    const passes = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = IDX(w, x, y);
      if (world.water[i] !== 0) continue;
      if (!BIOMES[world.biome[i]].tags.includes('relief')) continue;
      const e = world.elevation[i];
      const N4 = [world.elevation[i - 1], world.elevation[i + 1], world.elevation[i - w], world.elevation[i + w]];
      const horizLower = e < N4[0] && e < N4[1], vertLower = e < N4[2] && e < N4[3];
      const horizHigher = e > N4[0] && e > N4[1], vertHigher = e > N4[2] && e > N4[3];
      if ((horizLower && vertHigher) || (vertLower && horizHigher)) passes.push({ i, e });
    }
    passes.sort((a, b) => a.e - b.e);
    const passCells = new Uint8Array(N);
    let n = clamp(Math.round(passes.length * 0.06), 2, 60);
    for (const p of passes) {
      if (n <= 0) break;
      const x = p.i % w, y = (p.i / w) | 0;
      if (!far(x, y, 7 * areaScale)) continue;
      const rid = regionAt(p.i); const race = world.regions[rid]?.race || 'dwarf';
      const nm = namer.unique(namer.feature('pass', race, subSeed(world.seed, 'pass' + p.i)), race, p.i);
      const node = { id: nodes.length, type: 'pass', kind: 'pass', name: nm.text, x, y, index: p.i, region: rid, race, size: 1, tags: ['pass', 'route'], biome: BIOMES[world.biome[p.i]].key };
      nodes.push(node); placed.push(node); passCells[p.i] = 1; n--;
    }
    // roads.js reads this to make passes cheap to travel through
    world.passCells = passCells;
  }

  world.nodes = nodes;
  for (const r of world.regions) r.nodes = [];
  for (const n of nodes) if (n.region >= 0 && world.regions[n.region]) world.regions[n.region].nodes.push(n.id);
  for (const r of world.regions) {
    const seats = r.nodes.map(id => nodes[id]).filter(n => n.type === 'settlement').sort((a, b) => b.size - a.size);
    r.seat = seats[0] ? seats[0].id : null;
    r.population = r.nodes.map(id => nodes[id]).reduce((s, n) => s + (n.population || 0), 0);
  }
  return world;
}
