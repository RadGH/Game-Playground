#!/usr/bin/env node
// Stream E — decide WHICH vignettes each zone of a province gets (not where: coordinates come from
// tools/place-vignettes.mjs once B publishes the baked zones). PLAN §3.5 rules:
//   - no vignette twice in a zone; never twice within 2 zones (hard), preferably not within 3 (soft);
//   - a vignette only goes where its archetype tag fits (else where a biome fits, as a last resort);
//   - VARIETY: any 5 connected zones together hold >= 40 distinct vignettes.
// Seeded local search: same inputs -> same file.   node tools/assign-vignettes.mjs [province=torbor_downs] [perZone=9]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { connectedSets, gridDist } from './province-graph.mjs';
import { pinnedVignettes, measuredBiomes, dryMismatch } from './content-lib.mjs';

const prov = process.argv[2] || "torbor_downs", PER = +(process.argv[3] || 10), FIT = +(process.argv[4] || 0.92);
const root = new URL('../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const P = J(`data/provinces/${prov}.json`);
const VIG = [...J('data/vignettes/m1.json').vignettes, ...J('data/vignettes/m2.json').vignettes, ...J('data/vignettes/m2b.json').vignettes];
const ids = Object.keys(P.zones), Z = ids.map(id => ({ id, ...P.zones[id] }));
const sets = connectedSets(Z.map(z => z.grid), 5);
const D = Z.map(a => Z.map(b => gridDist(a.grid, b.grid)));

let s = 0x2545f491;
const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
// biome fallback: the sheet's designed biomes AND the biomes the baked zone really has (stream B's world, measured)
const real = measuredBiomes(prov);
const fit = Z.map(z => VIG.map((v, k) => v.tags.archetypes.includes(z.archetype) && !dryMismatch(v, real[z.id]) ? k : -1).filter(k => k >= 0));
const fitBiome = Z.map(z => VIG.map((v, k) => (real[z.id] || z.biomes).some(b => v.tags.biomes.includes(b)) && !dryMismatch(v, real[z.id]) ? k : -1).filter(k => k >= 0));
// pinned: vignettes a quest, NPC or treasure step in this zone names — they MUST be in the zone and are never swapped out
const pins = pinnedVignettes();
const vk = new Map(VIG.map((v, k) => [v.id, k]));
const pinK = Z.map(z => [...(pins[z.id] || [])].map(id => { if (!vk.has(id)) throw new Error(`${z.id}: pinned vignette ${id} does not exist`); return vk.get(id); }));

// start: the pins, then random fitting picks
const pick = Z.map((z, zi) => { const pool = [...fit[zi]].filter(k => !pinK[zi].includes(k)).sort(() => rnd() - 0.5); return [...pinK[zi], ...pool].slice(0, PER); });
function score() {
  let hard = 0, soft = 0, minSet = Infinity, sum = 0;
  for (let a = 0; a < Z.length; a++) for (let b = a + 1; b < Z.length; b++) {
    if (D[a][b] > 3) continue;
    const shared = pick[a].filter(k => pick[b].includes(k)).length;
    if (D[a][b] <= 2) hard += shared; else soft += shared;
  }
  for (const set of sets) { const n = new Set(set.flatMap(zi => pick[zi])).size; minSet = Math.min(minSet, n); sum += n; }
  return { hard, soft, minSet, cost: hard * 1000 + Math.max(0, 40 - minSet) * 200 + soft * 3 - sum / sets.length };
}
let cur = score();
for (let it = 0; it < 60000; it++) {
  const zi = Math.floor(rnd() * Z.length), slot = Math.floor(rnd() * PER);
  if (slot < pinK[zi].length) continue;
  const pool = rnd() < FIT ? fit[zi] : fitBiome[zi];
  const k = pool[Math.floor(rnd() * pool.length)];
  if (pick[zi].includes(k)) continue;
  const old = pick[zi][slot]; pick[zi][slot] = k;
  const nx = score();
  const T = Math.max(0.01, 30 * (1 - it / 60000));
  if (nx.cost <= cur.cost || rnd() < Math.exp((cur.cost - nx.cost) / T)) cur = nx; else pick[zi][slot] = old;
}
const out = { _doc: `Stream E. Which vignettes each zone of ${P.name} gets (tools/assign-vignettes.mjs). Coordinates are NOT here: tools/place-vignettes.mjs places them on the baked zone once stream B publishes it. Hard rule: no repeats within 2 zones; soft: within 3. Variety: every connected set of 5 zones holds >= 40 distinct vignettes.`,
  province: prov, perZone: PER, check: cur, pinned: Object.fromEntries(Z.map((z, zi) => [z.id, pinK[zi].map(k => VIG[k].id)])), zones: Object.fromEntries(Z.map((z, zi) => [z.id, pick[zi].map(k => VIG[k].id).sort()])) };
writeFileSync(new URL(`data/vignettes/assignment/${prov}.json`, root), JSON.stringify(out, null, 2) + '\n');
console.log(prov, cur, sets.length, 'connected 5-zone sets');
