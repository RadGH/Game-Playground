#!/usr/bin/env node
// Stream E (play-test 4 S14): "kill-quest areas (fen croakers) point at an area that may not have them".
//
// Works from what the SERVER spawns (server/load.mjs loadLayouts: E's placements + <zone>.hunt.json + the sheet's ring
// camps), never from a guess:
//   1. every story kill / collect step gets the area js/sim/quests.js points it at (js/sim/hunts.js: camps of one type
//      grouped into areas; the quest's zone, the place its `where` names, then nearest the giver). Where that area (or,
//      for a `near` step, the circle that counts) holds fewer monsters than the step needs (its count, capped at 4),
//      a copy of a camp of that type already standing there is added — same ground, same level, so nothing new has to
//      be validated — into data/vignettes/placements/<zone>.quest.json (js/sim/content.js merges it like .hunt.json);
//   2. data/quests/marks/<province>-hunts.json: every monster type's areas (world metres), for the map and tools;
//   3. data/quests/marks/<province>.json: each kill / collect step's mark re-pointed at its area (the runtime does the
//      same at load, so a stale marks file can never point at an empty field).
// Safe to run more than once (step 1 starts from no quest camps). Run after tools/place-vignettes.mjs:
//   node tools/content-hunts.mjs                (tests/E/playtest4-hunts.test.js checks the files are current)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadLayouts } from '../server/load.mjs';
import { createQuestBook, NEAR_M } from '../js/sim/quests.js';
import { huntAreas } from '../js/sim/hunts.js';

const ROOT = new URL('../', import.meta.url);
const PROV = 'torbor_downs';
const P = f => new URL(f, ROOT);
const readJ = f => JSON.parse(readFileSync(P(f), 'utf8'));
export const NEED_CAP = 4;

const quiet = async fn => { const q = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = q; } };
const zoneOffset = wid => { const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number); return { ox: zx * 2048, oz: zy * 2048 }; };

/** Head count of `type` inside circle c, from the server's camps (named/rare encounters left out). */
export const headsIn = (camps, type, c) => camps.filter(k => k.type === type && !k.encounter && Math.hypot(k.x - c.x, k.z - c.z) <= c.r).reduce((s, k) => s + Math.max(1, k.count || 1), 0);
/** The circle in which a step's kills count / its marker shows: `near` = place + NEAR_M; else its marker. */
export const regionOf = st => (st.nearAt && Number.isFinite(st.nearAt.x) ? { x: st.nearAt.x, z: st.nearAt.z, r: (st.nearAt.r || 12) + NEAR_M } : st.at);
export const stepType = st => (st.kind === 'kill' ? st.type : st.kind === 'collect' ? st.from : null);

async function main() {
  const wids = (await quiet(() => loadLayouts([PROV]))).layouts[0].zones.map(z => z.key).filter(w => /^z\d+_\d+$/.test(w));
  // 1. start from no quest camps
  const mains = {};
  for (const wid of wids) {
    const f = `data/vignettes/placements/${wid}.json`;
    if (!existsSync(P(f))) continue;
    mains[wid] = readJ(f);
    writeFileSync(P(`data/vignettes/placements/${wid}.quest.json`), JSON.stringify({ zone: wid, terrainHash: mains[wid].terrainHash, placements: [] }) + '\n');
  }
  let L = (await quiet(() => loadLayouts([PROV]))).layouts[0];
  let book = createQuestBook({ layout: L, zones: L.zones, rares: L.rares, jobs: null, rng: () => 0.3 });
  const added = {}, addedW = [], report = [];
  for (const d of book.defs.values()) d.steps.forEach((st, i) => {
    const type = stepType(st); if (!type || !st.at) return;
    const reg = regionOf(st), need = Math.min(NEED_CAP, st.count || 1);
    let have = headsIn(L.camps, type, reg) + headsIn(addedW, type, reg);      // copies made for an earlier step count too
    if (have >= need) return;
    // copy a camp of that type the server already spawns in the circle (a placed camp, a vignette's, a ring camp)
    const recs = L.camps.filter(c => c.type === type && !c.encounter && Math.hypot(c.x - reg.x, c.z - reg.z) <= reg.r)
      .sort((a, b) => Math.hypot(a.x - st.at.x, a.z - st.at.z) - Math.hypot(b.x - st.at.x, b.z - st.at.z));
    if (!recs.length) { report.push(`${d.id}#${i} ${type}: nothing of that type in its circle to copy`); return; }
    const from = have;
    let k = 0;
    while (have < need && k < 8) {
      const c = recs[k % recs.length], cw = L.zoneOf(c.x, c.z), o = zoneOffset(cw);
      const per = Math.min(2, need - have);
      (added[cw] ||= []).push({ type: 'camp', id: `quest_${d.id}_${i}_${k}`, monster: type, with: null, level: [c.level || 1, c.level || 1], count: [per, per],
        x: Math.round(c.x - o.ox), z: Math.round(c.z - o.oz), yaw: 0, radius: Math.min(8, c.radius || 6), quest: d.id, hunt: true });
      addedW.push({ type, x: c.x, z: c.z, count: per });
      have += per; k++;
    }
    report.push(`${d.id}#${i} ${type}: ${from} -> ${have} (need ${need})`);
  });
  for (const wid of Object.keys(mains)) writeFileSync(P(`data/vignettes/placements/${wid}.quest.json`), JSON.stringify({
    _doc: `Stream E (play-test 4 S14). Copies of camps already standing in world zone ${wid}, added where a kill / collect quest's area held fewer of its monster than the step needs (its count, capped at ${NEED_CAP}). Same ground and level as the camp copied (its id minus the quest_ prefix is the quest + step). Made by tools/content-hunts.mjs; js/sim/content.js merges it like <zone>.hunt.json; stream B's bake never reads it.`,
    zone: wid, terrainHash: mains[wid].terrainHash, placements: added[wid] || [] }, null, 1) + '\n');
  // 2. with the new camps: every type's areas
  L = (await quiet(() => loadLayouts([PROV]))).layouts[0];
  book = createQuestBook({ layout: L, zones: L.zones, rares: L.rares, jobs: null, rng: () => 0.3 });
  const areas = huntAreas(L.camps, L.zoneOf);
  writeFileSync(P(`data/quests/marks/${PROV}-hunts.json`), JSON.stringify({
    _doc: 'Stream E (play-test 4 S14). Where every monster type really spawns: the camps the server spawns (placements + .hunt.json + .quest.json + ring camps; named/rare encounters left out) grouped per type into areas (js/sim/hunts.js: camps < LINK_M apart join). World metres; `n` = monsters when the area is full, `camps`, `zone`, `lv` [lo, hi]. Largest first. Made by tools/content-hunts.mjs; the server computes the same areas at load (quests.js) and sends each kill / collect step\'s `areas`.',
    types: Object.fromEntries([...areas].sort(([a], [b]) => a.localeCompare(b))) }) + '\n');
  // 3. re-point E's marks
  const mf = `data/quests/marks/${PROV}.json`, marks = readJ(mf);
  let moved = 0;
  for (const d of book.defs.values()) {
    const m = marks.quests[d.id]; if (!m) continue;
    d.steps.forEach((st, i) => {
      if (!stepType(st) || !st.at) return;
      const nv = { zone: L.zoneOf(st.at.x, st.at.z), x: Math.round(st.at.x), z: Math.round(st.at.z), r: Math.round(st.at.r) };
      if (JSON.stringify(m.steps[i]) !== JSON.stringify(nv)) { m.steps[i] = nv; moved++; }
    });
  }
  marks._doc = marks._doc.replace(/ \(an area for kill\/collect steps:[^)]*\)/, ' (an area for kill/collect steps: the hunting area of that type js/sim/hunts.js picks — re-pointed by tools/content-hunts.mjs)');
  writeFileSync(P(mf), JSON.stringify(marks, null, 1) + '\n');
  console.log(report.join('\n'));
  console.log(`quest camps added: ${Object.values(added).reduce((a, l) => a + l.length, 0)} in ${Object.keys(added).length} zones; types with areas: ${areas.size}; marks re-pointed: ${moved}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
