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
import { startLine } from './content-rares.mjs';

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

export const CHAMP = Object.freeze({ road: 38, gap: 260, town: 60, minLevel: 2, perZone: 12, respawnMin: [4, 8], startFirst: 350, startGap: 600, startSide: 40,
  // one fixed modifier each, dealt in turn: the ones a newcomer can read at a glance (size, fire, frost, a pack)
  affixes: ['giant', 'fiery', 'packleader', 'frostbound', 'vicious', 'stormlash', 'ironclad', 'venomous', 'gilded', 'thorned'] });

/**
 * Roadside champions for every zone: [{ wid, rec (a placement record, zone metres), x, z (world) }]. Deterministic:
 * candidates in a fixed order (along each route, nearest the province hub first), greedy by spacing.
 */
export function roadsideChampions(L, routes, cfg = CHAMP, startLine = null) {
  const cell = 64, grid = new Map(), key = (x, z) => Math.floor(x / cell) + ':' + Math.floor(z / cell);
  for (const r of routes.routes || []) for (const p of r.pts || []) { const k = key(p[0], p[1]); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  const roadDist = c => { let d = Infinity; const i = Math.floor(c.x / cell), j = Math.floor(c.z / cell);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) for (const p of grid.get(a + ':' + b) || []) d = Math.min(d, Math.hypot(p[0] - c.x, p[1] - c.z));
    return d; };
  const towns = routes.towns || [], hub = routes.hub || { x: 0, z: 0 };
  const ok = c => !c.rank && !c.encounter && !c.warband && !c.vignette && !c.doorGuard && !c.filler && (c.level || 1) >= cfg.minLevel
    && roadDist(c) <= cfg.road && !towns.some(t => Math.hypot(t.x - c.x, t.z - c.z) < (t.r || 60) + cfg.town);
  const cands = L.camps.filter(ok).sort((a, b) => Math.hypot(a.x - hub.x, a.z - hub.z) - Math.hypot(b.x - hub.x, b.z - hub.z) || a.x - b.x || a.z - b.z);
  const out = [], per = {};
  // the start chain first: the walk every newcomer makes gets one every cfg.startGap m, road or no road (it is where
  // they WILL look), in the order they walk it; level and town rules still hold
  const first = [];
  if (startLine) {
    const plain = c => !c.rank && !c.encounter && !c.warband && !c.vignette && !c.doorGuard && !c.filler && (c.level || 1) >= cfg.minLevel && !towns.some(t => Math.hypot(t.x - c.x, t.z - c.z) < (t.r || 60) + cfg.town);
    const along = [];
    let walked = 0;
    for (let i = 1; i < startLine.length; i++) {
      const a = startLine[i - 1], b = startLine[i], d = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = 0; t < d; t += 20) along.push({ x: a.x + (b.x - a.x) * t / d, z: a.z + (b.z - a.z) * t / d, m: walked + t });
      walked += d;
    }
    let next = cfg.startFirst;
    for (const p of along) {
      if (p.m < next) continue;
      const c = L.camps.filter(k => plain(k) && Math.hypot(k.x - p.x, k.z - p.z) <= cfg.startSide).sort((x, y) => Math.hypot(x.x - p.x, x.z - p.z) - Math.hypot(y.x - p.x, y.z - p.z))[0];
      if (!c || first.some(o => Math.hypot(o.x - c.x, o.z - c.z) < cfg.startGap * 0.6)) continue;
      first.push(c); next = p.m + cfg.startGap;
    }
  }
  for (const c of [...first, ...cands]) {
    const wid = L.zoneOf(c.x, c.z); if (!/^z\d+_\d+$/.test(wid || '')) continue;
    const isFirst = first.includes(c) && !out.some(o => o.x === c.x && o.z === c.z);
    if (!isFirst && (per[wid] || 0) >= cfg.perZone) continue;
    if (!isFirst && out.some(o => Math.hypot(o.x - c.x, o.z - c.z) < cfg.gap)) continue;
    const o = zoneOffset(wid), n = (per[wid] = (per[wid] || 0) + 1);
    const affix = cfg.affixes[out.length % cfg.affixes.length];
    out.push({ wid, x: c.x, z: c.z, rec: { type: 'camp', id: `champ_${wid}_${n}`, monster: c.type, with: null, level: [c.level || 1, c.level || 1], count: [1, 1],
      x: Math.round(c.x - o.ox), z: Math.round(c.z - o.oz), yaw: 0, radius: 5, rank: 'champion', affixes: [affix], respawnMin: cfg.respawnMin, champion: true, hunt: true } });
  }
  return out;
}

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
  // 1b. play-test 5 T10 ("rare monsters much more frequent — I still haven't seen one"): ROADSIDE CHAMPIONS. A rolled
  // champion needs level `chance.minLevel`+ and luck; these simply stand there. A copy of an ordinary camp the server
  // already spawns within CHAMP.road m of a road people walk (the routes file), one body, rank 'champion' with one
  // fixed modifier — so it is bigger, tinted and has a special (js/rules/affixes.js). Spread CHAMP.gap m apart, never
  // within CHAMP.town m of a town's edge, never under level CHAMP.minLevel (the first quest's ground stays gentle).
  const champs = roadsideChampions(L, readJ(`data/provinces/${PROV}-routes.json`), CHAMP, startLine(readJ(`data/quests/marks/${PROV}.json`), Infinity));
  for (const c of champs) (added[c.wid] ||= []).push(c.rec);
  // 1c. play-test 5 T25: the town anglers stand on the bank (tools/content-pools.mjs chose the spots from B's water);
  // an npc record like the placer's own, so the server gives them a body, their greeting, their quests and their shop
  let anglers = [];
  if (existsSync(P('data/provinces/angling-pools.json'))) anglers = readJ('data/provinces/angling-pools.json').anglers || [];
  // owner feedback 8 (W12 / W27): `quests` = how many quests the NPC hands out (data/quests/marks/givers.json) and `titled`
  const givers = existsSync(P('data/quests/marks/givers.json')) ? (readJ('data/quests/marks/givers.json').npcs || {}) : {};
  const mark = id => ({ quests: givers[id] ? givers[id].gives.length : 0, titled: givers[id] ? !!givers[id].titled : true });
  for (const a of anglers) { const o = zoneOffset(a.zone); (added[a.zone] ||= []).push({ type: 'npc', id: a.id, name: a.name, role: 'angler', at: a.town, x: a.x - o.ox, z: a.z - o.oz, yaw: a.yaw, angler: true, ...mark(a.id) }); }
  // 1d. owner feedback 8 — W5: the carter and the parked ox cart outside every town's main gate (data/provinces/carts.json
  // `stops`, tools/content-towns.mjs; already zone metres); W1: the town guards at their posts (data/provinces/guards.json
  // `posts`). New row types `cart` and `guard`: stream A spawns them, B's bake never sees this file.
  let carts = 0, guards = 0;
  if (existsSync(P('data/provinces/carts.json'))) for (const s of readJ('data/provinces/carts.json').stops || []) {
    (added[s.zone] ||= []).push({ type: 'npc', id: s.carter.id, name: s.carter.name, role: 'carter', at: s.town, x: s.carter.x, z: s.carter.z, yaw: s.carter.yaw, cart: s.id, placedBy: 'content-towns', ...mark(s.carter.id) });
    added[s.zone].push({ type: 'cart', id: s.cart.id, name: 'Longroad Cart', model: s.cart.model, vehicle: s.cart.model, town: s.town, carter: s.carter.id, x: s.cart.x, z: s.cart.z, yaw: s.cart.yaw, radius: 2.2 });
    carts++;
  }
  if (existsSync(P('data/provinces/guards.json'))) for (const g of readJ('data/provinces/guards.json').posts || []) {
    (added[g.zone] ||= []).push({ type: 'guard', id: g.id, name: g.name, role: 'guard', rank: g.rank, tier: g.tier, town: g.town, post: g.post, ...(g.gate ? { gate: g.gate } : {}), x: g.x, z: g.z, yaw: g.yaw, titled: false });
    guards++;
  }
  console.log(`carters + carts: ${carts}; guard posts: ${guards}`);
  for (const wid of Object.keys(mains)) writeFileSync(P(`data/vignettes/placements/${wid}.quest.json`), JSON.stringify({
    _doc: `Stream E (play-test 4 S14). Copies of camps already standing in world zone ${wid}, added where a kill / collect quest's area held fewer of its monster than the step needs (its count, capped at ${NEED_CAP}). Same ground and level as the camp copied (its id minus the quest_ prefix is the quest + step). Made by tools/content-hunts.mjs; js/sim/content.js merges it like <zone>.hunt.json; stream B's bake never reads it.`,
    zone: wid, terrainHash: mains[wid].terrainHash, placements: added[wid] || [] }, null, 1) + '\n');
  console.log(`anglers: ${anglers.length}; roadside champions: ${champs.length} (${Object.entries(champs.reduce((a, c) => (a[c.wid] = (a[c.wid] || 0) + 1, a), {})).map(([w, n]) => w + ' ' + n).join(', ')})`);
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
  // 3c-pre. owner feedback 8 (W5): marks for quests given by a carter and for `ride` steps (the cart stop you ride TO)
  if (existsSync(P('data/provinces/carts.json'))) {
    const stops = readJ('data/provinces/carts.json').stops || [];
    const at = s => { const o = zoneOffset(s.zone); return { zone: s.zone, x: Math.round(s.carter.x + o.ox), z: Math.round(s.carter.z + o.oz), r: 6 }; };
    for (const d of book.defs.values()) {
      const giverStop = stops.find(s => s.carter.id === d.giver);
      const rides = d.steps.some(st => st.kind === 'ride');
      if (!giverStop && !rides) continue;
      const m = (marks.quests[d.id] ||= { zone: giverStop ? giverStop.zone : null, giver: null, steps: [] });
      if (giverStop) { m.zone = giverStop.zone; m.giver = at(giverStop); }
      d.steps.forEach((st, i) => { if (st.kind !== 'ride') return; const from = stops.find(s => s.id === st.from) || giverStop, to = stops.find(s => s.id === st.to); m.steps[i] = from ? { ...at(from), to: to ? at(to) : null } : (to ? at(to) : null); });
    }
  }
  // 3b. play-test 5 T25: marks for the angling quests (the placer knows neither the anglers nor `catch` / `cook` steps)
  if (existsSync(P('data/provinces/angling-pools.json')) && existsSync(P('data/quests/angling.json'))) {
    const AP = readJ('data/provinces/angling-pools.json'), AQ = readJ('data/quests/angling.json');
    const who = id => { const a = (AP.anglers || []).find(x => x.id === id); return a ? { zone: a.zone, x: a.x, z: a.z, r: 6 } : null; };
    const pools = Object.entries(AP.zones).flatMap(([zone, l]) => l.map(p => ({ ...p, zone })));
    const fires = Object.entries(mains).flatMap(([wid, m]) => { const o = zoneOffset(wid); return m.placements.filter(p => p.type === 'npc' && p.role === 'innkeeper').map(p => ({ zone: wid, x: Math.round(p.x + o.ox), z: Math.round(p.z + o.oz), r: 12 })); });
    const nearest = (list, ref) => list.slice().sort((a, b) => Math.hypot(a.x - ref.x, a.z - ref.z) - Math.hypot(b.x - ref.x, b.z - ref.z))[0] || null;
    for (const qq of AQ.quests || []) {
      const giver = who(qq.giver); if (!giver) continue;
      const steps = (qq.steps || []).map(sp => {
        if (sp.kind === 'talk' || sp.kind === 'deliver') return who(sp.npc);
        if (sp.kind === 'visit' && sp.at) return { zone: L.zoneOf(sp.at.x, sp.at.z), x: Math.round(sp.at.x), z: Math.round(sp.at.z), r: sp.at.r || 14 };
        if (sp.kind === 'catch') { const p = nearest(pools.filter(x => x.tier === 1 || !sp.pool), giver); return p ? { zone: p.zone, x: p.shore.x, z: p.shore.z, r: 60 } : null; }
        if (sp.kind === 'cook') return nearest(fires, giver);
        return null;
      });
      const nv = { zone: giver.zone, giver, steps };
      if (JSON.stringify(marks.quests[qq.id]) !== JSON.stringify(nv)) { marks.quests[qq.id] = nv; moved++; }
      marks.missing = (marks.missing || []).filter(m => !m.startsWith(qq.id + '#') || !steps[+m.split('#')[1]]);
    }
  }
  marks._doc = marks._doc.replace(/ \(an area for kill\/collect steps:[^)]*\)/, ' (an area for kill/collect steps: the hunting area of that type js/sim/hunts.js picks — re-pointed by tools/content-hunts.mjs)');
  writeFileSync(P(mf), JSON.stringify(marks, null, 1) + '\n');
  console.log(report.join('\n'));
  console.log(`quest camps added: ${Object.values(added).reduce((a, l) => a + l.length, 0)} in ${Object.keys(added).length} zones; types with areas: ${areas.size}; marks re-pointed: ${moved}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
