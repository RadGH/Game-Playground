#!/usr/bin/env node
// Thousandvale — WANDERING PACK ROUTES from the baked province (owner 2026-10-16, js/sim/packs.js).
//
//   node tools/content-packs.mjs                      write data/provinces/pack-routes.json (Torbor Downs)
//   node tools/content-packs.mjs --province=vharlen   write data/provinces/vharlen-pack-routes.json
//   node tools/content-packs.mjs --check [--province=…]  change nothing; exit 1 when the file would change
//
// Run it LAST after any re-bake (after content-professions -> content-towns -> content-givers -> content-hunts ->
// fill-quest-marks, and content-hazards on Vharlen): it keeps clear of the towns, villages, quest givers, waystones,
// dungeon doors and event arenas those place (js/sim/pack-routes.js keepOutOf). Same inputs -> same output.
//
// Per route it also lists the COMPOSITIONS (data/provinces/packs.json) that may walk it: a composition is only placed
// in a zone whose camps already hold at least MIN_BODIES of every kind it brings (its leader's kind at least one camp,
// else that composition walks there leaderless — `noLead`), weighted by how much it likes the route's kind.
import { writeFileSync, readFileSync } from 'node:fs';
import { loadLayouts } from '../server/load.mjs';
import { packRoutes, keepOutOf, routeProblem } from '../js/sim/pack-routes.js';
import { provinceArg, provinceDataPath, provinceDataSync } from '../js/sim/province-files.js';

export const MIN_BODIES = 12;
const ROOT = new URL('../', import.meta.url);
const readJ = f => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8'));
const CHECK = process.argv.includes('--check');
const PROV = provinceArg(process.argv);

/** Which compositions may walk a route in a zone holding `types` (type -> bodies in its camps). */
export function compsFor(comps, types, kind) {
  const out = {}, noLead = [];
  for (const [id, c] of Object.entries(comps || {})) {
    const need = (c.members || []).map(m => m.type);
    if (!need.length || need.some(t => (types.get(t) || 0) < MIN_BODIES)) continue;
    const likes = (c.likes || []).filter(k => k === kind).length;
    out[id] = Math.round(((c.weight || 1) * (likes ? 1 + likes : 0.5)) * 100) / 100;
    if (c.leader && !types.get(c.leader.type)) noLead.push(id);
  }
  return { comps: out, noLead };
}

export async function makeProvinceRoutes(prov = PROV, { quiet = true } = {}) {
  const log0 = console.log;
  if (quiet) console.log = () => {};
  let L;
  try { ({ layouts: [L] } = await loadLayouts([prov])); } finally { console.log = log0; }
  const packs = provinceDataSync(readJ, prov, 'packs') || {};
  const zones = L.zones.map(z => ({ key: z.key, bounds: z.bounds, band: (z.sheet && z.sheet.band) || [1, 4] }));
  const keepOut = keepOutOf(L);
  const { routes } = packRoutes({ key: L.key, zones, terrain: L.terrain, keepOut, roads: (L.travel && L.travel.routes) || [], perZone: (packs.rules && packs.rules.perZone) || 6 });
  const typesIn = keys => {
    const m = new Map();
    for (const c of L.camps) {
      if (!c.type || c.encounter) continue;
      const z = zones.find(q => c.x >= q.bounds.minX && c.x < q.bounds.maxX && c.z >= q.bounds.minZ && c.z < q.bounds.maxZ);
      if (z && keys.includes(z.key)) m.set(c.type, (m.get(c.type) || 0) + (c.count || 1));
    }
    return m;
  };
  const out = [];
  for (const r of routes) {
    const { comps, noLead } = compsFor(packs.compositions, typesIn(r.zones), r.kind);
    if (!Object.keys(comps).length) continue;      // nothing of this zone travels together
    const bad = routeProblem(r, { terrain: L.terrain, keepOut, zones });
    if (bad) throw new Error(`route ${r.id}: ${bad.why} at ${Math.round(bad.x)}, ${Math.round(bad.z)}`);
    out.push({ ...r, comps, ...(noLead.length ? { noLead } : {}) });
  }
  return { _doc: `Wandering pack routes for ${L.name} — made by tools/content-packs.mjs from the bake (do not edit by hand; re-run it after a re-bake, last in the content chain). Read by js/sim/packs.js. Each route: zone, kind (road | shore | valley | open | cross), loop (false = there and back), pts (world metres), rests (waypoint indices where the pack stops), length (one lap, metres), zones it passes through, comps {composition id: weight} that may walk it, noLead (compositions that walk it with no leader: the zone has none of that leader's kind).`,
    province: prov, routes: out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = provinceDataPath(PROV, 'pack-routes');
  const made = await makeProvinceRoutes(PROV);
  const text = JSON.stringify(made, (k, v) => (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' ? JSON.stringify(v) : v), 1).replace(/"\[(-?[\d.]+),(-?[\d.]+)\]"/g, '[$1, $2]') + '\n';
  let old = null; try { old = readFileSync(new URL(file, ROOT), 'utf8'); } catch { /* new */ }
  const per = {}; for (const r of made.routes) per[r.zone] = (per[r.zone] || 0) + 1;
  process.stdout.write(`${PROV}: ${made.routes.length} routes over ${Object.keys(per).length} zones (${Object.entries(per).map(([z, n]) => z + ' ' + n).join(', ')})\n`);
  if (CHECK) { if (old !== text) { process.stdout.write(file + ' would change\n'); process.exit(1); } process.stdout.write(file + ' is up to date\n'); }
  else { writeFileSync(new URL(file, ROOT), text); process.stdout.write('wrote ' + file + '\n'); }
}
