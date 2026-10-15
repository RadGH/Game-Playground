// Round 8, W9 (stream P-core) — CONTENT AND PLACEMENT: the made files are up to date with the bake, every node stands
// somewhere a walker can reach and nothing else already is, Torborhold's gate has copper in sight, the trainer keeps
// off the main street, and the economy rule (each gathering / crafting hour = 70-100% of an hour of questing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseNav, parseTerrain, NAV } from '../../js/rules/terrain-read.js';
import { PLACE, tierMix, logMix, LOG_TIER2_FROM } from '../../tools/content-professions.mjs';

const ROOT = new URL('../../', import.meta.url);
const J = f => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8'));
const content = J('data/provinces/professions.json'), nodes = J('data/provinces/professions-nodes.json'), numbers = J('data/rules/professions.json');
const sheet = J('data/provinces/torbor_downs.json'), map = J('data/world/province-map.json').provinces.torbor_downs.map;
const ZM = 2048;
const origin = wid => { const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number); return [zx * ZM, zy * ZM]; };
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)); return Math.hypot(px - ax - u * dx, pz - az - u * dz); };

test('the made files are what tools/content-professions.mjs makes from the current bake and catalog', () => {
  let out = '';
  try { out = execFileSync(process.execPath, [fileURLToPath(new URL('tools/content-professions.mjs', ROOT)), '--check'], { encoding: 'utf8' }); }
  catch (err) { assert.fail('stale — run `node tools/content-professions.mjs`:\n' + (err.stdout || err.message).split('\n').slice(-4).join('\n')); }
  assert.match(out, /0 file\(s\) would change/);
});

test('every zone has all three kinds of node, in the tiers its level band calls for', () => {
  assert.equal(Object.keys(nodes.zones).length, 16);
  let total = 0;
  for (const [eid, wid] of Object.entries(map)) {
    const list = nodes.zones[wid], m = nodes.meta[wid], mix = tierMix(sheet.zones[eid].band[1]);
    assert.ok(m.mining >= 40 && m.logging >= 30 && m.foraging >= 40, `${eid}: ${JSON.stringify(m)}`);
    total += list.length;
    // round 11 (live #24): marked trees follow their own rule — a tier-2+ tree only in a zone whose band starts at LOG_TIER2_FROM
    const band = sheet.zones[eid].band, logs = list.filter(n => content.nodeKinds[n.k].prof === 'logging'), rest = list.filter(n => content.nodeKinds[n.k].prof !== 'logging');
    const share = (l, t) => l.filter(n => content.nodeKinds[n.k].tier === t).length / l.length;
    for (const t of [1, 2, 3]) assert.ok(Math.abs(share(rest, t) - mix[t - 1]) < 0.06, `${eid}: tier ${t} share ${share(rest, t).toFixed(2)} vs ${mix[t - 1]}`);
    const lm = logMix(band);
    for (const t of [1, 2, 3]) assert.ok(Math.abs(share(logs, t) - lm[t - 1]) < 0.06, `${eid}: tree tier ${t} share ${share(logs, t).toFixed(2)} vs ${lm[t - 1]}`);
    if (band[0] < LOG_TIER2_FROM) assert.ok(logs.every(n => content.nodeKinds[n.k].tier === 1 && content.nodeKinds[n.k].look.model === 'tree'), `${eid} (levels ${band.join('-')}): every marked tree is choppable at Logging 1`);
    for (const n of list) assert.ok(content.nodeKinds[n.k] && /^z\d+_\d+_\d+$/.test(n.id) && n.v >= 0 && n.v <= 3, n.id);
    assert.equal(new Set(list.map(n => n.id)).size, list.length, 'ids are unique');
  }
  assert.equal(total, nodes.nodes);
  assert.ok(total > 2500 && total < 4000, 'about four in view at once: ' + total);
  for (const k of Object.values(content.nodeKinds)) { assert.ok(['boulder', 'tree', 'herb', 'mushroom', 'fibre'].includes(k.look.model) && /^#[0-9a-f]{6}$/.test(k.look.tint) && k.look.size > 0, k.id); }
  for (const k of Object.values(content.nodeKinds).filter(k => k.prof === 'mining')) assert.ok(k.look.size >= 1.5 && k.look.size <= 2.2 && k.look.n >= 4, `${k.id}: a player-sized boulder with ore chunks`);
});

test('no node stands on a road, in a town, in water, in a building, on a cliff, in a field or on top of another', () => {
  for (const wid of Object.values(map)) {
    const nav = parseNav(readFileSync(new URL(`data/zones/${wid}/nav.bin`, ROOT))), t = parseTerrain(readFileSync(new URL(`data/zones/${wid}/terrain.bin`, ROOT)));
    const baked = J(`data/zones/${wid}/placements.json`).placements;
    const fields = baked.filter(p => p.kind === 'field' && p.data.poly).map(p => p.data.poly);
    const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const mains = baked.filter(p => p.kind === 'town_wall').flatMap(p => (p.data.gates || []).filter(g => g.main).map(g => g.main));
    const [ox, oz] = origin(wid), list = nodes.zones[wid];
    for (const n of list) {
      const x = n.x - ox, z = n.z - oz, b = nav.bits[Math.round(z / nav.step) * nav.size + Math.round(x / nav.step)];
      assert.ok(b & NAV.WALK, `${n.id} is not walkable`);
      assert.equal(b & (NAV.ROAD | NAV.TOWN | NAV.BUILDING | NAV.SHALLOW | NAV.DEEP | NAV.STEEP | NAV.SOLID), 0, `${n.id} bits ${b}`);
      assert.ok(t.waterAt(x, z).depth <= 0.05 && t.slopeAt(x, z) <= 24, n.id);
      assert.ok(!fields.some(p => inPoly(p, x, z)), `${n.id} is in a crop field`);
      for (const m of mains) for (let i = 0; i + 1 < m.pts.length; i++) assert.ok(segDist(x, z, m.pts[i][0], m.pts[i][1], m.pts[i + 1][0], m.pts[i + 1][1]) > m.width / 2 + 3, `${n.id} is in a main street`);
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z) >= PLACE.gapAny - 0.01, `${list[i].id} and ${list[j].id} overlap`);
  }
});

test('Torborhold: copper boulders within 150 m of the gate road, and the prospector beside the main street just inside the gate', () => {
  const wid = map[sheet.grid.start], [ox, oz] = origin(wid);
  const baked = J(`data/zones/${wid}/placements.json`).placements;
  const tr = content.trainers.find(t => t.id === 'prospector_torborhold');
  assert.ok(tr && tr.role === 'prospector' && tr.name && tr.greeting);
  const wall = baked.find(p => p.kind === 'town_wall' && p.data.name === 'Torborhold'), gate = wall.data.gates.find(g => g.id === tr.gate);
  assert.ok(gate && gate.main && gate.road, 'he stands at a gate a world road comes in by');
  const starters = nodes.zones[wid].filter(n => n.s);
  assert.ok(starters.length >= 4 && starters.filter(n => n.k === 'copper').length >= 3 && starters.some(n => n.k === 'tin'), JSON.stringify(starters));
  const nav = parseNav(readFileSync(new URL(`data/zones/${wid}/nav.bin`, ROOT)));
  for (const n of starters) {
    const x = n.x - ox, z = n.z - oz;
    assert.ok(Math.hypot(x - gate.x, z - gate.z) <= 150, `${n.id} is ${Math.round(Math.hypot(x - gate.x, z - gate.z))} m from the gate`);
    let road = Infinity;
    for (let dz = -40; dz <= 40; dz += 2) for (let dx = -40; dx <= 40; dx += 2) if (nav.bits[Math.round((z + dz) / nav.step) * nav.size + Math.round((x + dx) / nav.step)] & NAV.ROAD) road = Math.min(road, Math.hypot(dx, dz));
    assert.ok(road <= 42, `${n.id} is within sight of the road (${Math.round(road)} m)`);
  }
  // the trainer: inside the wall, within 25 m of the gate, clear of the main street and of buildings
  const x = tr.x - ox, z = tr.z - oz;
  assert.ok(Math.hypot(x - gate.x, z - gate.z) <= 25 && Math.hypot(x - wall.x, z - wall.z) < wall.data.radius, 'just inside the gate');
  let d = Infinity; for (let i = 0; i + 1 < gate.main.pts.length; i++) d = Math.min(d, segDist(x, z, gate.main.pts[i][0], gate.main.pts[i][1], gate.main.pts[i + 1][0], gate.main.pts[i + 1][1]));
  assert.ok(d >= gate.main.width / 2 + 1.5 && d <= gate.main.width / 2 + 4, `beside the street, not in it (${d.toFixed(1)} m from its middle)`);
  const b = nav.bits[Math.round(z / nav.step) * nav.size + Math.round(x / nav.step)];
  assert.ok((b & NAV.WALK) && !(b & (NAV.BUILDING | NAV.SOLID)));
  // the chain's first mark is where the boulders are
  const q = J('data/quests/professions.json');
  const at = q.quests[0].steps[0].at;
  assert.ok(starters.every(n => Math.hypot(n.x - at.x, n.z - at.z) <= at.r + 30), 'the quest mark covers the starter boulders');
  assert.deepEqual(q.quests.map(x => x.id), ['prof_three_good_swings', 'prof_bronze_not_copper', 'prof_an_edge_on_it']);
  assert.ok(J('data/quests/test.json').include.includes('professions.json'));
  for (const quest of q.quests) assert.ok(!/muster|ember|veil/i.test(JSON.stringify(quest)), quest.id);
});

test('trainers and stations: every hub town has a forge, a workbench, a still and a fire, and someone teaches all eight learned trades', () => {
  const offices = J('data/provinces/offices.json');
  const learned = ['mining', 'logging', 'foraging', 'skinning', 'smithing', 'outfitting', 'alchemy', 'tempering'];
  for (const t of Object.values(offices.towns)) {
    const roles = t.offices.map(o => o.role);
    const trains = new Set(roles.flatMap(r => (numbers.roles[r] || {}).trains || [])), stations = new Set(roles.flatMap(r => (numbers.roles[r] || {}).stations || []));
    for (const id of learned) assert.ok(trains.has(id), `${t.name}: nobody teaches ${id}`);
    for (const id of ['smithing', 'outfitting', 'alchemy', 'cooking', 'tempering']) assert.ok(stations.has(id), `${t.name}: no station for ${id}`);
  }
});

const FLOOR_IDS = ['copper_ore', 'tin_ore', 'ash_log', 'meadowmint', 'flax', 'light_hide', 'game_meat', 'pine_resin'];
test('ECONOMY RULE: an hour of each gathering trade and of gather-then-refine earns 70-100% of an hour of questing; skinning is an add-on', async () => {
  const E = await import('../../tools/sim-economy.mjs');
  const r = await E.simulate({});
  const rows = await E.extraRows(r);
  assert.ok(rows.length >= 20 && !rows.some(x => x.error), JSON.stringify(rows.find(x => x.error) || {}));
  const kinds = new Set(rows.map(x => x.activity));
  for (const k of ['mining', 'logging', 'foraging', 'mining + smithing', 'foraging + outfitting', 'skinning (add-on)']) assert.ok(kinds.has(k), k);
  for (const x of rows) {
    if (x.addOn) { assert.ok(x.share >= 0.04 && x.share <= (x.level === 1 && FLOOR_IDS.every(id => content.materials[id].price === 1) ? 0.45 : 0.25), `L${x.level} ${x.activity}: ${Math.round(x.share * 100)}% (a useful extra on top of hunting, never a second income)`); continue; }
    // round 11 (live #9): a high score brings half as much again and a find, so raw pieces sell for less. At level 1 every
    // raw piece is already at the 1-gold floor and cannot be priced finer — there the hour may run to 120% (skinning 45%)
    const floor = x.level === 1 && FLOOR_IDS.every(id => content.materials[id].price === 1);
    if (x.addOn) continue;
    assert.ok(x.share >= 0.7 && x.share <= (floor ? 1.2 : 1.0), `L${x.level} ${x.activity}: ${Math.round(x.share * 100)}% of questing (${x.goldPerHour} gold) — ${x.note}`);
  }
  // refining is worth the trip, and never more than a fifth on top
  for (const m of Object.values(content.materials).filter(m => m.made)) {
    const rc = content.recipes.find(q => q.makes && q.makes.id === m.id), cost = rc.needs.reduce((a, nd) => a + content.materials[nd.id].price * nd.n, 0);
    assert.ok(m.price > cost && m.price <= Math.max(cost + 1, Math.ceil(cost * 1.26)), `${m.id}: ${cost} -> ${m.price}`);
  }
});
