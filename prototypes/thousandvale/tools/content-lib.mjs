// Stream E — shared helpers for the content tools (assign-vignettes, place-vignettes) and stream E tests.
// Node only (reads files). Pure logic lives in the functions; nothing here writes.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseTerrain } from '../js/rules/terrain-read.js';
import { HOME_PROVINCE, provinceArg, provinceDataPath, provinceDataSync, namesPath } from '../js/sim/province-files.js';
export { HOME_PROVINCE, provinceArg, provinceDataPath, provinceDataSync, namesPath };

export const ROOT = new URL('../', import.meta.url);
export const J = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
export const VIGNETTE_FILES = ['data/vignettes/m1.json', 'data/vignettes/m2.json', 'data/vignettes/m2b.json'];
export const allVignettes = () => VIGNETTE_FILES.flatMap(f => J(f).vignettes);
/**
 * [W] A province's own wilderness dressing (Expansion 1): data/vignettes/<prov>-vignettes.json / -curios.json /
 * -wayside.json when the province has them, else the home catalogues — so an island is never dressed with Torbor's
 * sheep pens and scarecrows, and a Torbor run reads exactly the files it always did. -> { vignettes, curios, wayside }
 */
export function provinceDressing(prov = HOME_PROVINCE) {
  const own = f => (prov && prov !== HOME_PROVINCE && existsSync(new URL(`data/vignettes/${prov}-${f}.json`, ROOT)) ? J(`data/vignettes/${prov}-${f}.json`) : null);
  const v = own('vignettes'), c = own('curios'), w = own('wayside');
  return {
    vignettes: v ? v.vignettes : allVignettes(),
    curios: c ? c.curios : ((existsSync(new URL('data/vignettes/curios.json', ROOT)) ? J('data/vignettes/curios.json') : { curios: [] }).curios),
    wayside: w ? w.kinds : J('data/vignettes/wayside.json').kinds,
  };
}
const NOT_ZONE = new Set(['jobs.json', 'treasure.json', 'province.json', 'events.json']);
/**
 * A zone's quest file plus the PARTS it names in `include` (play-test 2: start.json, classes.json, setpieces.json —
 * each `{ zone, part, npcs, quests }`), merged: npcs joined, quests appended. Stream A's loader does the same
 * (js/sim/content.js; docs/requests.md E -> A play-test 2). A part never stands alone as a zone file.
 */
export function mergeQuestParts(main, readPart) {
  if (!main || !Array.isArray(main.include) || !main.include.length) return main;
  const out = { ...main, npcs: { ...(main.npcs || {}) }, quests: [...(main.quests || [])] };
  for (const f of main.include) {
    const part = readPart(f);
    if (!part) continue;
    Object.assign(out.npcs, part.npcs || {});
    out.quests.push(...(part.quests || []).map(q => ({ ...q, part: part.part || f })));
  }
  return out;
}
const partFiles = () => new Set(readdirSync(new URL('data/quests/', ROOT)).filter(f => f.endsWith('.json')).flatMap(f => { try { return J('data/quests/' + f).include || []; } catch { return []; } }));
export const questFiles = () => {
  const parts = partFiles();
  return readdirSync(new URL('data/quests/', ROOT)).filter(f => f.endsWith('.json') && !NOT_ZONE.has(f) && !/-province\.json$/.test(f) && !parts.has(f))      // (<province>-province.json: another province's story index, Expansion 1)
    .map(f => mergeQuestParts(J('data/quests/' + f), pf => (existsSync(new URL('data/quests/' + pf, ROOT)) ? J('data/quests/' + pf) : null)));
};

/** E zone id -> world zone id for a province (stream B's data/world/province-map.json). */
export const provinceMap = (prov = HOME_PROVINCE) => J('data/world/province-map.json').provinces[prov].map;

/** A province's name lists: the sheet's own `names` file when it names one, else its data/names/<prov>.json, else the home names (shared kind). */
export const readNames = (prov, sheet = null) => ((sheet && sheet.names) ? J(namesPath(prov, sheet)) : provinceDataSync(J, prov, 'names')) || {};
/** Every province of data/world/province-map.json -> its map (E zone id -> world zone id). */
export const provinceMaps = () => { try { return Object.fromEntries(Object.entries(J('data/world/province-map.json').provinces || {}).map(([k, v]) => [k, (v && v.map) || {}])); } catch { return {}; } };
/**
 * Does E zone id `eid` belong to province `prov`? A zone in some province's map belongs to that province; a zone in
 * no map (the quest parts' `test`-style files, shared files) belongs to the home province. A content tool run for one
 * province only rewrites the shared-file entries this says are its own.
 */
export function zoneBelongs(prov, eid, maps = provinceMaps()) {
  for (const [k, m] of Object.entries(maps)) if (eid != null && Object.prototype.hasOwnProperty.call(m, eid)) return k === prov;
  return prov === HOME_PROVINCE;
}
/**
 * A content tool's province, checked: the `--province` argument (default the home province) with its map entry and
 * sheet present — else one clear line and exit 2 (no stack trace). `need` = extra paths that must exist (bakes…).
 */
export function requireProvince(argv = process.argv, { need = [], sheet = true } = {}) {
  const prov = provinceArg(argv);
  const fail = why => { console.error(`${(argv[1] || 'tool').replace(/^.*\//, '')}: province ${prov}: ${why}`); process.exit(2); };
  let map = null;
  try { map = J('data/world/province-map.json').provinces[prov]; } catch { /* below */ }
  if (!map) fail('not in data/world/province-map.json yet');
  if (sheet && !existsSync(new URL(`data/provinces/${prov}.json`, ROOT))) fail(`no sheet data/provinces/${prov}.json yet`);
  if (!Object.values(map.map || {}).some(wid => existsSync(new URL(`data/zones/${wid}/placements.json`, ROOT)))) fail('none of its zones is baked yet');
  for (const f of need) if (!existsSync(new URL(typeof f === 'function' ? f(prov) : f, ROOT))) fail(`missing ${typeof f === 'function' ? f(prov) : f}`);
  return prov;
}

/**
 * Vignettes that quests, quest NPCs and treasure steps in a zone NAME — they have to be placed in that zone.
 * -> { <E zone id>: Set<vignette id> }
 */
export function pinnedVignettes() {
  const ids = new Set(allVignettes().map(v => v.id));
  const out = {};
  const add = (z, id) => { if (ids.has(id)) (out[z] ??= new Set()).add(id); };
  for (const q of questFiles()) {
    for (const n of Object.values(q.npcs || {})) add(q.zone, n.at);
    for (const qq of q.quests || []) {
      if (qq.startsFrom && qq.startsFrom.vignette) add(q.zone, qq.startsFrom.vignette);
      for (const s of qq.steps || []) if (s.vignette) add(q.zone, s.vignette);
    }
  }
  for (const c of J('data/quests/treasure.json').chains) for (const s of [...c.steps, c.cache]) if (typeof s.at === 'string') add(s.zone, s.at);
  return out;
}

/** Biome keys covering >= `min` of each baked zone (sampled every 32 m). -> { <E zone id>: [key…] (+ .water = share of samples under water) } */
export const WET_BIOMES = new Set(['lake', 'coast', 'beach', 'marsh']);
/** A vignette that only makes sense by water (every biome tag wet) does not go in a zone that has none of those biomes and (almost) no water. */
export const dryMismatch = (v, real) => !!real && v.tags.biomes.every(b => WET_BIOMES.has(b)) && !v.tags.biomes.some(b => real.includes(b)) && (real.water || 0) < 0.01;
export function measuredBiomes(prov = HOME_PROVINCE, min = 0.03) {
  const out = {};
  for (const [eid, wid] of Object.entries(provinceMap(prov))) {
    const f = new URL(`data/zones/${wid}/terrain.bin`, ROOT);
    if (!existsSync(f)) continue;
    const t = parseTerrain(readFileSync(f));
    const h = new Map(); let n = 0, wet = 0;
    for (let z = 16; z < t.extent; z += 32) for (let x = 16; x < t.extent; x += 32) {
      const px = t.bounds.minX + x, pz = t.bounds.minZ + z, k = t.biomes[t.biomeAt(px, pz)].key;
      h.set(k, (h.get(k) || 0) + 1); n++; if (t.waterAt(px, pz).depth > 0) wet++;
    }
    out[eid] = [...h].filter(([k, c]) => c / n >= min && k !== 'road').sort((a, b) => b[1] - a[1]).map(([k]) => k);
    out[eid].water = wet / n;
  }
  return out;
}
